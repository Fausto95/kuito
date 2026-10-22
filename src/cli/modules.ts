/**
 * Native modules a shell is built with (docs/native-modules.md): the
 * framework's built-ins in native/modules and the app's own in modules/, each
 * a directory with its spec (`battery/battery.ts`), `ios/` and `android/`. A
 * shell includes only what the app's bundle requires, so an app pays for no
 * module it never imports.
 */
import { existsSync, realpathSync, watch, type FSWatcher } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  installedPackage,
  loadCatalog,
  packagedModuleDirectories,
  packageSpecifier,
  type CatalogModule,
  type NativeModuleUse,
  type ModuleCatalog,
} from '../dev/modules/catalog.ts';
import { ROOT } from './config.ts';
import { plistValue, type PlistDictionary } from './kuito-config.ts';

export interface SwiftPackage {
  url: string;
  from: string;
  products: string[];
}

export interface ModuleManifest {
  name: string;
  /** Modules this one calls natively, included with it. */
  requires: string[];
  /** Absent: the module does not ship on iOS. */
  ios: {
    class: string;
    /** Its class's `static func launch()` runs as the app finishes launching (docs/native-modules.md#launch). */
    launch: boolean;
    swiftPackages: SwiftPackage[];
    infoPlist: PlistDictionary;
    /** System frameworks the app target links, like `CoreHaptics`. */
    frameworks: string[];
  } | null;
  android: {
    class: string;
    /** Its companion's `fun launch(application: Application)` runs as the app's process starts. */
    launch: boolean;
    /** Gradle coordinates, `group:artifact:version`. */
    dependencies: string[];
    permissions: string[];
    /** `<uses-feature>` entries: hardware the module uses, and whether the app needs it. */
    features: { name: string; required: boolean }[];
    /** `<provider>`s under `<application>`, such as a FileProvider. */
    providers: AndroidProvider[];
    /** `<service>`s under `<application>`, by attribute name without `android:`. */
    services: AndroidService[];
    /** `<receiver>`s under `<application>`, such as an alarm's. */
    receivers: AndroidReceiver[];
  } | null;
}

export interface AndroidProvider {
  /** By name without `android:`. `authorities` may use `${applicationId}`. */
  attributes: Record<string, string> & { name: string; authorities: string };
  /** `<meta-data>` naming a resource: name to a reference like `@xml/paths`. */
  resources: Record<string, string>;
}

export type AndroidService = Record<string, string> & { name: string };

export interface AndroidReceiver {
  /** By name without `android:`. */
  attributes: Record<string, string> & { name: string };
  /** The broadcasts its intent filter takes, like `android.intent.action.BOOT_COMPLETED`. */
  actions: string[];
}

/**
 * A module on disk: its spec's native needs, the directory holding `ios/`
 * and `android/`, and the spec's file.
 */
export interface NativeModuleSource {
  manifest: ModuleManifest;
  directory: string;
  file: string;
  /** `android/res`, when the module ships resources its manifest entries name. */
  androidResources?: string;
  /** The module's spec, whose functions the link table holds. */
  spec: CatalogModule;
}

export const MODULE_NAME = /^[A-Z][A-Za-z0-9]*$/;

const SWIFT_CLASS = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FRAMEWORK = /^[A-Za-z][A-Za-z0-9_]*$/;
const KOTLIN_CLASS = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const GRADLE_COORDINATE = /^[^:\s]+:[^:\s]+:[^:\s]+$/;
const PERMISSION = /^[A-Za-z][A-Za-z0-9_.]*$/;
const ATTRIBUTE = /^[A-Za-z][A-Za-z0-9]*$/;
const RESOURCE = /^@[a-z]+\/[A-Za-z0-9_]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validates one manifest; every error names `file` and the key at fault. */
function reader(file: string) {
  const fail = (message: string): never => {
    throw new Error(`${file}: ${message}`);
  };

  /** `keys` null: any keys, like Info.plist's. */
  function object(value: unknown, path: string, keys: readonly string[] | null) {
    if (!isRecord(value)) return fail(`${path || 'the manifest'} must be an object`);

    for (const key of Object.keys(value))
      if (keys && !keys.includes(key))
        fail(`${path ? `${path}.` : ''}${key} is not a manifest key (${keys.join(', ')})`);

    return value;
  }

  function string(value: unknown, path: string, pattern?: RegExp, hint = '') {
    if (typeof value !== 'string' || value === '')
      return fail(`${path} must be a non-empty string`);

    if (pattern && !pattern.test(value)) fail(`${path} must be ${hint}, not '${value}'`);

    return value;
  }

  function array<T>(value: unknown, path: string, item: (value: unknown, path: string) => T) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return fail(`${path} must be an array`);

    return value.map((each, index) => item(each, `${path}[${index}]`));
  }

  function strings(value: unknown, path: string) {
    if (value === undefined) return {};

    return Object.fromEntries(
      Object.entries(object(value, path, null)).map(([key, each]) => [
        key,
        string(each, `${path}.${key}`),
      ]),
    );
  }

  /** An optional true or false, false when absent. */
  function flag(value: unknown, path: string) {
    if (value !== undefined && typeof value !== 'boolean') fail(`${path} must be true or false`);

    return value === true;
  }

  return { fail, object, string, array, strings, flag };
}

