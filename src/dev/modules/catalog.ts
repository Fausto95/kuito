/**
 * Every native module an app can call, read from the specs of the
 * framework's built-ins (native/modules), the app's own (modules/) and the
 * packages it depends on (docs/native-modules.md#ship-a-module-in-a-package), with
 * an id for every function: the one number that names it at run time, from
 * the stub the bundle calls to the link table the shell compiles
 * (docs/native-modules.md).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleSpec, type Member, type ModuleSpec, type ViewMember } from './spec.ts';

const FRAMEWORK = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface CatalogModule {
  spec: ModuleSpec;
  /** The spec's absolute path, as the bundler names the module. */
  path: string;
  /** Holds the spec, `ios/` and `android/`. */
  directory: string;
}

/** A module the bundle requires, at the first member it calls. */
export interface NativeModuleUse {
  name: string;
  file: string;
  line: number;
}

export interface LinkedMember {
  id: number;
  module: ModuleSpec;
  member: Member;
  /** The view a method belongs to: its first argument is a mounted view of it. */
  view?: ViewMember;
}

export interface ModuleCatalog {
  modules: CatalogModule[];
  /** Every member by id, from 1. */
  members: LinkedMember[];
  byFile: ReadonlyMap<string, CatalogModule>;
  byName: ReadonlyMap<string, CatalogModule>;
  /** Changes whenever an id would name another function: a shell built with another needs a rebuild. */
  hash: string;
}

export interface SpecSource {
  /** Absolute. */
  file: string;
  source: string;
}

/** The catalog of `sources`, numbered by module name, then each module's declaration order. */
export function catalogOf(sources: readonly SpecSource[]): ModuleCatalog {
  const modules = sources
    .map(({ file, source }) => ({
      spec: readModuleSpec(relative(process.cwd(), file).replaceAll('\\', '/'), source),
      path: file,
      directory: dirname(file),
    }))
    .sort((a, b) => a.spec.name.localeCompare(b.spec.name));
  const byName = new Map<string, CatalogModule>();

  for (const module of modules) {
    const earlier = byName.get(module.spec.name);

    if (earlier)
      throw new Error(
        `${module.spec.name} is declared by both ${earlier.path} and ${module.path}; rename one`,
      );

    byName.set(module.spec.name, module);
  }

  // A view is numbered, then each of its methods.
  const members = modules.flatMap(({ spec }) =>
    spec.members.flatMap((member): Omit<LinkedMember, 'id'>[] => [
      { module: spec, member },
      ...(member.kind === 'view'
        ? member.methods.map((method) => ({ module: spec, member: method, view: member }))
        : []),
    ]),
  );
  const numbered = members.map((each, index) => ({ id: index + 1, ...each }));
  const signature = numbered.map(({ id, module, member }) => [id, module.name, member]);

  return {
    modules,
    members: numbered,
    byFile: new Map(modules.map((module) => [module.path, module])),
    byName,
    hash: createHash('sha1').update(JSON.stringify(signature)).digest('hex').slice(0, 16),
  };
}

/** A module directory's spec: the TypeScript file named like it, `battery/battery.ts`. */
export const specFile = (directory: string) => join(directory, basename(directory) + '.ts');

async function specsIn(directory: string): Promise<SpecSource[]> {
  if (!existsSync(directory)) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => specFile(join(directory, entry.name)));

  for (const file of files)
    if (!existsSync(file))
      throw new Error(
        `${dirname(file)} has no spec: a module directory holds ${basename(file)}, ` +
          'which defines it (docs/native-modules.md, kuito module create)',
      );

  return Promise.all(files.map(async (file) => ({ file, source: await readFile(file, 'utf8') })));
}

export const BUILT_IN_SPECS = (framework = FRAMEWORK) => join(framework, 'native/modules');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A package.json's object, null when there is none; one that isn't JSON is an error naming it. */
function packageJson(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return isRecord(parsed) ? parsed : null;
}

