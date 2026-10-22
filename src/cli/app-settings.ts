/**
 * What each kuito.config.ts setting writes into the shells (docs/apps.md
 * "Native settings"): one table per setting, from its value to entries for
 * the merge in src/cli/native-entries.ts. A setting at its default writes
 * nothing, and the shell's own behavior stands.
 */
import { FONT_DIRECTORY, fontFileName } from './fonts.ts';
import type { Contribution } from './native-entries.ts';
import type {
  AppConfig,
  Orientation,
  SoftInputMode,
  StatusBarStyle,
  ColorScheme,
} from './kuito-config.ts';

type Entries = Omit<Contribution, 'source' | 'kind'>;

const PORTRAIT = 'UIInterfaceOrientationPortrait';
const LANDSCAPE = ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'];

const ORIENTATIONS: Record<Orientation, Entries> = {
  default: {},
  portrait: {
    infoPlist: {
      UISupportedInterfaceOrientations: [PORTRAIT],
      // iPad apps rotate upside down too; Apple's templates keep it.
      'UISupportedInterfaceOrientations~ipad': [
        PORTRAIT,
        'UIInterfaceOrientationPortraitUpsideDown',
      ],
    },
    manifest: { activity: { screenOrientation: 'portrait' } },
  },
  landscape: {
    infoPlist: {
      UISupportedInterfaceOrientations: LANDSCAPE,
      'UISupportedInterfaceOrientations~ipad': LANDSCAPE,
    },
    // Either way up, like iOS.
    manifest: { activity: { screenOrientation: 'sensorLandscape' } },
  },
};

/** Android has no Info.plist switch: KuitoAppSettings.kt forces night mode from the meta-data. */
const forced = (ios: string, android: string): Entries => ({
  infoPlist: { UIUserInterfaceStyle: ios },
  manifest: { metaData: { 'dev.kuito.colorScheme': android } },
});

const COLOR_SCHEMES: Record<ColorScheme, Entries> = {
  automatic: {},
  light: forced('Light', 'light'),
  dark: forced('Dark', 'dark'),
};

/** The theme's parent in each variant, `values` and `values-night`. */
export const THEME_PARENTS: Record<ColorScheme, { day: string; night: string }> = {
  automatic: {
    day: '@android:style/Theme.Material.Light.NoActionBar',
    night: '@android:style/Theme.Material.NoActionBar',
  },
  light: {
    day: '@android:style/Theme.Material.Light.NoActionBar',
    night: '@android:style/Theme.Material.Light.NoActionBar',
  },
  dark: {
    day: '@android:style/Theme.Material.NoActionBar',
    night: '@android:style/Theme.Material.NoActionBar',
  },
};

/**
 * AppTheme's own items, which settings may replace: by default the status
 * bar's content is dark on the light theme and light on the dark one, as on iOS.
 */
export const THEME_DEFAULTS = {
  day: { 'android:windowLightStatusBar': 'true' },
  night: { 'android:windowLightStatusBar': 'false' },
};

const STATUS_BAR_STYLES: Record<StatusBarStyle, Entries> = {
  auto: {},
  light: {
    infoPlist: { UIStatusBarStyle: 'UIStatusBarStyleLightContent' },
    theme: { 'android:windowLightStatusBar': 'false' },
  },
  dark: {
    infoPlist: { UIStatusBarStyle: 'UIStatusBarStyleDarkContent' },
    theme: { 'android:windowLightStatusBar': 'true' },
  },
};

const SOFT_INPUT_MODES: Record<SoftInputMode, Entries> = {
  resize: {},
  pan: { manifest: { activity: { windowSoftInputMode: 'adjustPan' } } },
};

