/**
 * The native shells an app builds (docs/apps.md): the framework's own
 * projects, configured for the app and generated into its `.kuito/`. Pure:
 * config in, file contents and build arguments out.
 */
import { delimiter, join } from 'node:path';
import { HAS_APP_ICON } from './app-icons.ts';
import {
  rawContributions,
  settingsContributions,
  THEME_DEFAULTS,
  THEME_PARENTS,
} from './app-settings.ts';
import type { NativeModuleSource, ShellLink } from './modules.ts';
import { kotlinLink } from './link-kotlin.ts';
import { swiftLink } from './link-swift.ts';
import { FONT_DIRECTORY } from './fonts.ts';
import { IMAGE_CATALOG, IMAGE_RESOURCES } from './bundled-images.ts';
import { mergeEntries, renderManifest, renderTheme, type Contribution } from './native-entries.ts';
import type { Platform, Profile } from './config.ts';
import type { Project } from './project.ts';
import { SETTING_DEFAULTS, type AppConfig, type KuitoPermissions } from './kuito-config.ts';

/** An Android runtime permission, up to the API level that still needs it. */
type AndroidPermission = { name: string; maxSdk?: number };

/**
 * What each permission adds to the shells: the Info.plist key holding its
 * reason, and the manifest entries `KuitoPermission.kt` requests from.
 */
const PERMISSIONS: Record<
  keyof KuitoPermissions,
  { usage: string | null; android: AndroidPermission[] }
> = {
  camera: { usage: 'NSCameraUsageDescription', android: [{ name: 'CAMERA' }] },
  microphone: { usage: 'NSMicrophoneUsageDescription', android: [{ name: 'RECORD_AUDIO' }] },
  photos: {
    usage: 'NSPhotoLibraryUsageDescription',
    android: [
      { name: 'READ_MEDIA_IMAGES' },
      { name: 'READ_MEDIA_VIDEO' },
      { name: 'READ_MEDIA_VISUAL_USER_SELECTED' },
      { name: 'READ_EXTERNAL_STORAGE', maxSdk: 32 },
    ],
  },
  location: {
    usage: 'NSLocationWhenInUseUsageDescription',
    android: [{ name: 'ACCESS_FINE_LOCATION' }, { name: 'ACCESS_COARSE_LOCATION' }],
  },
  // Android 10 split background access off; before it, foreground access covers both.
  locationAlways: {
    usage: 'NSLocationAlwaysAndWhenInUseUsageDescription',
    android: [{ name: 'ACCESS_BACKGROUND_LOCATION' }],
  },
  // Android's BiometricPrompt needs USE_BIOMETRIC, a permission without a prompt.
  biometrics: { usage: 'NSFaceIDUsageDescription', android: [{ name: 'USE_BIOMETRIC' }] },
  notifications: { usage: null, android: [{ name: 'POST_NOTIFICATIONS' }] },
};

/** The table's rows for the permissions an app declared, with their reasons. */
function declared(permissions: KuitoPermissions) {
  const reasons = new Map(Object.entries(permissions));

  return Object.entries(PERMISSIONS).flatMap(([name, shell]) =>
    reasons.has(name) ? [{ ...shell, reason: reasons.get(name) }] : [],
  );
}

/** The permissions an app declared: iOS's reasons and Android's manifest entries. */
function permissionEntries(permissions: KuitoPermissions): Contribution {
  const rows = declared(permissions);

  return {
    source: 'kuito.config.ts: permissions',
    kind: 'app',
    infoPlist: Object.fromEntries(
      rows.flatMap(({ usage, reason }) =>
        usage === null || typeof reason !== 'string' ? [] : [[usage, reason]],
      ),
    ),
    manifest: {
      usesPermissions: rows.flatMap(({ android }) =>
        android.map(({ name, maxSdk }) => ({ name: `android.permission.${name}`, maxSdk })),
      ),
    },
  };
}

type Modules = readonly NativeModuleSource[];

/** The link table a shell compiles: the functions of its included modules the app calls. */
export function linkSource(platform: Platform, modules: Modules, { catalog, ids }: ShellLink) {
  const specs = modules.flatMap(({ manifest, spec }) => (spec && manifest[platform] ? [spec] : []));

  return platform === 'ios' ? swiftLink(catalog, specs, ids) : kotlinLink(catalog, specs, ids);
}

const moduleEntries = ({ manifest, file }: NativeModuleSource): Contribution => ({
  source: file,
  kind: 'module',
  infoPlist: manifest.ios?.infoPlist,
  manifest: {
    usesPermissions: (manifest.android?.permissions ?? []).map((name) => ({ name })),
    usesFeatures: manifest.android?.features,
    providers: manifest.android?.providers,
    services: manifest.android?.services,
    receivers: manifest.android?.receivers,
  },
});

/**
 * What the shells' own files set and their code depends on: no other
 * source may change it.
 */
