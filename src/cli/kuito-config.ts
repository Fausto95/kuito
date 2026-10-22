/**
 * An app's `kuito.config.ts` (docs/apps.md): the settings its generated
 * native shells take, so no app edits native files. Apps import this file for
 * its types, so it imports nothing.
 */

/** The shell settings an environment can replace. */
interface Settings {
  /** Shown under the app icon. */
  name: string;
  /** What users see: up to three numbers, like 1.2.0. Defaults to 1.0.0. */
  version?: string;
  /** What the stores order builds by; raise it for every upload. Defaults to 1. */
  buildNumber?: number;
  /** A square PNG of at least 1024×1024, relative to kuito.config.ts. */
  icon?: string;
  /** The orientations the app runs in. `default` follows the device. */
  orientation?: Orientation;
  /** `light` or `dark` ignores the system setting, as CSS's `color-scheme`. */
  colorScheme?: ColorScheme;
  /** The root window's color, behind the app, like `#1E88E5`. */
  backgroundColor?: string;
  /** The status bar at launch; `SystemBars` changes it at run time. */
  statusBar?: {
    /** The color of its content: `light` for dark backgrounds. `auto` follows the color scheme. */
    style?: StatusBarStyle;
    hidden?: boolean;
  };
  /** Schemes that open the app, like `myapp` for `myapp://show/42` (docs/linking.md). */
  urlSchemes?: string[];
  /**
   * Web domains whose https links open the app, like `example.com`: universal
   * links on iOS, verified app links on Android (docs/linking.md).
   */
  linkDomains?: string[];
  ios: {
    bundleIdentifier: string;
    /** `light` replaces `icon` on iOS; `dark` and `tinted` are its iOS 18 appearances. */
    icon?: { light?: string; dark?: string; tinted?: string };
    /** Runs on iPad too. Defaults to true. */
    supportsTablet?: boolean;
    /** Opts out of iPad multitasking (`UIRequiresFullScreen`). */
    requiresFullScreen?: boolean;
    /** The oldest iOS the app runs on, 16.0 or later. */
    deploymentTarget?: string;
    /**
     * The Apple Developer Team ID an iPhone build signs with, like
     * `A1B2C3D4E5` (docs/cli.md#release-builds). Simulator builds need none.
     */
    teamId?: string;
    /** Like `applinks:example.com`, for universal links. */
    associatedDomains?: string[];
    /**
     * The APNs environment remote push uses: the `aps-environment`
     * entitlement (docs/notifications.md#remote-push). Absent, the app
     * receives no push.
     */
    pushEnvironment?: PushEnvironment;
    backgroundModes?: IOSBackgroundMode[];
    /** Merged into the generated Info.plist. */
    infoPlist?: PlistDictionary;
    /** Merged into the generated entitlements. */
    entitlements?: PlistDictionary;
  };
  android: {
    applicationId: string;
    /** Layers of the 108dp adaptive icon; without one, `icon` fills its visible 72dp. */
    adaptiveIcon?: {
      foreground?: string;
      /** A color like `#1E88E5`, or an image. */
      background?: string;
      /** The single-color layer of Android 13's themed icons. */
      monochrome?: string;
    };
    /** What the window does for the keyboard. Defaults to `resize` (docs/apps.md). */
    softInputMode?: SoftInputMode;
    /** The oldest Android API level the app runs on, 26 or later. */
    minSdk?: number;
    /**
     * The upload key a release build signs with (docs/cli.md#signing): a
     * keystore relative to kuito.config.ts and its alias. Its passwords
     * come from the environment only.
     */
    signing?: { keystore?: string; keyAlias?: string };
    /** Additions to the generated AndroidManifest.xml, as data. */
    manifest?: AndroidManifestSettings;
    /** Items of the app's theme, `AppTheme`, by name. */
    theme?: Record<string, string>;
  };
  /** The permissions the app asks for (docs/permissions.md); none when absent. */
  permissions?: KuitoPermissions;
  /**
   * Names of the tasks the OS may run in the background
   * (docs/background-tasks.md). An environment's list replaces this one.
   */
  backgroundTasks?: string[];
  /**
   * .ttf and .otf files `fontFamily` takes (docs/fonts.md), relative to
   * kuito.config.ts. Each file's family, weight and style are read from it;
   * an object sets them instead.
   */
  fonts?: (string | KuitoFont)[];
  /** The launch screen, and the view the app hands off from (docs/splash.md). */
  splash?: KuitoSplash;
  /**
   * Over-the-air updates of a release build (docs/updates.md): where its
   * shell looks for them, and the key their signatures are checked with.
   * Absent, a release build takes none.
   */
  updates?: {
    /** An https URL the output of `kuito update build` is uploaded to. */
    url: string;
    /** The public key `kuito update key` printed; its private half never goes here. */
    publicKey: string;
  };
  /**
   * Code that reads or moves what lives on the UI thread but has to run on
   * the JS thread fails the build, instead of showing in the placement
   * report (docs/placement.md). Defaults to false.
   */
  strict?: boolean;
}

export type KuitoFontWeight =
  | 'normal'
  | 'bold'
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900;

/** A bundled font file, and the face it is, where the file's own tables are wrong. */
export interface KuitoFont {
  file: string;
  family?: string;
  weight?: KuitoFontWeight;
  style?: 'normal' | 'italic';
}

/** How a splash looks: one launch screen. */
interface SplashLookConfig {
  /** A PNG drawn `logoWidth` wide in the middle of the screen. */
  logo?: string;
  /** In points (iOS) and dp (Android); 100 by default, at most 288. */
  logoWidth?: number;
  /** A color like `#1E88E5`; white by default. */
  background?: string;
  /** A PNG fitted into a 200×80 box, 60 from the bottom. */
  brand?: string;
  /** Replacements in dark mode. */
  dark?: { logo?: string; background?: string; brand?: string };
}

