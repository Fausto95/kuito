import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, sep } from 'node:path';
import { ROOT, type RouteStyle } from './config.ts';
import { CONFIG_FILE } from './project.ts';

/** The starter app's sources; package.json and tsconfig.json are written here. */
const TEMPLATE = join(ROOT, 'templates/app');

// A directory name and, lowercased, an npm package name.
const APP_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * What differs between the routing styles: templates/routes/<style>/ adds its
 * files (README.md is the README's `{{routes}}` section), and `place` puts each
 * file of the starter's file-routes app/ where the style keeps it.
 */
interface RouteLayout {
  /** A template file's path in the app, or null when the style has no use for it. */
  place: (file: string) => string | null;
  /** What tsconfig.json includes besides modules/, tests/ and kuito.config.ts. */
  sources: readonly string[];
}

/**
 * Component routes keep the starter's screens and components and declare the
 * routes in app.tsx: each route file becomes a screen, app/_components/ the
 * app's components/. The tab layout and the generated route types are what
 * app.tsx writes out itself.
 */
const COMPONENT_PLACES: ReadonlyArray<readonly [from: string, to: string | null]> = [
  ['app/_layout.tsx', null],
  ['app/routes.generated.d.ts', null],
  ['app/(home)/index.tsx', 'screens/home.tsx'],
  ['app/(explore)/explore.tsx', 'screens/explore.tsx'],
  ['app/(explore)/explore/[topic].tsx', 'screens/topic.tsx'],
  ['app/about.tsx', 'screens/about.tsx'],
  ['app/color.tsx', 'screens/color.tsx'],
  ['app/sign-in.tsx', 'screens/sign-in.tsx'],
  ['app/sign-up.tsx', 'screens/sign-up.tsx'],
  ['app/_components/', 'components/'],
];

const MODULE_EXTENSION = /\.[jt]sx?$/;

/** Where component routes put a template path: a file, or a module as imports name it. */
function componentPlace(path: string): string | null {
  if (!path.startsWith('app/')) return path;

  for (const [from, to] of COMPONENT_PLACES) {
    if (from.endsWith('/')) {
      if (path.startsWith(from)) return to + path.slice(from.length);
    } else if (path === from) return to;
    else if (path === from.replace(MODULE_EXTENSION, ''))
      return to === null ? null : to.replace(MODULE_EXTENSION, '');
  }

  throw new Error(
    `templates/app/${path} has no place in component routes: add it to COMPONENT_PLACES (src/cli/create.ts)`,
  );
}

const LAYOUTS: Readonly<Record<RouteStyle, RouteLayout>> = {
  files: { place: (file) => file, sources: ['app'] },
  components: { place: componentPlace, sources: ['app.tsx', 'screens', 'components'] },
};

const RELATIVE_IMPORT = /((?:from|import)\s*\(?\s*)(['"])(\.\.?\/[^'"]+)\2/g;

/**
 * `source`, the template file `file`, as it reads once `place` has moved it and
 * the files it imports: each relative specifier names the same file again.
 */
export function relocateImports(
  source: string,
  file: string,
  place: (path: string) => string | null,
): string {
  const moved = place(file);

  if (moved === null) throw new Error(`${file} has no place to be relocated to`);

  return source.replace(
    RELATIVE_IMPORT,
    (_match, keyword: string, quote: string, specifier: string) => {
      const target = place(posix.normalize(posix.join(posix.dirname(file), specifier)));

      if (target === null)
        throw new Error(`${file} imports ${specifier}, which this layout leaves out`);

      const next = posix.relative(posix.dirname(moved), target);

      return keyword + quote + (next.startsWith('.') ? next : './' + next) + quote;
    },
  );
}

/** npm leaves dotfiles out of packages, so the template names them without the dot. */
const RENAMED: Readonly<Record<string, string>> = { gitignore: '.gitignore' };

/** Files whose `{{name}}` is the app's name and `{{id}}` its bundle id and applicationId. */
const FILLED = new Set(['README.md', CONFIG_FILE]);

/** The app's ids until it picks its own: com.example.<name>. */
const appId = (name: string) => `com.example.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

export function validateAppName(name: string) {
  if (!APP_NAME.test(name) || name.length > 214)
    throw new Error(
      `App name '${name}' is not valid: start with a letter, then use letters, digits, - or _.`,
    );

  return name;
}

/**
 * Installed from npm, the app takes that release, under the alias `kuito`
 * its imports name (npm publishes it scoped); run from a checkout, the checkout.
 */
async function kuitoDependency(framework: string, directory: string) {
  if (!framework.split(sep).includes('node_modules'))
    return `file:${relative(directory, framework)}`;

  const file = join(framework, 'package.json');
  const manifest: unknown = JSON.parse(await readFile(file, 'utf8'));
  const field = (key: string) =>
    typeof manifest === 'object' && manifest !== null && key in manifest
      ? Object.getOwnPropertyDescriptor(manifest, key)?.value
      : null;
  const name: unknown = field('name');
  const version: unknown = field('version');

  if (typeof name !== 'string' || typeof version !== 'string')
    throw new Error(`${file} has no name or version`);

  return `npm:${name}@^${version}`;
}

function packageJson(name: string, kuito: string) {
  return {
    name: name.toLowerCase(),
    private: true,
    type: 'module',
    scripts: {
      start: 'kuito dev',
      ios: 'kuito dev ios',
      android: 'kuito dev android',
      test: 'kuito test',
    },
    dependencies: { kuito },
  };
}

// App code is bundled by Kuito's compiler, which owns JSX: this file is for
// the editor and `tsc`, and mirrors the framework's own tsconfig.app.json.
const tsconfig = (sources: readonly string[]) => ({
  compilerOptions: {
    target: 'ES2024',
    lib: ['ES2024'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'preserve',
    jsxFactory: '__kuitoJSX',
    jsxFragmentFactory: '__kuitoFragment',
    types: [],
    strict: true,
    noEmit: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
  },
  include: [
    ...sources,
    'modules',
    'tests',
    'kuito.config.ts',
    'node_modules/kuito/src/ui/globals.d.ts',
    'node_modules/kuito/src/ui/assets.d.ts',
  ],
});

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

async function templateFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name !== '.DS_Store')
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

async function isEmptyDirectory(directory: string) {
  return !existsSync(directory) || (await readdir(directory)).length === 0;
}

interface CreateOptions {
  name: string;
  /** Where the app goes: a new or empty directory. */
  directory: string;
  /** The Kuito the app depends on: a checkout, or a package installed from npm. */
  framework: string;
  /** How the app declares its routes; file routes by default. */
  routes?: RouteStyle;
}

/** Writes a new app; returns its files, relative to `directory`. */
export async function createApp({ name, directory, framework, routes = 'files' }: CreateOptions) {
  validateAppName(name);

  if (!(await isEmptyDirectory(directory)))
    throw new Error(`${directory} is not empty. Choose another name or empty it first.`);

  const layout = LAYOUTS[routes];
  const styled = join(ROOT, 'templates/routes', routes);
  const section = await readFile(join(styled, 'README.md'), 'utf8');
  const fill = (text: string) =>
    text
      .replace('{{routes}}\n', section)
      .replaceAll('{{name}}', name)
      .replaceAll('{{id}}', appId(name));
  const files: Record<string, string | Buffer> = {
    'package.json': json(packageJson(name, await kuitoDependency(framework, directory))),
    'tsconfig.json': json(tsconfig(layout.sources)),
  };

  for (const file of await templateFiles(TEMPLATE)) {
    const placed = layout.place(file);

    if (placed === null) continue;

    const source = await readFile(join(TEMPLATE, file));
    const text = () => source.toString('utf8');

    // A module that stays put may still import one that moved: tests/ does.
    files[RENAMED[placed] ?? placed] = FILLED.has(file)
      ? fill(text())
      : MODULE_EXTENSION.test(file)
        ? relocateImports(text(), file, layout.place)
        : source;
  }

  for (const file of await templateFiles(styled))
    if (file !== 'README.md') files[file] = await readFile(join(styled, file));

  for (const [file, contents] of Object.entries(files)) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await writeFile(join(directory, file), contents);
  }

  return Object.keys(files);
}