const SHELL: Contribution[] = [
  {
    source: 'the Kuito shell (native/ios/project.yml)',
    kind: 'shell',
    infoPlist: { UIApplicationSceneManifest: { UIApplicationSupportsMultipleScenes: false } },
  },
  {
    source: 'the Kuito shell (native/android/app/src/main/AndroidManifest.xml)',
    kind: 'shell',
    manifest: {
      application: {
        name: '.KuitoApplication',
        label: '${appName}',
        icon: '${appIcon}',
        roundIcon: '${appIcon}',
        theme: '@style/AppTheme',
      },
      activity: {
        exported: 'true',
        launchMode: 'singleTask',
        configChanges:
          'uiMode|locale|layoutDirection|orientation|screenSize|smallestScreenSize|screenLayout|fontScale',
      },
    },
  },
];

/**
 * The launch screen src/cli/splash-screens.ts generates (docs/splash.md): the
 * storyboard iOS launches with, or a blank one, without which iOS runs the
 * app letterboxed; and the theme Android's activity starts in.
 */
const splashEntries = ({ splash }: AppConfig): Contribution => ({
  source: 'kuito.config.ts: splash',
  kind: 'app',
  infoPlist: splash ? { UILaunchStoryboardName: 'Splash' } : { UILaunchScreen: {} },
  ...(splash && { manifest: { activity: { theme: '@style/Theme.Kuito.Splash' } } }),
});

/**
 * What only the development shell holds: any http load, for the dev server
 * and whatever an app under development fetches. A release shell keeps
 * App Transport Security as the app sets it.
 */
const DEVELOPMENT: Record<Profile, Contribution[]> = {
  debug: [
    {
      source: 'the Kuito development shell',
      kind: 'development',
      infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } },
    },
  ],
  release: [],
};

/** Every entry the shells get, from every source, merged once. */
export const nativeEntries = (config: AppConfig, modules: Modules, profile: Profile = 'debug') =>
  mergeEntries([
    ...SHELL,
    ...DEVELOPMENT[profile],
    ...settingsContributions(config),
    splashEntries(config),
    permissionEntries(config.permissions),
    ...modules.map(moduleEntries),
    ...rawContributions(config),
  ]);

/** XcodeGen names a package by its repository: `.../Lens.git` is `Lens`. */
const packageName = (url: string) =>
  url
    .replace(/\.git$/, '')
    .split('/')
    .at(-1) ?? url;

/** The Hermes package (src/cli/hermes-ios.ts), the modules' Swift packages and system frameworks. */
function swiftPackages(modules: Modules, hermes: string) {
  const packages = modules.flatMap(({ manifest }) => manifest.ios?.swiftPackages ?? []);
  const frameworks = [
    ...new Set(modules.flatMap(({ manifest }) => manifest.ios?.frameworks ?? [])),
  ];

  return {
    packages: {
      HermesEngine: { path: hermes },
      ...Object.fromEntries(packages.map(({ url, from }) => [packageName(url), { url, from }])),
    },
    dependencies: [
      { package: 'HermesEngine', product: 'hermesvm' },
      ...packages.flatMap(({ url, products }) =>
        products.map((product) => ({ package: packageName(url), product })),
      ),
      ...frameworks.map((framework) => ({ sdk: `${framework}.framework` })),
    ],
  };
}

/**
 * XcodeGen spec (JSON is YAML) layered over the framework's project.yml:
 * included specs merge, so the app adds its bundled JS, its modules' sources
 * and generated link table (`Generated/`), the Hermes package at `hermes`, and
 * overrides its id and name.
 */