export interface KuitoSplash extends SplashLookConfig {
  /** Looks the app can pick for its next launch, where the platform allows it. */
  variants?: Record<string, SplashLookConfig>;
}

/**
 * Each permission the app uses, with the reason iOS shows in its prompt.
 * Only these reach the shells: an undeclared permission fails at the prompt.
 */
export interface KuitoPermissions {
  camera?: string;
  microphone?: string;
  photos?: string;
  /** Foreground ("when in use") location. */
  location?: string;
  /** Location in the background too ("always"); needs `location` (docs/location.md). */
  locationAlways?: string;
  /** Face ID, for SecureStore's requireAuthentication (docs/secure-store.md). */
  biometrics?: string;
  /** Neither platform shows a reason for notifications. */
  notifications?: true;
}

export type Orientation = 'default' | 'portrait' | 'landscape';
export type ColorScheme = 'automatic' | 'light' | 'dark';
export type StatusBarStyle = 'auto' | 'light' | 'dark';
export type SoftInputMode = 'resize' | 'pan';

export const IOS_BACKGROUND_MODES = [
  'audio',
  'location',
  'voip',
  'fetch',
  'remote-notification',
  'processing',
  'external-accessory',
  'bluetooth-central',
  'bluetooth-peripheral',
  'nearby-interaction',
  'push-to-talk',
] as const;

export type IOSBackgroundMode = (typeof IOS_BACKGROUND_MODES)[number];

/** APNs' two servers: `development` for builds Xcode signs for development, `production` for the App Store and TestFlight. */
const PUSH_ENVIRONMENTS = ['development', 'production'] as const;

export type PushEnvironment = (typeof PUSH_ENVIRONMENTS)[number];

export type PlistValue = string | number | boolean | PlistValue[] | PlistDictionary;
export type PlistDictionary = { [key: string]: PlistValue };

/** An `<intent>`'s or `<intent-filter>`'s `<data>`: each key an `android:` attribute. */
export interface AndroidIntentData {
  scheme?: string;
  host?: string;
  port?: string;
  path?: string;
  pathPrefix?: string;
  pathPattern?: string;
  mimeType?: string;
}

export interface AndroidIntentFilter {
  actions: string[];
  categories: string[];
  data: AndroidIntentData[];
  /** Verifies the hosts as app links. */
  autoVerify: boolean;
}

type AttributeValue = string | number | boolean;

/** `android.manifest`: attribute names without `android:`, values as data. */
export interface AndroidManifestSettings {
  application?: Record<string, AttributeValue>;
  /** The app's one activity. */
  activity?: Record<string, AttributeValue>;
  metaData?: Record<string, AttributeValue>;
  usesPermissions?: string[];
  usesFeatures?: { name: string; required?: boolean }[];
  /** Package visibility: what the app may see of other apps. */
  queries?: { packages?: string[]; intents?: { action: string; data?: AndroidIntentData }[] };
  intentFilters?: {
    actions: string[];
    categories?: string[];
    data?: AndroidIntentData[];
    autoVerify?: boolean;
  }[];
}

/** `android.manifest`, checked, with every key present and values as text. */
export interface AndroidManifestAdditions {
  application: Record<string, string>;
  activity: Record<string, string>;
  metaData: Record<string, string>;
  usesPermissions: string[];
  usesFeatures: { name: string; required: boolean }[];
  queries: { packages: string[]; intents: { action: string; data: AndroidIntentData }[] };
  intentFilters: AndroidIntentFilter[];
}

/** Nested keys override one by one; a list replaces the whole list. */
type Overrides<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? Overrides<T[K]>
      : T[K];
};

/** Keys of the base config that differ in one environment. */
export type Environment = Overrides<Settings> & {
  /** Appended to the bundle id and applicationId, so environments install side by side. */
  idSuffix?: string;
};

/**
 * One change to the app's SQLite database (docs/storage.md#migrations): an
 * SQL statement, or several that apply together.
 */
export type Migration = string | string[];

/** What `kuito.config.ts` exports. The config itself is production. */
export interface KuitoConfig extends Settings {
  environments?: Record<string, Environment>;
  /**
   * The database's migrations, oldest first. Each applies once, in order, when
   * the app first opens the database; append new ones and never edit one that
   * shipped. Every environment shares them.
   */
  migrations?: Migration[];
}

/** An image the config names, absolute, and how to name it in an error. */
export interface IconSource {
  path: string;
  /** The file and key that set it, and the path as written. */
  origin: string;
}

/** A font file the config names; the face is read from the file where it is null. */
export interface FontSource extends IconSource {
  family: string | null;
  weight: number | null;
  style: 'normal' | 'italic' | null;
}

/** One launch screen, checked, with its defaults applied. */
export interface SplashLook {
  logo: IconSource;
  logoWidth: number;
  /** `#RRGGBB`. */
  background: string;
  brand: IconSource | null;
  dark: { logo: IconSource | null; background: string | null; brand: IconSource | null };
}

export interface SplashConfig extends SplashLook {
  /** Each variant: the splash with its own keys replaced. */
  variants: Record<string, SplashLook>;
}