export function validateManifest(value: unknown, file: string): ModuleManifest {
  const read = reader(file);

  if (!isRecord(value)) return read.fail('must be an object');

  const manifest = read.object(value, '', ['name', 'requires', 'ios', 'android']);
  const name = read.string(manifest.name, 'name', MODULE_NAME, 'PascalCase, like Battery');

  if (manifest.ios === undefined && manifest.android === undefined)
    read.fail('declares neither ios nor android');

  const ios =
    manifest.ios === undefined
      ? null
      : read.object(manifest.ios, 'ios', [
          'class',
          'launch',
          'swiftPackages',
          'infoPlist',
          'frameworks',
        ]);
  const android =
    manifest.android === undefined
      ? null
      : read.object(manifest.android, 'android', [
          'class',
          'launch',
          'dependencies',
          'permissions',
          'features',
          'providers',
          'services',
          'receivers',
        ]);

  return {
    name,
    requires: read.array(manifest.requires, 'requires', (each, path) =>
      read.string(each, path, MODULE_NAME, 'a module name'),
    ),
    ios: ios && {
      class: read.string(ios.class, 'ios.class', SWIFT_CLASS, 'a Swift class name'),
      launch: read.flag(ios.launch, 'ios.launch'),
      swiftPackages: read.array(ios.swiftPackages, 'ios.swiftPackages', (each, path) => {
        const swiftPackage = read.object(each, path, ['url', 'from', 'products']);

        return {
          url: read.string(swiftPackage.url, `${path}.url`),
          from: read.string(swiftPackage.from, `${path}.from`),
          products: read.array(swiftPackage.products, `${path}.products`, (product, at) =>
            read.string(product, at),
          ),
        };
      }),
      infoPlist: Object.fromEntries(
        Object.entries(
          ios.infoPlist === undefined ? {} : read.object(ios.infoPlist, 'ios.infoPlist', null),
        ).map(([key, value]) => [
          key,
          plistValue(value, `ios.infoPlist.${key}`, (at, message) => read.fail(`${at} ${message}`)),
        ]),
      ),
      frameworks: read.array(ios.frameworks, 'ios.frameworks', (each, path) =>
        read.string(each, path, FRAMEWORK, 'a system framework like CoreHaptics'),
      ),
    },
    android: android && {
      launch: read.flag(android.launch, 'android.launch'),
      class: read.string(
        android.class,
        'android.class',
        KOTLIN_CLASS,
        'a fully qualified Kotlin class like com.example.battery.BatteryModule',
      ),
      dependencies: read.array(android.dependencies, 'android.dependencies', (each, path) =>
        read.string(
          each,
          path,
          GRADLE_COORDINATE,
          'a Gradle coordinate like group:artifact:version',
        ),
      ),
      permissions: read.array(android.permissions, 'android.permissions', (each, path) =>
        read.string(each, path, PERMISSION, 'a permission like android.permission.CAMERA'),
      ),
      features: read.array(android.features, 'android.features', (each, path) => {
        const { name: feature, required } = read.object(each, path, ['name', 'required']);

        if (required !== undefined && typeof required !== 'boolean')
          read.fail(`${path}.required must be true or false`);

        return {
          name: read.string(
            feature,
            `${path}.name`,
            PERMISSION,
            'a feature like android.hardware.camera',
          ),
          required: required !== false,
        };
      }),
      providers: read.array(android.providers, 'android.providers', (each, path) =>
        provider(read, each, path),
      ),
      services: read.array(android.services, 'android.services', (each, path) =>
        service(read, each, path),
      ),
      receivers: read.array(android.receivers, 'android.receivers', (each, path) =>
        receiver(read, each, path),
      ),
    },
  };
}

/** A manifest element's attributes, by name without `android:`. */
function attributesOf(
  read: ReturnType<typeof reader>,
  value: Record<string, unknown>,
  path: string,
): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const [key, each] of Object.entries(value)) {
    if (!ATTRIBUTE.test(key))
      read.fail(`${path}.${key} must be an attribute name without android:`);

    attributes[key] = read.string(each, `${path}.${key}`);
  }

  return attributes;
}