export function iosProjectSpec(
  config: AppConfig,
  framework: string,
  modules: Modules,
  hermes: string,
  /** The app imports images: src/cli/bundled-images.ts writes their catalog beside this spec. */
  images = false,
  profile: Profile = 'debug',
  nativeDebug = false,
) {
  const native = join(framework, 'native/ios');
  // The asset catalog src/cli/app-icons.ts generates beside this spec.
  const icon = HAS_APP_ICON.ios(config);
  const ios = modules.filter(({ manifest }) => manifest.ios);
  const { packages, dependencies } = swiftPackages(ios, hermes);
  const { infoPlist, entitlements } = nativeEntries(config, ios, profile);
  const { deploymentTarget, supportsTablet, teamId } = config.ios;
  const raisedTarget = deploymentTarget !== SETTING_DEFAULTS.deploymentTarget;

  return JSON.stringify(
    {
      include: [{ path: join(native, 'project.yml'), relativePaths: true }],
      settings: {
        base: {
          KUITO_NATIVE: native,
          KUITO_HERMES: hermes,
          // The frame path's shared C++ (native/ios/project.yml), at the build's level when debugged.
          KUITO_NATIVE_OPTIMIZATION: nativeDebug ? '' : '-O2',
        },
      },
      packages,
      targets: {
        KuitoIOS: {
          sources: [
            { path: 'Resources', buildPhase: 'resources' },
            // Route modules' bytecode, loaded by name on first navigation (docs/navigation.md).
            { path: 'Modules', type: 'folder', buildPhase: 'resources' },
            ...(icon ? [{ path: 'AppIcon.xcassets' }] : []),
            ...(images ? [{ path: IMAGE_CATALOG }] : []),
            { path: 'Generated' },
            ...ios.map(({ directory }) => ({ path: join(directory, 'ios') })),
            // The fonts src/cli/fonts.ts writes beside this spec, a folder in the bundle.
            ...(config.fonts.length > 0
              ? [{ path: FONT_DIRECTORY, type: 'folder', buildPhase: 'resources' }]
              : []),
            // The launch storyboard src/cli/splash-screens.ts generates.
            ...(config.splash ? [{ path: 'Splash' }] : []),
          ],
          dependencies,
          ...(raisedTarget && { deploymentTarget }),
          settings: {
            base: {
              PRODUCT_BUNDLE_IDENTIFIER: config.ios.bundleIdentifier,
              ...(icon && { ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon' }),
              ...(raisedTarget && { IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget }),
              ...(!supportsTablet && { TARGETED_DEVICE_FAMILY: '1' }),
              // Automatic signing for an iPhone; simulator builds sign ad hoc (src/cli/platforms.ts).
              ...(teamId && { DEVELOPMENT_TEAM: teamId, CODE_SIGN_STYLE: 'Automatic' }),
            },
          },
          info: { path: 'Info.plist', properties: infoPlist },
          ...(Object.keys(entitlements).length && {
            entitlements: { path: 'KuitoIOS.entitlements', properties: entitlements },
          }),
        },
      },
    },
    null,
    2,
  );
}

/**
 * Merged over the framework's manifest: the permissions the app and its
 * included modules declare, and every manifest entry of its settings.
 */
export const androidManifest = (config: AppConfig, modules: Modules) =>
  renderManifest(nativeEntries(config, modules).manifest);

/** The app's `AppTheme`, by file under the resource directory `kuito.settingsRes` names. */
export function androidThemes(config: AppConfig, modules: Modules): Record<string, string> {
  const { theme } = nativeEntries(config, modules);
  const parents = THEME_PARENTS[config.colorScheme];

  return {
    'values/themes.xml': renderTheme(parents.day, { ...THEME_DEFAULTS.day, ...theme }),
    'values-night/themes.xml': renderTheme(parents.night, { ...THEME_DEFAULTS.night, ...theme }),
  };
}

/** Where the Android shell's generated link table and manifest go, in the app's `.kuito/`. */
export const androidGenerated = (cache: string) => ({
  sources: join(cache, 'android/generated'),
  link: join(cache, 'android/generated/dev/kuito/link/KuitoLink.kt'),
  manifest: join(cache, 'android/AndroidManifest.xml'),
  settings: join(cache, 'android/settings'),
});

/** Read by native/android's Gradle scripts, which default to the framework's own shell. */
export function androidProperties(
  { cache, config }: Project,
  modules: Modules,
  images = false,
  /** Builds the frame path's shared C++ at the build type's level (CMakeLists.txt). */
  nativeDebug = false,
) {
  const android = modules.filter(({ manifest }) => manifest.android);
  const generated = androidGenerated(cache);
  const resources = android.flatMap(({ androidResources }) => androidResources ?? []);
  const properties = {
    'kuito.applicationId': config.android.applicationId,
    'kuito.appName': config.name,
    'kuito.assets': join(cache, 'android/assets'),
    'kuito.buildDir': join(cache, 'android/build'),
    'kuito.sources': [
      generated.sources,
      ...android.map(({ directory }) => join(directory, 'android')),
    ].join(delimiter),
    'kuito.dependencies': [
      ...new Set(android.flatMap(({ manifest }) => manifest.android?.dependencies ?? [])),
    ].join(','),
    'kuito.manifest': generated.manifest,
    'kuito.versionName': config.version,
    'kuito.versionCode': String(config.buildNumber),
    'kuito.settingsRes': generated.settings,
    // The Kotlin plugin's state otherwise lands in native/android/.kotlin,
    // inside the framework, which npm may install read-only or share.
    'kotlin.project.persistent.dir': join(cache, 'android/.kotlin'),
    ...(config.android.minSdk !== SETTING_DEFAULTS.minSdk && {
      'kuito.minSdk': String(config.android.minSdk),
    }),
    // The launcher icon src/cli/app-icons.ts generates.
    ...(HAS_APP_ICON.android(config) && {
      'kuito.res': join(cache, 'android/res'),
    }),
    // Resources the modules' manifest entries name, like a FileProvider's paths.
    ...(resources.length > 0 && { 'kuito.moduleRes': resources.join(delimiter) }),
    // The imported images src/cli/bundled-images.ts writes.
    ...(images && { 'kuito.imagesRes': join(cache, 'android', IMAGE_RESOURCES) }),
    // The splash theme and drawables src/cli/splash-screens.ts generates.
    ...(config.splash && { 'kuito.splashRes': join(cache, 'android/splash') }),
    ...(nativeDebug && { 'kuito.nativeDebug': 'true' }),
  };

  return Object.entries(properties).map(([key, value]) => `-P${key}=${value}`);
}