/** The config for one environment, checked, with every optional key present. */
export interface AppConfig {
  name: string;
  version: string;
  buildNumber: number;
  icon: IconSource | null;
  orientation: Orientation;
  colorScheme: ColorScheme;
  backgroundColor: string | null;
  statusBar: { style: StatusBarStyle; hidden: boolean };
  urlSchemes: string[];
  linkDomains: string[];
  ios: {
    bundleIdentifier: string;
    icon: { light: IconSource | null; dark: IconSource | null; tinted: IconSource | null };
    supportsTablet: boolean;
    requiresFullScreen: boolean;
    deploymentTarget: string;
    teamId: string | null;
    associatedDomains: string[];
    pushEnvironment: PushEnvironment | null;
    backgroundModes: IOSBackgroundMode[];
    infoPlist: PlistDictionary;
    entitlements: PlistDictionary;
  };
  android: {
    applicationId: string;
    adaptiveIcon: {
      foreground: IconSource | null;
      /** A `#RRGGBB` color or an image. */
      background: string | IconSource | null;
      monochrome: IconSource | null;
    };
    softInputMode: SoftInputMode;
    minSdk: number;
    /** The keystore as the config wrote it, relative to its file. */
    signing: { keystore: string | null; keyAlias: string | null };
    manifest: AndroidManifestAdditions;
    theme: Record<string, string>;
  };
  permissions: KuitoPermissions;
  backgroundTasks: string[];
  fonts: FontSource[];
  splash: SplashConfig | null;
  /** The URL without a trailing slash. */
  updates: { url: string; publicKey: string } | null;
  strict: boolean;
  /** Each migration's statements. */
  migrations: string[][];
}

/** The shells' own behavior: a setting left at its default writes nothing. */
export const SETTING_DEFAULTS = {
  orientation: 'default',
  colorScheme: 'automatic',
  statusBarStyle: 'auto',
  deploymentTarget: '16.0',
  softInputMode: 'resize',
  minSdk: 26,
} as const;

/** Environments every app has, declared or not: `kuito dev` and `kuito build` run them. */
const BUILT_IN_ENVIRONMENTS = ['development', 'production'];