function service(read: ReturnType<typeof reader>, value: unknown, path: string): AndroidService {
  const attributes = attributesOf(read, read.object(value, path, null), path);

  return {
    ...attributes,
    name: read.string(
      attributes.name,
      `${path}.name`,
      KOTLIN_CLASS,
      'a fully qualified class like a.b.Service',
    ),
  };
}

function receiver(read: ReturnType<typeof reader>, value: unknown, path: string): AndroidReceiver {
  const { actions, ...rest } = read.object(value, path, null);
  const attributes = attributesOf(read, rest, path);

  return {
    attributes: {
      ...attributes,
      name: read.string(
        attributes.name,
        `${path}.name`,
        KOTLIN_CLASS,
        'a fully qualified class like a.b.Receiver',
      ),
    },
    actions: read.array(actions, `${path}.actions`, (each, at) =>
      read.string(each, at, KOTLIN_CLASS, 'an action like android.intent.action.BOOT_COMPLETED'),
    ),
  };
}

function provider(read: ReturnType<typeof reader>, value: unknown, path: string): AndroidProvider {
  const { resources, ...rest } = read.object(value, path, null);
  const attributes = attributesOf(read, rest, path);

  return {
    attributes: {
      ...attributes,
      name: read.string(
        rest.name,
        `${path}.name`,
        KOTLIN_CLASS,
        'a fully qualified class like a.b.Provider',
      ),
      authorities: read.string(rest.authorities, `${path}.authorities`),
    },
    resources: Object.fromEntries(
      Object.entries(read.strings(resources, `${path}.resources`)).map(([key, each]) => [
        key,
        read.string(
          each,
          `${path}.resources.${key}`,
          RESOURCE,
          'a resource reference like @xml/paths',
        ),
      ]),
    ),
  };
}

async function hasSources(directory: string, extension: string) {
  if (!existsSync(directory)) return false;

  const files = await readdir(directory, { recursive: true });

  return files.some((file) => file.endsWith(extension));
}

const PLATFORM_SOURCES = [
  { platform: 'ios', extension: '.swift', language: 'Swift' },
  { platform: 'android', extension: '.kt', language: 'Kotlin' },
] as const;

/** Each platform section has its folder of sources, and each folder its section. */
async function checkSources(manifest: ModuleManifest, directory: string, file: string) {
  const name = basename(directory);

  for (const { platform, extension, language } of PLATFORM_SOURCES) {
    const sources = join(directory, platform);
    const shown = join(name, platform);
    const declared = manifest[platform] !== null;
    const present = await hasSources(sources, extension);

    if (declared && !present)
      throw new Error(
        `${file}: ${platform}.class is declared, but ${shown} has no ${extension} files`,
      );

    if (!declared && present)
      throw new Error(`${file}: ${shown} has ${language} sources, but no ${platform}.class`);
  }

  const resources = join(directory, 'android', 'res');

  return manifest.android && existsSync(resources) ? { androidResources: resources } : {};
}

/**
 * A module described by its spec: its native needs as a manifest, and the
 * modules it requires, the specs it imports.
 */
async function specModule(
  module: CatalogModule,
  catalog: ModuleCatalog,
): Promise<NativeModuleSource> {
  const { spec, path, directory } = module;
  const requires = spec.imports.flatMap((specifier) => {
    // Another package's spec, by its package name, as Node finds that package.
    const bare = packageSpecifier(specifier);
    const manifest = bare && installedPackage(directory, bare.name);
    const imported = bare
      ? manifest && resolve(dirname(realpathSync(manifest)), bare.path)
      : resolve(directory, specifier);

    if (!imported) return [];

    return [imported, imported + '.ts'].flatMap((file) => {
      const found = catalog.byFile.get(file);

      return found ? [found.spec.name] : [];
    });
  });
  const manifest = validateManifest({ name: spec.name, ...spec.needs, requires }, spec.file);

  return {
    manifest,
    directory,
    file: path,
    spec: module,
    ...(await checkSources(manifest, directory, path)),
  };
}

export const BUILT_IN_MODULES = (framework = ROOT) => join(framework, 'native/modules');

/**
 * The modules a project can use, the framework's built-ins and its own
 * `modules/`, and the catalog that numbers their specs' functions.
 */
export async function availableModules(root: string, framework = ROOT) {
  const catalog = await loadCatalog(root, framework);
  const modules = await Promise.all(catalog.modules.map((module) => specModule(module, catalog)));

  return { modules, catalog };
}

