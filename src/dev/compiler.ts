import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { AnyMap, encodedMap, type SectionedSourceMapInput } from '@jridgewell/trace-mapping';
import type {
  BundleError,
  FunctionPluginHooks,
  InputOptions,
  Plugin,
  TransformPluginContext,
  TransformResult,
  RolldownBuild,
  RolldownError,
  RolldownOutput,
  rolldown as Rolldown,
} from 'rolldown';
import { createTransformPlugin, type PlacementFile } from './transform.ts';
import { createScopeEffectsPlugin } from './scope-effects.ts';
import { loadCatalog, type NativeModuleUse } from './modules/catalog.ts';
import { createModuleSpecPlugin, type LinkedModules } from './modules/plugin.ts';
import { createAssetPlugin, type BundledAsset } from './assets.ts';
import { createIntlFormatsPlugin } from './intl-formats.ts';
import { createSymbolPlugin } from './symbols.ts';
import {
  fileRoutes,
  LAYOUT,
  readLayout,
  readRoute,
  routeChunk,
  ROUTE_TYPES,
  routeSource,
  routeTypes,
  type FileRoute,
} from './file-routes.ts';
import { createNativeStylePlugin } from '../style/compiler.ts';
import type { Platform } from '../style/stylesheet.ts';

/**
 * One entry per bundler error: message, where it happened and which plugin
 * reported it, no stack. Without a `loc`, Rolldown's module `id` still names
 * the file (virtual `\0` modules excepted).
 */
export interface Diagnostic {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  frame?: string;
  plugin?: string;
}

export function toDiagnostics(error: BundleError): Diagnostic[] {
  const errors: RolldownError[] = error.errors?.length ? error.errors : [error];
  const seen = new Set<string>();

  return errors
    .map(({ message, loc, frame, id, plugin }) => {
      const file = loc?.file ?? (id && !id.startsWith('\0') ? id : undefined);

      return {
        message: String(message).split('\n')[0],
        ...(file && { file }),
        ...(loc && { line: loc.line, column: loc.column }),
        ...(frame && { frame }),
        ...(plugin && { plugin }),
      };
    })
    .filter((diagnostic: Diagnostic) => {
      const key = JSON.stringify(diagnostic);

      return !seen.has(key) && seen.add(key);
    });
}

function compileError(error: BundleError) {
  const diagnostics = toDiagnostics(error);
  const where = ({ file, line, column }: Diagnostic) =>
    file ? `${file}${line ? `:${line}:${column}` : ''} ` : '';

  return Object.assign(new Error(diagnostics.map((d) => where(d) + d.message).join('\n')), {
    diagnostics,
  });
}

/** Under `strict`, code that runs on the JS thread when it could run on the UI thread is an error. */
function failFallbacks(placement: readonly PlacementFile[]) {
  const diagnostics: Diagnostic[] = placement.flatMap(({ file, entries }) =>
    entries.flatMap(({ site, line, column, reason }) =>
      reason
        ? [{ message: `${site} runs on the JS thread: it ${reason}`, file, line, column }]
        : [],
    ),
  );

  if (!diagnostics.length) return;

  const lines = diagnostics.map(
    ({ file, line, column, message }) => `${file}:${line}:${column} ${message}`,
  );

  throw Object.assign(
    new Error(
      `strict placement: ${diagnostics.length} on the JS thread (docs/placement.md)\n` +
        lines.join('\n'),
    ),
    { diagnostics },
  );
}

/** A chunk's name, as the kernel requires it: its file name without `.js`. */
const chunkName = (fileName: string) => fileName.replace(/\.js$/, '');

/** The chunk the app starts from: the root, which renders the app. */
const ROOT_CHUNK = 'app';

/**
 * CommonJS chunks, each wrapped so its script only defines it: the kernel
 * runs it on its first require (src/runtime/chunks.ts). `dir` is where the
 * bundle is written; source map paths are relative to it.
 */