// Apple allows letters, digits, - and .; Android's segments are Java identifiers.
const BUNDLE_IDENTIFIER = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const APPLICATION_ID = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
// Segments both platforms accept.
const ID_SUFFIX = /^(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const ENVIRONMENT_NAME = /^[a-z][a-z0-9-]*$/;
// Android resource names, where variants become themes and drawables.
const VARIANT_NAME = /^[a-z][a-z0-9_]*$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
// CFBundleShortVersionString takes at most three period-separated integers.
const VERSION = /^\d+(\.\d+){0,2}$/;
// Google Play's largest versionCode.
const MAX_BUILD_NUMBER = 2_100_000_000;
const PNG = /\.png$/i;
// An iOS task identifier and an entry of Android's comma-separated list.
const TASK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FONT = /\.(ttf|otf)$/i;
const FONT_KEYS = ['file', 'family', 'weight', 'style'];
const FONT_WEIGHTS: Record<string, number> = { normal: 400, bold: 700 };
// POSIX, or a Windows drive or share.
const ABSOLUTE = /^([/\\]|[A-Za-z]:)/;

// Lowercase: Android matches schemes case-sensitively and expects them lowercase.
const URL_SCHEME = /^[a-z][a-z0-9+.-]*$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const ASSOCIATED_DOMAIN = /^(applinks|webcredentials|activitycontinuation|appclips):[^\s/]+$/;
const DEPLOYMENT_TARGET = /^(\d+)\.(\d+)$/;
const TEAM_ID = /^[A-Z0-9]{10}$/;
// A P-256 public key as SubjectPublicKeyInfo DER in base64: its first 27 bytes name the curve.
const UPDATE_PUBLIC_KEY = /^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{86}==$/;
// The SDK native/android compiles against: targetSdk, and the highest minSdk.
const COMPILE_SDK = 35;
// Permissions, features, packages, actions and categories.
const DOTTED_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
// `android:` is added in the manifest, so a name is written without it.
const ATTRIBUTE_NAME = /^[a-z][A-Za-z0-9]*$/;
const META_DATA_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const THEME_ITEM = /^(android:)?[A-Za-z][A-Za-z0-9_]*$/;
const INTENT_DATA_KEYS = [
  'scheme',
  'host',
  'port',
  'path',
  'pathPrefix',
  'pathPattern',
  'mimeType',
];

/** Permissions whose value is the reason iOS shows; `notifications` takes `true`. */
const REASONED = [
  'camera',
  'microphone',
  'photos',
  'location',
  'locationAlways',
  'biometrics',
] as const;
const PERMISSIONS = [...REASONED, 'notifications'];

const MANIFEST_KEYS = [
  'application',
  'activity',
  'metaData',
  'usesPermissions',
  'usesFeatures',
  'queries',
  'intentFilters',
] as const;
/** A splash look's keys, at the top of `splash` and in each variant. */
const SPLASH_LOOK = [
  'logo',
  'logoWidth',
  'background',
  'brand',
  'dark.logo',
  'dark.background',
  'dark.brand',
];
// A launch screen's logo shows in Android 12's 288dp icon box.
const MAX_LOGO_WIDTH = 288;

/** Every key a config can set, by path; the sections between are objects. */
const KEYS = new Set([
  'name',
  'version',
  'buildNumber',
  'icon',
  'ios.bundleIdentifier',
  'ios.icon.light',
  'ios.icon.dark',
  'ios.icon.tinted',
  'android.applicationId',
  'android.adaptiveIcon.foreground',
  'android.adaptiveIcon.background',
  'android.adaptiveIcon.monochrome',
  ...PERMISSIONS.map((name) => `permissions.${name}`),
  'orientation',
  'colorScheme',
  'backgroundColor',
  'statusBar.style',
  'statusBar.hidden',
  'urlSchemes',
  'linkDomains',
  'ios.supportsTablet',
  'ios.requiresFullScreen',
  'ios.deploymentTarget',
  'ios.teamId',
  'ios.associatedDomains',
  'ios.pushEnvironment',
  'ios.backgroundModes',
  'ios.infoPlist',
  'ios.entitlements',
  'android.softInputMode',
  'android.minSdk',
  'android.signing.keystore',
  'android.signing.keyAlias',
  ...MANIFEST_KEYS.map((name) => `android.manifest.${name}`),
  'android.theme',
  'backgroundTasks',
  'fonts',
  'strict',
  'updates.url',
  'updates.publicKey',
  ...SPLASH_LOOK.map((key) => `splash.${key}`),
  ...SPLASH_LOOK.map((key) => `splash.variants.*.${key}`),
]);

/** Objects between keys; `*` stands for any name the object holds. */
const SECTIONS = new Set([
  'ios',
  'ios.icon',
  'android',
  'android.adaptiveIcon',
  'android.signing',
  'android.manifest',
  'permissions',
  'statusBar',
  'splash',
  'splash.dark',
  'updates',
  'splash.variants',
  'splash.variants.*',
  'splash.variants.*.dark',
]);

/** Objects whose keys are names, each checked by its pattern. */
const NAMED: Record<string, { pattern: RegExp; what: string }> = {
  'splash.variants': {
    pattern: VARIANT_NAME,
    what: 'variant names are lowercase letters, digits and _',
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One object of the config: the base, or an environment's overrides. */
interface Layer {
  value: Record<string, unknown>;
  /** Where its keys are, for errors: '' or 'environments.<name>.'. */
  prefix: string;
}

/**
 * Throws at the first key `layer` sets that is not a config key. `at` is
 * where `value` is; `shape` is that path with names in `NAMED` objects as `*`.
 */
function checkKeys(
  file: string,
  { value, prefix }: Layer,
  keys: ReadonlySet<string>,
  at = '',
  shape = at,
) {
  const named = NAMED[shape.slice(0, -1)];

  for (const [key, child] of Object.entries(value)) {
    const path = at + key;
    const keyShape = shape + (named ? '*' : key);

    if (named && !named.pattern.test(key))
      throw new Error(`${file}: ${prefix}${path}: ${named.what}`);

    if (SECTIONS.has(keyShape)) {
      if (!isRecord(child)) throw new Error(`${file}: ${prefix}${path} must be an object`);

      checkKeys(file, { value: child, prefix }, keys, path + '.', keyShape + '.');
    } else if (at === 'permissions.' && !keys.has(path))
      throw new Error(
        `${file}: ${prefix}${path} is not a permission; use ${PERMISSIONS.join(', ')}`,
      );
    else if (!keys.has(keyShape))
      throw new Error(`${file}: ${prefix}${path} is not a config key (docs/apps.md)`);
  }
}

function lookup(value: Record<string, unknown>, path: string): unknown {
  let found: unknown = value;

  for (const key of path.split('.')) found = isRecord(found) ? found[key] : undefined;

  return found;
}

/**
 * Reads one environment: each key from the last layer that sets it, so an
 * environment overrides single keys and inherits the rest.
 */
function reader(file: string, layers: readonly Layer[]) {
  /** The first of `paths` any layer sets, so a more specific key wins over a general one. */
  const find = (...paths: string[]) => {
    for (const path of paths)
      for (let i = layers.length - 1; i >= 0; i--) {
        const value = lookup(layers[i].value, path);

        if (value !== undefined) return { value, key: layers[i].prefix + path };
      }

    return null;
  };

  const fail = (key: string, message: string): never => {
    throw new Error(`${file}: ${key} ${message}`);
  };

  const text = (path: string) => {
    const found = find(path);
    const value = found?.value;

    if (typeof value !== 'string' || value === '')
      return fail(found?.key ?? path, 'must be a non-empty string');

    return { value, key: found?.key ?? path };
  };

  const id = (path: string, pattern: RegExp) => {
    const { value, key } = text(path);
    const suffix = find('idSuffix');
    const full = value + (typeof suffix?.value === 'string' ? suffix.value : '');

    if (!pattern.test(value) || !pattern.test(full))
      fail(key, `must be a reverse-DNS id like com.example.app, not '${full}'`);

    return full;
  };

  const source = (key: string, written: string) => {
    const directory = file.slice(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1);
    const path = ABSOLUTE.test(written) ? written : directory + written.replace(/^\.[/\\]/, '');

    return { path, origin: `${file}: ${key} ('${written}')` };
  };

  const image = (...paths: string[]) => {
    const found = find(...paths);

    if (!found) return null;

    if (typeof found.value !== 'string' || !PNG.test(found.value))
      return fail(found.key, 'must be a .png file');

    return source(found.key, found.value);
  };

  const colorOrImage = (path: string) => {
    const found = find(path);

    if (!found) return null;
    if (typeof found.value === 'string' && COLOR.test(found.value)) return found.value;

    if (typeof found.value === 'string' && PNG.test(found.value))
      return source(found.key, found.value);

    return fail(found.key, 'must be a color like #1E88E5 or a .png file');
  };

  const suffix = find('idSuffix');

  if (suffix && (typeof suffix.value !== 'string' || !ID_SUFFIX.test(suffix.value)))
    fail(suffix.key, 'must start with . and add id segments, like .staging');

  const version = () => {
    const found = find('version');

    if (!found) return '1.0.0';

    if (typeof found.value !== 'string' || !VERSION.test(found.value))
      return fail(
        found.key,
        `must be up to three numbers like 1.2.0, not '${typeof found.value === 'string' ? found.value : JSON.stringify(found.value)}'`,
      );

    return found.value;
  };

  const buildNumber = () => {
    const found = find('buildNumber');

    if (!found) return 1;

    const { value, key } = found;

    if (
      !Number.isInteger(value) ||
      typeof value !== 'number' ||
      value < 1 ||
      value > MAX_BUILD_NUMBER
    )
      return fail(key, `must be a whole number from 1 to ${MAX_BUILD_NUMBER}`);

    return value;
  };

  const permissions = () => {
    const declared: KuitoPermissions = {};
    const notifications = find('permissions.notifications');

    for (const name of REASONED) {
      const found = find(`permissions.${name}`);

      if (!found) continue;

      if (typeof found.value !== 'string' || found.value === '')
        fail(found.key, 'must be a non-empty string: the reason iOS shows in its prompt');
      else declared[name] = found.value;
    }

    if (notifications && notifications.value !== true)
      fail(notifications.key, 'must be true; it takes no reason');
    else if (notifications) declared.notifications = true;

    // iOS asks for "when in use" before it offers "always", and shows both reasons.
    if (declared.locationAlways && !declared.location)
      fail(
        find('permissions.locationAlways')?.key ?? 'permissions.locationAlways',
        'needs permissions.location too: iOS asks for "when in use" first',
      );

    return declared;
  };

  const describe = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

  function choice<T extends string>(path: string, options: readonly T[], fallback: T): T {
    const found = find(path);

    if (!found) return fallback;

    const option = options.find((each) => each === found.value);

    return (
      option ??
      fail(found.key, `must be one of ${options.join(', ')}, not '${describe(found.value)}'`)
    );
  }

  const bool = (path: string, fallback: boolean) => {
    const found = find(path);

    if (!found) return fallback;
    if (typeof found.value !== 'boolean') return fail(found.key, 'must be true or false');

    return found.value;
  };

  const color = (...paths: string[]) => {
    const found = find(...paths);

    if (!found) return null;

    if (typeof found.value !== 'string' || !COLOR.test(found.value))
      return fail(found.key, 'must be a color like #1E88E5');

    return found.value;
  };

  /** A list, replaced whole by a later layer; `item` checks each entry. */
  function list<T>(path: string, item: (value: unknown, key: string) => T): T[] {
    const found = find(path);

    if (!found) return [];
    if (!Array.isArray(found.value)) return fail(found.key, 'must be an array');

    return found.value.map((each: unknown, index) => item(each, `${found.key}[${index}]`));
  }

  const matching = (pattern: RegExp, hint: string) => (value: unknown, key: string) =>
    typeof value === 'string' && pattern.test(value) ? value : fail(key, `must be ${hint}`);

  /** A key without a default: null when no layer sets it, else what `item` makes of it. */
  function optional<T>(path: string, item: (value: unknown, key: string) => T): T | null {
    const found = find(path);

    return found ? item(found.value, found.key) : null;
  }

  /** A map merged key by key across layers, each entry with the key that set it. */
  function record(path: string) {
    const entries = new Map<string, { value: unknown; key: string }>();

    for (const { value, prefix } of layers) {
      const found = lookup(value, path);

      if (found === undefined) continue;
      if (!isRecord(found)) return fail(prefix + path, 'must be an object');

      for (const [name, each] of Object.entries(found))
        entries.set(name, { value: each, key: `${prefix}${path}.${name}` });
    }

    return entries;
  }

  const plist = (path: string): PlistDictionary =>
    Object.fromEntries(
      [...record(path)].map(([name, { value, key }]) => [name, plistValue(value, key, fail)]),
    );

  const deploymentTarget = () => {
    const found = find('ios.deploymentTarget');

    if (!found) return SETTING_DEFAULTS.deploymentTarget;

    const [, major = '0', minor = '0'] =
      (typeof found.value === 'string' && DEPLOYMENT_TARGET.exec(found.value)) || [];

    if (Number(major) < 16)
      fail(found.key, `must be 16.0 or later, like 17.0, not '${describe(found.value)}'`);

    return `${Number(major)}.${Number(minor)}`;
  };

  /** Both keys or neither: a shell that looks for updates must be able to check them. */
  const updates = () => {
    const url = optional('updates.url', (value, key) =>
      typeof value === 'string' && URL.canParse(value) && new URL(value).protocol === 'https:'
        ? value.replace(/\/+$/, '')
        : fail(
            key,
            `must be an https URL like https://updates.example.com/myapp, not '${describe(value)}'`,
          ),
    );
    const publicKey = optional(
      'updates.publicKey',
      matching(UPDATE_PUBLIC_KEY, 'the P-256 public key kuito update key printed'),
    );

    if (url === null && publicKey === null) return null;
    if (url === null) return fail('updates.url', 'must be set with updates.publicKey');

    if (publicKey === null)
      return fail('updates.publicKey', 'must be set with updates.url: kuito update key prints one');

    return { url, publicKey };
  };

  const minSdk = () => {
    const found = find('android.minSdk');

    if (!found) return SETTING_DEFAULTS.minSdk;

    const { value, key } = found;
    const min = SETTING_DEFAULTS.minSdk;

    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > COMPILE_SDK)
      return fail(key, `must be a whole number from ${min} to ${COMPILE_SDK}`);

    return value;
  };

  /** The splash look at `at` ('splash.' or a variant's path), falling back to the splash's keys. */
  const splashLook = (at: string): SplashLook => {
    const paths = (key: string) => (at === 'splash.' ? [at + key] : [at + key, 'splash.' + key]);
    const logo = image(...paths('logo'));
    const width = find(...paths('logoWidth'));
    const brand = image(...paths('brand'));
    const background = color(...paths('background')) ?? '#FFFFFF';
    const dark = {
      logo: image(...paths('dark.logo')),
      background: color(...paths('dark.background')),
      brand: image(...paths('dark.brand')),
    };

    if (
      width &&
      (typeof width.value !== 'number' ||
        !Number.isInteger(width.value) ||
        width.value < 1 ||
        width.value > MAX_LOGO_WIDTH)
    )
      fail(width.key, `must be a whole number from 1 to ${MAX_LOGO_WIDTH}`);

    if (dark.brand && !brand) fail(at + 'dark.brand', 'needs a light brand: set splash.brand');

    return {
      logo: logo ?? fail(at + 'logo', 'must be a .png file: the splash needs a logo'),
      logoWidth: typeof width?.value === 'number' ? width.value : 100,
      background,
      brand,
      dark,
    };
  };

  const splash = (): SplashConfig | null => {
    if (!find('splash')) return null;

    const names = new Set(
      layers.flatMap(({ value }) => {
        const variants = lookup(value, 'splash.variants');

        return isRecord(variants) ? Object.keys(variants) : [];
      }),
    );

    return {
      ...splashLook('splash.'),
      variants: Object.fromEntries(
        [...names].map((name) => [name, splashLook(`splash.variants.${name}.`)]),
      ),
    };
  };

  const backgroundTasks = () => {
    const found = find('backgroundTasks');

    if (!found) return [];

    const { value, key } = found;

    if (!Array.isArray(value) || !value.every((name) => typeof name === 'string'))
      return fail(key, 'must be an array of task names');

    for (const [index, name] of value.entries()) {
      if (!TASK_NAME.test(name))
        fail(key + ':', `'${name}' is not a task name; use letters, digits, ., _ and -`);

      if (value.indexOf(name) !== index) fail(key, `names '${name}' twice`);
    }

    return [...value];
  };

  const migration = (value: unknown, key: string) => {
    const statements = typeof value === 'string' ? [value] : value;

    if (
      !Array.isArray(statements) ||
      statements.length === 0 ||
      !statements.every((each) => typeof each === 'string' && each.trim() !== '')
    )
      return fail(key, 'must be an SQL statement or a list of them');

    return [...statements] as string[];
  };

  const fontFile = (key: string, value: unknown) => {
    if (typeof value !== 'string' || !FONT.test(value))
      return fail(key, 'must be a .ttf or .otf file');

    return source(key.replace(/\.file$/, ''), value);
  };

  const font = (key: string, value: unknown): FontSource => {
    if (!isRecord(value))
      return { ...fontFile(key, value), family: null, weight: null, style: null };

    const unknown = Object.keys(value).find((name) => !FONT_KEYS.includes(name));

    if (unknown)
      fail(
        `${key}.${unknown}`,
        `is not a font key; use ${FONT_KEYS.slice(0, -1).join(', ')} and style`,
      );

    const { family = null, weight = null, style = null } = value;
    const number = typeof weight === 'string' ? FONT_WEIGHTS[weight] : weight;

    if (family !== null && (typeof family !== 'string' || family === ''))
      fail(`${key}.family`, 'must be a non-empty string');

    if (
      number !== null &&
      (typeof number !== 'number' || number % 100 !== 0 || number < 100 || number > 900)
    )
      fail(`${key}.weight`, 'must be normal, bold or 100 to 900 in hundreds');

    if (style !== null && style !== 'normal' && style !== 'italic')
      fail(`${key}.style`, 'must be normal or italic');

    return {
      ...fontFile(`${key}.file`, value.file),
      family: family as string | null,
      weight: number as number | null,
      style: style as FontSource['style'],
    };
  };

  /** The fonts of the last layer that lists them: a list replaces, it doesn't merge. */
  const fonts = () => {
    const found = find('fonts');

    if (!found) return [];

    if (!Array.isArray(found.value))
      return fail(found.key, 'must be an array of .ttf or .otf files');

    const list = found.value.map((value: unknown, index) => font(`${found.key}[${index}]`, value));
    const names = list.map(({ path }) =>
      path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1),
    );

    names.forEach((name, index) => {
      const first = names.indexOf(name);

      if (first !== index)
        fail(
          list[index].origin.slice(file.length + 2),
          `has the same file name as ${found.key}[${first}]; rename one`,
        );
    });

    return list;
  };

  return {
    text,
    id,
    version,
    buildNumber,
    image,
    colorOrImage,
    permissions,
    choice,
    bool,
    color,
    list,
    matching,
    optional,
    record,
    plist,
    deploymentTarget,
    minSdk,
    updates,
    backgroundTasks,
    migration,
    fonts,
    splash,
    fail,
  };
}

type Reader = ReturnType<typeof reader>;

/** Checks `value` is Info.plist data; `fail` reports the key at fault. */
export function plistValue(
  value: unknown,
  key: string,
  fail: (key: string, message: string) => never,
): PlistValue {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (Array.isArray(value))
    return value.map((each, index) => plistValue(each, `${key}[${index}]`, fail));

  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([name, each]) => [name, plistValue(each, `${key}.${name}`, fail)]),
    );

  return fail(key, 'must be a string, number, boolean, array or object');
}