/** Each typed setting's entries, by the config key that sets it. */
const SETTINGS: Record<string, (config: AppConfig) => Entries> = {
  orientation: ({ orientation }) => ORIENTATIONS[orientation],
  colorScheme: ({ colorScheme }) => COLOR_SCHEMES[colorScheme],
  // The shells paint their root with it (KuitoAppSettings); the theme covers the launch.
  backgroundColor: ({ backgroundColor: color }) =>
    color === null
      ? {}
      : {
          infoPlist: { KuitoBackgroundColor: color },
          manifest: { metaData: { 'dev.kuito.backgroundColor': color } },
          theme: { 'android:windowBackground': color },
        },
  'statusBar.style': ({ statusBar }) => STATUS_BAR_STYLES[statusBar.style],
  'statusBar.hidden': ({ statusBar }) =>
    statusBar.hidden
      ? { infoPlist: { UIStatusBarHidden: true }, theme: { 'android:windowFullscreen': 'true' } }
      : {},
  urlSchemes: ({ urlSchemes, ios }) =>
    urlSchemes.length === 0
      ? {}
      : {
          infoPlist: {
            CFBundleURLTypes: [
              { CFBundleURLName: ios.bundleIdentifier, CFBundleURLSchemes: urlSchemes },
            ],
          },
          manifest: {
            intentFilters: [
              {
                actions: ['android.intent.action.VIEW'],
                categories: [
                  'android.intent.category.DEFAULT',
                  'android.intent.category.BROWSABLE',
                ],
                data: urlSchemes.map((scheme) => ({ scheme })),
                autoVerify: false,
              },
            ],
          },
        },
  'ios.requiresFullScreen': ({ ios }) =>
    ios.requiresFullScreen ? { infoPlist: { UIRequiresFullScreen: true } } : {},
  'ios.pushEnvironment': ({ ios }) =>
    ios.pushEnvironment === null
      ? {}
      : { entitlements: { 'aps-environment': ios.pushEnvironment } },
  'ios.associatedDomains': ({ ios }) =>
    ios.associatedDomains.length
      ? { entitlements: { 'com.apple.developer.associated-domains': ios.associatedDomains } }
      : {},
  // The site proves the link is the app's: apple-app-site-association and
  // assetlinks.json under /.well-known (docs/linking.md#link-domains).
  linkDomains: ({ linkDomains }) =>
    linkDomains.length === 0
      ? {}
      : {
          entitlements: {
            'com.apple.developer.associated-domains': linkDomains.map(
              (domain) => 'applinks:' + domain,
            ),
          },
          manifest: {
            intentFilters: [
              {
                actions: ['android.intent.action.VIEW'],
                categories: [
                  'android.intent.category.DEFAULT',
                  'android.intent.category.BROWSABLE',
                ],
                data: linkDomains.map((host) => ({ scheme: 'https', host })),
                autoVerify: true,
              },
            ],
          },
        },
  'ios.backgroundModes': ({ ios }) =>
    ios.backgroundModes.length ? { infoPlist: { UIBackgroundModes: ios.backgroundModes } } : {},
  'android.softInputMode': ({ android }) => SOFT_INPUT_MODES[android.softInputMode],
  // BGTaskScheduler runs only identifiers the Info.plist permits, in a mode it declares;
  // Android's JobService accepts the names in the meta-data (docs/background-tasks.md).
  backgroundTasks: ({ backgroundTasks: tasks }) =>
    tasks.length === 0
      ? {}
      : {
          infoPlist: {
            BGTaskSchedulerPermittedIdentifiers: tasks,
            // `fetch` for app refresh tasks, `processing` for those that wait for power.
            UIBackgroundModes: ['fetch', 'processing'],
          },
          manifest: {
            // Keeps registered jobs across reboots.
            usesPermissions: [{ name: 'android.permission.RECEIVE_BOOT_COMPLETED' }],
            metaData: { 'dev.kuito.backgroundTasks': tasks.join(',') },
            services: [
              {
                name: 'dev.kuito.runtime.modules.backgroundtasks.KuitoBackgroundTaskService',
                permission: 'android.permission.BIND_JOB_SERVICE',
                exported: 'false',
              },
            ],
          },
        },
  // Location tasks (docs/location.md#background-updates): iOS keeps locating in the
  // `location` mode; Android, in a foreground service of type location.
  'permissions.locationAlways': ({ permissions }) =>
    permissions.locationAlways === undefined
      ? {}
      : {
          infoPlist: { UIBackgroundModes: ['location'] },
          manifest: {
            usesPermissions: [
              { name: 'android.permission.FOREGROUND_SERVICE' },
              { name: 'android.permission.FOREGROUND_SERVICE_LOCATION' },
            ],
            services: [
              {
                name: 'dev.kuito.runtime.modules.location.KuitoLocationService',
                foregroundServiceType: 'location',
                exported: 'false',
              },
            ],
          },
        },
  // The fonts src/cli/fonts.ts writes into the bundle's fonts/ folder (docs/fonts.md).
  fonts: ({ fonts }) =>
    fonts.length === 0
      ? {}
      : {
          infoPlist: { UIAppFonts: fonts.map((font) => `${FONT_DIRECTORY}/${fontFileName(font)}`) },
        },
};

/** The config's own keys, written as they are. */
const CORE: Record<string, (config: AppConfig) => Entries> = {
  name: ({ name }) => ({ infoPlist: { CFBundleDisplayName: name } }),
  version: ({ version }) => ({ infoPlist: { CFBundleShortVersionString: version } }),
  buildNumber: ({ buildNumber }) => ({ infoPlist: { CFBundleVersion: String(buildNumber) } }),
};

const contributions = (
  table: Record<string, (config: AppConfig) => Entries>,
  config: AppConfig,
): Contribution[] =>
  Object.entries(table).map(([key, entries]) => ({
    source: `kuito.config.ts: ${key}`,
    kind: 'app',
    ...entries(config),
  }));

/** The config's typed keys, as contributions. */
export const settingsContributions = (config: AppConfig) => [
  ...contributions(CORE, config),
  ...contributions(SETTINGS, config),
];

/** The config's escape hatch: raw entries, which may not contradict any other source. */
export function rawContributions({ ios, android }: AppConfig): Contribution[] {
  const { usesPermissions, ...manifest } = android.manifest;

  return [
    { source: 'kuito.config.ts: ios.infoPlist', kind: 'raw', infoPlist: ios.infoPlist },
    { source: 'kuito.config.ts: ios.entitlements', kind: 'raw', entitlements: ios.entitlements },
    {
      source: 'kuito.config.ts: android.manifest',
      kind: 'raw',
      manifest: { ...manifest, usesPermissions: usesPermissions.map((name) => ({ name })) },
    },
    { source: 'kuito.config.ts: android.theme', kind: 'raw', theme: android.theme },
  ];
}