async function bundleEntry(
  rolldown: typeof Rolldown,
  options: InputOptions,
  dir: string,
): Promise<RolldownOutput> {
  let bundle: RolldownBuild | undefined;

  try {
    bundle = await rolldown(options);

    return await bundle.generate({
      format: 'cjs',
      // A route chunk's exports are read by name: `default` and `options`.
      exports: 'named',
      // Chunks load through the kernel's synchronous require, never a promise.
      dynamicImportInCjs: false,
      entryFileNames: '[name].js',
      chunkFileNames: '[name]-[hash].js',
      banner: (chunk) =>
        `__kuito.defineChunk(${JSON.stringify(chunkName(chunk.fileName))}, function (require, module, exports) {`,
      footer: '});',
      sourcemap: true,
      dir,
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw compileError(error);
  } finally {
    await bundle?.close();
  }
}

const UI_ENTRY = fileURLToPath(new URL('../ui/index.ts', import.meta.url));
/** Intl.PluralRules, which Hermes lacks (docs/web-apis.md#intl): the entry's first import, before any app module. */
const INTL_INSTALL = fileURLToPath(new URL('../native/intl/install.ts', import.meta.url));
const ROUTES_ID = '\0kuito:routes.tsx';

/** What resets the chunk registry before the chunks a script defines. */
const START_PREFIX = 'globalThis.__kuito.resetChunks();\n';
/** The lines START_PREFIX takes, where the first chunk's code and map start. */
const START_LINES = START_PREFIX.split('\n').length - 1;

/** One map of scripts joined into one: each map from the line its script starts on. */
function sectionedMap(parts: readonly { line: number; map: string }[]) {
  const sectioned: SectionedSourceMapInput = {
    version: 3,
    sections: parts.map(({ line, map }) => ({ offset: { line, column: 0 }, map: JSON.parse(map) })),
  };

  return JSON.stringify(encodedMap(new AnyMap(sectioned)));
}

/** The app's chunks as one script: a Live Patch defines them all, then starts the root. */
function revisionScript(chunks: readonly { code: string }[], start: string) {
  const offsets: number[] = [];
  let line = START_LINES;

  for (const chunk of chunks) {
    offsets.push(line);
    line += chunk.code.split('\n').length - 1;
  }

  return { code: START_PREFIX + chunks.map((chunk) => chunk.code).join('') + start, offsets };
}

const startScript = `globalThis.__kuito.requireChunk(${JSON.stringify(ROOT_CHUNK)});\n`;

/** The package name app code imports Kuito by: what the route types augment. */
const UI_PACKAGE = 'kuito';

/** What a test imports the headless host's API by; the host provides it. */
const TESTS_PACKAGE = 'kuito/tests';

/**
 * The app module an app directory's files declare (docs/navigation.md), and
 * its routes, each the entry of a chunk. The types of its `routes` go
 * beside them, rewritten only when they change.
 */
function appRoutes(directory: string): { source: string; routes: FileRoute[] } {
  const files = readdirSync(directory, { recursive: true, encoding: 'utf8' }).map((file) =>
    file.split(sep).join('/'),
  );
  const layout = files.find((file) => LAYOUT.test(file));
  const { tabs, linking } = layout
    ? readLayout(readFileSync(join(directory, layout), 'utf8'), join(directory, layout))
    : { tabs: null, linking: false };
  const tree = fileRoutes(files, tabs, (file) =>
    readRoute(readFileSync(join(directory, file), 'utf8'), join(directory, file)),
  );
  const types = routeTypes(tree, { ui: UI_PACKAGE });
  const typesFile = join(directory, ROUTE_TYPES);

  if (!existsSync(typesFile) || readFileSync(typesFile, 'utf8') !== types)
    writeFileSync(typesFile, types);

  return {
    source: routeSource(tree, { ui: UI_ENTRY, linking }),
    routes: [...tree.tabs.flatMap((tab) => tab.routes), ...tree.routes],
  };
}

/** The nearest directory holding the app's kuito.config.ts, or the working directory. */
function appRoot(entry: string): string {
  for (let directory = dirname(entry); ; directory = dirname(directory)) {
    if (existsSync(join(directory, 'kuito.config.ts'))) return directory;
    if (dirname(directory) === directory) return process.cwd();
  }
}

interface SourceCompilerOptions {
  /**
   * The platform the bundle runs on: `platform` is this constant in it, so
   * the other platform's branches, `@platform` blocks included, are dropped.
   */
  platform: Platform;
  outputDir?: string;
  /**
   * The app's root, which bundled images are named from: by default the
   * nearest directory above the entry with a kuito.config.ts, so the dev
   * server and the shell's build name images alike wherever they run.
   */
  root?: string;
  /**
   * The entry is a test file for the headless host (docs/testing.md): it
   * runs for its own effects, rendering nothing itself, and `kuito/tests`
   * and Node's modules stay outside the bundle for the host to provide.
   */
  test?: boolean;
  /** `strict` in kuito.config.ts: code that falls back to the JS thread fails the build. */
  strict?: boolean;
  /**
   * The shell ships the UI bundle as bytecode (a release device build): the
   * root chunk names it by the SHA-1 of its source rather than carrying it.
   */
  shippedUI?: boolean;
}

interface CompileResult {
  path: string;
  /** The revision as one script: every chunk defined, then the root started (a Live Patch). */
  code: string;
  /** The root's chunk alone, started: what a release shell evaluates first. */
  start: string;
  /** `start`'s source map, its sources relative to the output directory. */
  startMap: string | null;
  /** Every chunk's script, which defines it, and its map; a release shell loads each by name. */
  chunks: { name: string; code: string; map: string | null }[];
  /** The bundle's source map, written beside it as `<path>.map`. */
  map: string | null;
  /** Every bundled module's UI-thread functions: the app's UI bundle. */
  ui: string;
  /** `ui`'s map, its sources absolute. */
  uiMap: string;
  /** What the UI runtime names `ui` in its stacks: `kuito://ui/<hash>`. */
  uiUrl: string;
  /** sha1 of `code`: a build whose output matches the last one is the same revision. */
  hash: string;
  /** Names this output; a rebuild with the same output keeps it. */
  revision: number;
  watched: string[];
  /** Watched for any file added or removed: an app directory's routes. */
  directories: string[];
  /** The native modules the bundle requires: what its shell is built with. */
  nativeModules: NativeModuleUse[];
  /** The ids of the module functions the bundle calls: its shell's link table. */
  links: number[];
  /** Names the ids' numbering: a shell linked under another hash needs a rebuild. */
  linkHash: string;
  /** The images the bundle imports: what its shell is built with. */
  assets: BundledAsset[];
  /** The modules whose Kuito transforms ran in this build; the rest reused their last result. */
  transformed: string[];
  /** What the bundle's modules compile to but likely do wrong, by file and line. */
  warnings: Diagnostic[];
  /** Per file, what touches the UI thread's state and where it runs (docs/placement.md). */
  placement: PlacementFile[];
}

type Transform = (
  this: TransformPluginContext,
  ...args: Parameters<FunctionPluginHooks['transform']>
) => Promise<TransformResult>;

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

/**
 * `plugin` with its transform memoized per module: while a module's source
 * is unchanged, the plugin's last result for it comes back without running
 * again. The plugin instance lives across builds, so the per-module state it
 * keeps (UI-thread code, native module calls) stays current with it.
 */
function memoized(plugin: Plugin, ran: Set<string>): Plugin {
  const transform = plugin.transform;

  if (typeof transform !== 'function')
    throw new Error(`${plugin.name}: only a plain transform function can be memoized`);

  const results = new Map<string, { hash: string; result: TransformResult }>();
  const memo: Transform = async function (source, id, meta) {
    const hash = sha1(source);
    const last = results.get(id);

    if (last?.hash === hash) return last.result;

    ran.add(id);

    const result = await transform.call(this, source, id, meta);

    results.set(id, { hash, result });

    return result;
  };

  return { ...plugin, transform: memo };
}

/** The spec modules whose functions the bundle calls: each is a module its shell includes. */
function specUses({ ids, catalog }: LinkedModules): NativeModuleUse[] {
  const called = new Set(ids);
  const modules = new Map<string, NativeModuleUse>();

  for (const { id, module, member } of catalog?.members ?? [])
    if (called.has(id) && !modules.has(module.name))
      modules.set(module.name, {
        name: module.name,
        file: catalog?.byName.get(module.name)?.path ?? module.file,
        line: member.line,
      });

  return [...modules.values()];
}

/**
 * The development compiler: it lives as long as the Live Patch session, so a
 * rebuild reruns Kuito's transforms only for the modules that changed, and
 * output identical to the last build is the same revision, written once.
 * Rolldown's own `watch()` reruns every transform on each rebuild and brings
 * a second file watcher; the session's watcher drives this one instead.
 */
export function createSourceCompiler({
  platform,
  outputDir = 'dist/live',
  root,
  test = false,
  strict = false,
  shippedUI = false,
}: SourceCompilerOptions) {
  const directory = resolve(outputDir);
  const virtualId = '\0kuito:component-entry';
  // Kept across builds with the plugin instances that fill them; each build
  // reads only the entries of the modules in its bundle.
  const uiModules = new Map<string, { code: string; map: string | null }>();
  const warnings = new Map<string, Diagnostic[]>();
  const placements = new Map<string, PlacementFile>();
  const linked: LinkedModules = { ids: [], catalog: null };
  const assets: BundledAsset[] = [];
  // Per build.
  const discoveredFiles = new Set<string>();
  const transformed = new Set<string>();
  let entrySource = '';
  let appDirectory = '';
  let routed = false;
  let app: ReturnType<typeof appRoutes> | null = null;
  let last: CompileResult | null = null;
  let sequence = 0;

  const before: Plugin[] = [
    createIntlFormatsPlugin(),
    // A spec compiles to its stubs before any pass reads it.
    createModuleSpecPlugin(() => loadCatalog(appDirectory), linked),
    // Before JSX compiles: it reads each Symbol's name as written.
    memoized(createSymbolPlugin(), transformed),
    // Before the component transform: it reads each call where it was written.
    memoized(createScopeEffectsPlugin(), transformed),
  ];
  const after: Plugin[] = [
    createNativeStylePlugin({ platform, onFile: (file) => discoveredFiles.add(file) }),
    {
      name: 'kuito-component-entry',
      resolveId(id: string) {
        if (id === 'kuito:component-entry') return virtualId;
        if (id === ROUTES_ID) return id;
      },
      load(id: string) {
        if (id === ROUTES_ID && app) return { code: app.source, moduleType: 'tsx' as const };

        if (id !== virtualId) return null;

        // The test's own code only defines tests: the UI-thread functions
        // load before any of them renders.
        const intl = `import ${JSON.stringify(INTL_INSTALL)};\n`;
        const loadUI =
          `globalThis.__kuito.${shippedUI ? 'loadShippedUI' : 'loadUI'}` +
          `('KUITO_UI_BUNDLE_PLACEHOLDER','KUITO_UI_URL_PLACEHOLDER');\n`;

        if (test) return intl + `import ${JSON.stringify(entrySource)};\n` + loadUI;

        return (
          intl +
          `import App from ${JSON.stringify(routed ? ROUTES_ID : entrySource)};\n` +
          loadUI +
          `globalThis.__kuito.patch('kuito.app',function(api){` +
          `api.render(globalThis.__kuitoJSX(App,{}));});`
        );
      },
    },
    memoized(
      createTransformPlugin({
        modules: uiModules,
        warnings,
        placements,
        platform,
        isSpec: (path) => linked.catalog?.byFile.has(path) ?? false,
      }),
      transformed,
    ),
    {
      name: 'kuito-dependency-tracking',
      transform(_source: string, id: string) {
        if (id.startsWith('/') && !id.includes('node_modules')) discoveredFiles.add(id);
        return null;
      },
    },
  ];

  return async function compile(entry: string): Promise<CompileResult> {
    const { rolldown } = await import('rolldown');

    entrySource = resolve(entry);
    appDirectory = resolve(root ?? appRoot(entrySource));
    routed = statSync(entrySource).isDirectory();
    app = routed ? appRoutes(entrySource) : null;
    discoveredFiles.clear();
    discoveredFiles.add(entrySource);
    transformed.clear();

    const output = await bundleEntry(
      rolldown,
      {
        input: {
          [ROOT_CHUNK]: 'kuito:component-entry',
          ...Object.fromEntries(
            (app?.routes ?? []).map((route) => [routeChunk(route), join(entrySource, route.file)]),
          ),
        },
        external: test ? [TESTS_PACKAGE, /^node:/] : [],
        plugins: [
          ...before,
          // Images are named from the app's root, which the entry decides.
          createAssetPlugin({
            root: appDirectory,
            assets,
            onFile: (file) => discoveredFiles.add(file),
          }),
          ...after,
        ],
        transform: {
          jsx: { runtime: 'classic', pragma: '__kuitoJSX', pragmaFrag: '__kuitoFragment' },
          // `src/ui/index.ts` reads it into `platform`, a constant Rolldown
          // inlines, so a branch for the other platform is dead code.
          define: { __KUITO_PLATFORM__: JSON.stringify(platform) },
          // What Hermes V1 compiles on both platforms. It rejects only async
          // generators, which ES2022 leaves as written (docs/async.md).
          target: 'es2022',
        },
        // Kuito owns JSX compilation; an app's tsconfig must not change it.
        tsconfig: false,
      },
      directory,
    );
    const watched = [...discoveredFiles];

    // Source maps come alongside as assets.
    const chunks = output.output.filter((item) => item.type === 'chunk');
    const rootChunk = chunks.find((chunk) => chunk.fileName === ROOT_CHUNK + '.js');

    if (!rootChunk) throw new Error('The Kuito bundle has no root chunk');

    const bundled = new Set(chunks.flatMap((chunk) => chunk.moduleIds));
    const placement = [...placements.keys()]
      .filter((id) => bundled.has(id))
      .sort()
      .flatMap((id) => placements.get(id) ?? []);

    if (strict) failFallbacks(placement);

    // Every bundled module's UI-thread functions, for the UI runtime (src/ui-thread).
    const uiParts = [...uiModules.keys()]
      .filter((id) => bundled.has(id))
      .sort()
      .flatMap((id) => uiModules.get(id) ?? []);
    const ui = uiParts.map((part) => part.code).join('\n');
    const uiSections: { line: number; map: string }[] = [];
    let uiLine = 0;

    // Each module's map from the line its code starts on, after the joins before it.
    for (const { code, map } of uiParts) {
      if (map) uiSections.push({ line: uiLine, map });
      uiLine += code.split('\n').length;
    }

    const uiMap = sectionedMap(uiSections);
    const placeholder = /(["'])KUITO_UI_BUNDLE_PLACEHOLDER\1/;

    if (!placeholder.test(rootChunk.code)) throw new Error('Missing Kuito UI bundle placeholder');

    // Named by content: the dev server answers DevTools for the source of
    // `kuito://ui/<hash>` from `ui-<hash>.js` (docs/devtools.md).
    const uiName = createHash('sha256').update(ui).digest('hex').slice(0, 12);
    const uiUrl = `kuito://ui/${uiName}`;
    const scripts = chunks.map((chunk) => {
      const text =
        chunk === rootChunk
          ? chunk.code
              // hermesc writes the same hash into the header of the bytecode it ships as.
              .replace(placeholder, () => JSON.stringify(shippedUI ? sha1(ui) : ui))
              .replace(/(["'])KUITO_UI_URL_PLACEHOLDER\1/, () => JSON.stringify(uiUrl))
          : chunk.code;

      return {
        name: chunkName(chunk.fileName),
        code: text.endsWith('\n') ? text : text + '\n',
        map: chunk.map,
      };
    });
    const rootScript = scripts.find((script) => script.name === ROOT_CHUNK);
    const { code, offsets } = revisionScript(scripts, startScript);

    const build = {
      ui,
      uiMap,
      uiUrl,
      start: START_PREFIX + (rootScript?.code ?? '') + startScript,
      // The root chunk's map, below the prefix.
      startMap: rootScript?.map
        ? sectionedMap([{ line: START_LINES, map: rootScript.map.toString() }])
        : null,
      chunks: scripts.map(({ name, code: text, map: chunkMap }) => ({
        name,
        code: text,
        map: chunkMap ? chunkMap.toString() : null,
      })),
      watched: [...new Set([entrySource, ...watched])],
      directories: routed ? [entrySource] : [],
      nativeModules: specUses(linked).sort(
        (a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file) || a.line - b.line,
      ),
      links: [...linked.ids],
      linkHash: linked.catalog?.hash ?? '',
      assets: [...assets],
      transformed: [...transformed],
      warnings: [...warnings.keys()]
        .filter((id) => bundled.has(id))
        .sort()
        .flatMap((id) => warnings.get(id) ?? []),
      placement,
    };
    const hash = sha1(code);

    if (last?.hash === hash) return { ...last, ...build };

    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, `ui-${uiName}.js`), ui);

    const revision = ++sequence;
    const path = resolve(directory, `patch-${revision}.js`);
    // One map for the one script: each chunk's map at the line its code starts.
    const map = sectionedMap(
      scripts.flatMap((script, index) =>
        script.map ? [{ line: offsets[index] ?? 0, map: script.map.toString() }] : [],
      ),
    );

    await writeFile(path, code);
    // Read by the device hub to symbolicate the stacks this bundle produces.
    if (map) await writeFile(path + '.map', map);

    last = { path, code, map, hash, revision, ...build };

    return last;
  };
}