/** Checks `value` is an object with only `keys`, for entries inside a list. */
function entry(read: Reader, value: unknown, key: string, keys: readonly string[]) {
  if (!isRecord(value)) return read.fail(key, 'must be an object');

  for (const name of Object.keys(value))
    if (!keys.includes(name)) read.fail(`${key}.${name}`, `is not a key (${keys.join(', ')})`);

  return value;
}

/** An attribute's value as the manifest writes it; never markup. */
function attributeValue(read: Reader, value: unknown, key: string, what: string) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    return read.fail(key, `must be ${what}`);

  const text = String(value);

  if (/[<>]/.test(text)) read.fail(key, 'must be a value, not XML');

  return text;
}

function intentData(read: Reader, value: unknown, key: string): AndroidIntentData {
  const data = entry(read, value, key, INTENT_DATA_KEYS);

  return Object.fromEntries(
    Object.entries(data).map(([name, each]) => [
      name,
      attributeValue(read, each, `${key}.${name}`, 'a string'),
    ]),
  );
}

/** A list of dotted names: permissions, features, packages, actions, categories. */
function names(read: Reader, value: unknown, key: string, hint: string) {
  if (!Array.isArray(value)) return read.fail(key, 'must be an array');

  return value.map((each: unknown, index) => dottedName(read, each, `${key}[${index}]`, hint));
}