/**
 * `name`'s package.json as Node finds it from `from`: in the nearest
 * node_modules up the tree, where a workspace hoists it. Null when not installed.
 */
export function installedPackage(from: string, name: string): string | null {
  for (let directory = resolve(from); ; directory = dirname(directory)) {
    const manifest = join(directory, 'node_modules', name, 'package.json');

    if (existsSync(manifest)) return manifest;
    if (dirname(directory) === directory) return null;
  }
}

/**
 * The directory a package's `kuito.modules` names, by real path as the
 * bundler resolves it; undefined for a package without the key.
 */
export function packageModules(manifest: string): string | undefined {
  // Most packages never name it: only one that does is parsed, so another's broken package.json is its own.
  if (!readFileSync(manifest, 'utf8').includes('"kuito"')) return undefined;

  const kuito = packageJson(manifest)?.kuito;

  if (!isRecord(kuito) || kuito.modules === undefined) return undefined;

  const file = realpathSync(manifest);
  const root = dirname(file);

  if (typeof kuito.modules !== 'string' || !kuito.modules)
    throw new Error(`${file}: kuito.modules must name a directory of modules, like "modules"`);

  const directory = resolve(root, kuito.modules);

  // Within the package, and not its root: each directory there would have to be a module.
  if (!directory.startsWith(root + sep))
    throw new Error(
      `${file}: kuito.modules names ${kuito.modules}, which is not a directory inside the package`,
    );

  if (!existsSync(directory) || !statSync(directory).isDirectory())
    throw new Error(`${file}: kuito.modules names ${kuito.modules}, which is not a directory`);

  return realpathSync(directory);
}

/**
 * The module directories of the packages `root`'s package.json depends on:
 * each one whose package.json names one in `kuito.modules`, laid out as an
 * app's `modules/`.
 */
export function packagedModuleDirectories(root: string): string[] {
  const app = packageJson(join(root, 'package.json'));
  const dependencies = isRecord(app?.dependencies) ? Object.keys(app.dependencies) : [];

  return dependencies.flatMap((name) => {
    const manifest = installedPackage(root, name);
    const directory = manifest ? packageModules(manifest) : undefined;

    return directory ? [directory] : [];
  });
}

/** The package a bare specifier names, and the path inside it: `@a/b/c` is `@a/b` and `c`. */
export function packageSpecifier(specifier: string): { name: string; path: string } | null {
  if (/^[./]/.test(specifier)) return null;

  const parts = specifier.split('/');
  const length = specifier.startsWith('@') ? 2 : 1;

  return { name: parts.slice(0, length).join('/'), path: parts.slice(length).join('/') };
}

/**
 * The package whose `kuito.modules` holds `file`, a spec's path, when the
 * app doesn't depend on it: its name, for an error that says so.
 */
export function undeclaredPackage(file: string): string | null {
  // Only a file laid out as a spec, `battery/battery.ts`, can be one.
  if (basename(file) !== basename(dirname(file)) + '.ts') return null;

  for (
    let directory = dirname(file);
    dirname(directory) !== directory;
    directory = dirname(directory)
  ) {
    const manifest = join(directory, 'package.json');

    if (!existsSync(manifest)) continue;

    const modules = packageModules(manifest);
    const name = packageJson(manifest)?.name;

    return modules && file.startsWith(modules + sep) && typeof name === 'string' ? name : null;
  }

  return null;
}

/**
 * The modules a project's bundle can call: Kuito's built-ins, the app's
 * `modules/`, and those of the packages it depends on.
 */
export async function loadCatalog(root: string, framework = FRAMEWORK): Promise<ModuleCatalog> {
  const packaged = packagedModuleDirectories(root);
  const sources = await Promise.all([
    specsIn(BUILT_IN_SPECS(framework)),
    specsIn(join(root, 'modules')),
    ...packaged.map(specsIn),
  ]);

  return catalogOf(sources.flat());
}