/** The modules a project can use. */
export async function loadModules(root: string, framework = ROOT) {
  return (await availableModules(root, framework)).modules;
}

/**
 * The modules a shell is built with: the ones `uses` names and what those
 * require, nothing else. `all` is for a shell no app bundle decides, such as
 * the one the renderer tests run in.
 */
export function includeModules(
  available: readonly NativeModuleSource[],
  uses: readonly NativeModuleUse[] | 'all',
): NativeModuleSource[] {
  const byName = new Map(available.map((module) => [module.manifest.name, module]));
  const included = new Map<string, NativeModuleSource>();

  for (const { manifest, file } of available)
    for (const name of manifest.requires)
      if (!byName.has(name)) throw new Error(`${file}: requires ${name}, which no module provides`);

  function include(module: NativeModuleSource) {
    if (included.has(module.manifest.name)) return;
    included.set(module.manifest.name, module);

    for (const name of module.manifest.requires) {
      const required = byName.get(name);

      if (required) include(required);
    }
  }

  if (uses === 'all') available.forEach(include);

  for (const { name, file, line } of uses === 'all' ? [] : uses) {
    const module = byName.get(name);

    if (!module)
      throw new Error(
        `${file}:${line}: no native module named ${name}. Available: ${[...byName.keys()].sort().join(', ')}. ` +
          `An app's own go in modules/ (kuito module create ${name}).`,
      );

    include(module);
  }

  return [...included.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

/** What a bundle needs of its shell: the modules it requires and the module functions it calls. */
export interface ShellNeeds {
  uses: readonly NativeModuleUse[];
  /** The ids of the functions it calls, numbered by the catalog `linkHash` names. */
  links: readonly number[];
  linkHash: string;
}

/** The link table a shell compiles: the functions of `ids`, as `catalog` numbers them. */
export interface ShellLink {
  catalog: ModuleCatalog;
  ids: readonly number[];
}

/**
 * The modules the app's config needs whatever its bundle calls, since the
 * shell's native settings name their classes: declared background tasks run
 * in BackgroundTasks' job service (docs/background-tasks.md), and
 * `locationAlways` declares Location's foreground service (docs/location.md).
 */
export function configuredModules(config: {
  backgroundTasks: readonly string[];
  permissions: { locationAlways?: unknown };
}): NativeModuleUse[] {
  const configured = (name: string) => ({ name, file: 'kuito.config.ts', line: 1 });

  return [
    ...(config.backgroundTasks.length ? [configured('BackgroundTasks')] : []),
    ...(config.permissions.locationAlways === undefined ? [] : [configured('Location')]),
  ];
}

/**
 * The modules a project's shell is built with, for what its bundle and its
 * config need, and its link table. `all` links every module and function.
 */
export async function shellModules(
  root: string,
  needs: ShellNeeds | 'all',
  configured: readonly NativeModuleUse[] = [],
): Promise<{ modules: NativeModuleSource[]; link: ShellLink }> {
  const { modules, catalog } = await availableModules(root);

  if (needs !== 'all' && needs.linkHash && needs.linkHash !== catalog.hash)
    throw new Error(
      'A native module spec changed while the app compiled, so its function ids moved: build again.',
    );

  return {
    modules: includeModules(modules, needs === 'all' ? 'all' : [...needs.uses, ...configured]),
    link: {
      catalog,
      ids: needs === 'all' ? catalog.members.map(({ id }) => id) : needs.links,
    },
  };
}

const NATIVE_SOURCE = /\.(swift|kt|ts)$/;

/**
 * Calls `onChange` once per burst of edits to an app module's Swift, Kotlin
 * or spec under `root/modules`, which may not exist yet: `kuito module
 * create` can add it while `kuito dev` runs, or under a module directory of
 * a package the app depends on. Returns the stop.
 */
export function watchModuleSources(root: string, onChange: () => void, debounceMs = 150) {
  const directory = join(root, 'modules');
  let timer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;

  const changed = (file: string | null) => {
    if (file && !NATIVE_SOURCE.test(file)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };

  function watchModules() {
    watcher = watch(directory, { recursive: true }, (_event, file) => changed(file));
  }

  // A package's modules too: one linked in for development changes as the app's do.
  const packaged = packagedModuleDirectories(root).map((each) =>
    watch(each, { recursive: true }, (_event, file) => changed(file)),
  );

  if (existsSync(directory)) watchModules();
  else
    watcher = watch(root, (_event, file) => {
      if (file !== 'modules' || !existsSync(directory)) return;
      watcher?.close();
      watchModules();
    });

  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
    packaged.forEach((each) => each.close());
  };
}