const dottedName = (read: Reader, value: unknown, key: string, hint: string) =>
  typeof value === 'string' && DOTTED_NAME.test(value) ? value : read.fail(key, `must be ${hint}`);

const ACTION = 'an action like android.intent.action.VIEW';

function intent(read: Reader, value: unknown, key: string) {
  const { action, data } = entry(read, value, key, ['action', 'data']);

  return {
    action: dottedName(read, action, `${key}.action`, ACTION),
    data: data === undefined ? {} : intentData(read, data, `${key}.data`),
  };
}

function intentFilter(read: Reader, value: unknown, key: string): AndroidIntentFilter {
  const filter = entry(read, value, key, ['actions', 'categories', 'data', 'autoVerify']);
  const actions =
    filter.actions === undefined ? [] : names(read, filter.actions, `${key}.actions`, ACTION);
  const data = filter.data ?? [];

  if (actions.length === 0) read.fail(`${key}.actions`, 'must name at least one action');

  if (filter.autoVerify !== undefined && typeof filter.autoVerify !== 'boolean')
    read.fail(`${key}.autoVerify`, 'must be true or false');

  if (!Array.isArray(data)) return read.fail(`${key}.data`, 'must be an array');

  return {
    actions,
    categories:
      filter.categories === undefined
        ? []
        : names(
            read,
            filter.categories,
            `${key}.categories`,
            'a category like android.intent.category.BROWSABLE',
          ),
    data: data.map((each: unknown, index) => intentData(read, each, `${key}.data[${index}]`)),
    autoVerify: filter.autoVerify === true,
  };
}

function feature(read: Reader, value: unknown, key: string) {
  const { name, required } = entry(read, value, key, ['name', 'required']);

  if (required !== undefined && typeof required !== 'boolean')
    read.fail(`${key}.required`, 'must be true or false');

  return {
    name: dottedName(read, name, `${key}.name`, 'a feature like android.hardware.camera'),
    required: required !== false,
  };
}

function manifestAdditions(read: Reader): AndroidManifestAdditions {
  const attributes = (path: string, pattern: RegExp, hint: string) =>
    Object.fromEntries(
      [...read.record(path)].map(([name, { value, key }]) => {
        if (!pattern.test(name)) read.fail(key, `must be ${hint}`);

        return [name, attributeValue(read, value, key, 'a string, number or boolean')];
      }),
    );
  const attribute = 'an attribute name like allowBackup, without android:';
  const queries = read.record('android.manifest.queries');

  for (const [name, { key }] of queries)
    if (name !== 'packages' && name !== 'intents')
      read.fail(key, 'is not a key (packages, intents)');

  const packages = queries.get('packages');
  const intents = queries.get('intents');

  if (intents && !Array.isArray(intents.value)) read.fail(intents.key, 'must be an array');

  return {
    application: attributes('android.manifest.application', ATTRIBUTE_NAME, attribute),
    activity: attributes('android.manifest.activity', ATTRIBUTE_NAME, attribute),
    metaData: attributes(
      'android.manifest.metaData',
      META_DATA_NAME,
      'a name like com.example.key',
    ),
    usesPermissions: read.list('android.manifest.usesPermissions', (value, key) =>
      dottedName(read, value, key, 'a permission like android.permission.VIBRATE'),
    ),
    usesFeatures: read.list('android.manifest.usesFeatures', (value, key) =>
      feature(read, value, key),
    ),
    queries: {
      packages: packages
        ? names(read, packages.value, packages.key, 'a package like com.example.app')
        : [],
      intents:
        intents && Array.isArray(intents.value)
          ? intents.value.map((value: unknown, index) =>
              intent(read, value, `${intents.key}[${index}]`),
            )
          : [],
    },
    intentFilters: read.list('android.manifest.intentFilters', (value, key) =>
      intentFilter(read, value, key),
    ),
  };
}

function theme(read: Reader) {
  return Object.fromEntries(
    [...read.record('android.theme')].map(([name, { value, key }]) => {
      if (!THEME_ITEM.test(name))
        read.fail(key, 'must be an item name like android:windowBackground or colorAccent');

      if (typeof value !== 'string' || value === '') return read.fail(key, 'must be a string');
      if (/[<>]/.test(value)) read.fail(key, 'must be a value, not XML');

      return [name, value];
    }),
  );
}

function resolveLayers(file: string, layers: readonly Layer[]): AppConfig {
  const read = reader(file, layers);
  const icon = read.image('icon');
  const iosIcon = {
    light: read.image('ios.icon.light'),
    dark: read.image('ios.icon.dark'),
    tinted: read.image('ios.icon.tinted'),
  };
  const adaptiveIcon = {
    foreground: read.image('android.adaptiveIcon.foreground'),
    background: read.colorOrImage('android.adaptiveIcon.background'),
    monochrome: read.image('android.adaptiveIcon.monochrome'),
  };

  if (!icon && !iosIcon.light && (iosIcon.dark || iosIcon.tinted))
    read.fail(
      iosIcon.dark ? 'ios.icon.dark' : 'ios.icon.tinted',
      'needs a light icon: set icon or ios.icon.light',
    );

  if (!icon && !adaptiveIcon.foreground && (adaptiveIcon.background || adaptiveIcon.monochrome))
    read.fail(
      'android.adaptiveIcon',
      'needs a foreground: set icon or android.adaptiveIcon.foreground',
    );

  return {
    name: read.text('name').value,
    version: read.version(),
    buildNumber: read.buildNumber(),
    icon,
    orientation: read.choice(
      'orientation',
      ['default', 'portrait', 'landscape'],
      SETTING_DEFAULTS.orientation,
    ),
    colorScheme: read.choice(
      'colorScheme',
      ['automatic', 'light', 'dark'],
      SETTING_DEFAULTS.colorScheme,
    ),
    backgroundColor: read.color('backgroundColor'),
    statusBar: {
      style: read.choice(
        'statusBar.style',
        ['auto', 'light', 'dark'],
        SETTING_DEFAULTS.statusBarStyle,
      ),
      hidden: read.bool('statusBar.hidden', false),
    },
    urlSchemes: read.list(
      'urlSchemes',
      read.matching(URL_SCHEME, 'a URL scheme like myapp: lowercase letters, digits, +, . and -'),
    ),
    linkDomains: read.list(
      'linkDomains',
      read.matching(DOMAIN, 'a domain like example.com: no scheme or path'),
    ),
    ios: {
      bundleIdentifier: read.id('ios.bundleIdentifier', BUNDLE_IDENTIFIER),
      icon: iosIcon,
      supportsTablet: read.bool('ios.supportsTablet', true),
      requiresFullScreen: read.bool('ios.requiresFullScreen', false),
      deploymentTarget: read.deploymentTarget(),
      teamId: read.optional(
        'ios.teamId',
        read.matching(TEAM_ID, 'a 10-character Apple Developer Team ID like A1B2C3D4E5'),
      ),
      associatedDomains: read.list(
        'ios.associatedDomains',
        read.matching(ASSOCIATED_DOMAIN, 'like applinks:example.com'),
      ),
      pushEnvironment: read.optional(
        'ios.pushEnvironment',
        (value, key) =>
          PUSH_ENVIRONMENTS.find((each) => each === value) ??
          read.fail(key, `must be one of ${PUSH_ENVIRONMENTS.join(', ')}, not '${String(value)}'`),
      ),
      backgroundModes: read.list(
        'ios.backgroundModes',
        (value, key) =>
          IOS_BACKGROUND_MODES.find((mode) => mode === value) ??
          read.fail(key, `must be one of ${IOS_BACKGROUND_MODES.join(', ')}`),
      ),
      infoPlist: read.plist('ios.infoPlist'),
      entitlements: read.plist('ios.entitlements'),
    },
    android: {
      applicationId: read.id('android.applicationId', APPLICATION_ID),
      adaptiveIcon,
      softInputMode: read.choice(
        'android.softInputMode',
        ['resize', 'pan'],
        SETTING_DEFAULTS.softInputMode,
      ),
      minSdk: read.minSdk(),
      signing: {
        keystore: read.optional(
          'android.signing.keystore',
          read.matching(/./, 'a path to a keystore, relative to kuito.config.ts'),
        ),
        keyAlias: read.optional(
          'android.signing.keyAlias',
          read.matching(/./, 'the alias of the key in the keystore'),
        ),
      },
      manifest: manifestAdditions(read),
      theme: theme(read),
    },
    permissions: read.permissions(),
    backgroundTasks: read.backgroundTasks(),
    fonts: read.fonts(),
    splash: read.splash(),
    updates: read.updates(),
    strict: read.bool('strict', false),
    migrations: read.list('migrations', read.migration),
  };
}

/**
 * The config `file` exported, for `environment`: what it declares is
 * untrusted until here. Every environment is checked, so a mistake in one
 * fails every build, not only that environment's.
 */
export function resolveConfig(value: unknown, file: string, environment: string): AppConfig {
  if (!isRecord(value)) throw new Error(`${file}: export default an object (docs/apps.md)`);

  const { environments = {}, ...settings } = value;

  if (!isRecord(environments)) throw new Error(`${file}: environments must be an object`);

  const base: Layer = { value: settings, prefix: '' };
  const overrides = Object.entries(environments).map(([name, overrides]): [string, Layer] => {
    const prefix = `environments.${name}.`;

    if (!ENVIRONMENT_NAME.test(name))
      throw new Error(
        `${file}: environments.${name}: environment names are lowercase letters, digits and -`,
      );

    if (!isRecord(overrides)) throw new Error(`${file}: environments.${name} must be an object`);

    return [name, { value: overrides, prefix }];
  });

  // Environments share one database, so only the base config migrates it.
  checkKeys(file, base, new Set([...KEYS, 'migrations']));

  for (const [, layer] of overrides) checkKeys(file, layer, new Set([...KEYS, 'idSuffix']));

  const resolved = new Map(
    overrides.map(([name, layer]) => [name, resolveLayers(file, [base, layer])]),
  );
  const production = resolved.get('production') ?? resolveLayers(file, [base]);
  const selected = resolved.get(environment);

  if (selected) return selected;
  if (BUILT_IN_ENVIRONMENTS.includes(environment)) return production;

  throw new Error(
    `${file}: no environment '${environment}'. Declared: ${[...resolved.keys()].join(', ') || 'none'}; ${BUILT_IN_ENVIRONMENTS.join(' and ')} always exist`,
  );
}
