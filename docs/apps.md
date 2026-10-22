# App projects

An app made by `kuito create` ([CLI](cli.md#create-an-app)) holds TypeScript
and configuration only. Everything native ships in the framework, and the
CLI generates and builds each app's native shells on demand.

```text
MyApp/
  app/                 the app: file-based routes (navigation.md)
  assets/              icon.png and icon-staging.png, the app icons; splash.png
  modules/             the app's own native modules (below)
  kuito.config.ts     native settings: name, ids, icon, environments
  package.json         one dependency: kuito
  tsconfig.json
  .gitignore           node_modules/, dist/, .kuito/
  .kuito/             generated shells and builds; never committed
```

## Decisions

| Decision                                                                                      | How the layout follows it                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An upgrade is one version bump.                                                               | The app commits no `ios/` or `android/` project. `kuito` is its only dependency, and the shells are regenerated from the installed framework on every build, so a new version brings new shells.                      |
| One package, one version: CLI, kernel, renderers, compiler and Hermes move together.          | All of them live in `kuito`: `src/cli`, `src/runtime`, `native/` and the Hermes pin, `native/hermes.json`. The app's `kuito` command is that package's `bin`.                                                         |
| App-specific native settings go in config, never in edited native files.                      | `kuito.config.ts` is the only native input. The CLI turns it into an XcodeGen spec and Gradle properties (`src/cli/shells.ts`); nothing in `.kuito/` is meant to be edited, and nothing in `native/` changes per app. |
| Native shells are generated into a cache, `.kuito/`, which is gitignored and never committed. | `kuito dev` and `kuito build` write everything there: the iOS project and derived data, Gradle's build and caches, and the bundled JS.                                                                                |
| Room for `kuito upgrade` (a bump plus codemods).                                              | Nothing an upgrade would have to merge lives in the app: only `kuito.config.ts` and app code, which codemods can rewrite.                                                                                             |

## kuito.config.ts

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  version: '1.2.0',
  buildNumber: 14,
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  environments: {
    staging: {
      name: 'MyApp Staging',
      idSuffix: '.staging',
      icon: './assets/icon-staging.png',
    },
  },
} satisfies KuitoConfig;
```

| Key                                | Effect                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `name`                             | The name under the app icon: `CFBundleDisplayName`, Android's app label.                                          |
| `version`                          | What users see: `CFBundleShortVersionString`, `versionName`. Up to three numbers. `1.0.0`.                        |
| `buildNumber`                      | What the stores order uploads by: `CFBundleVersion`, `versionCode`. Raise it per upload. `1`.                     |
| `icon`                             | The app icon on both platforms: a square PNG of at least 1024×1024. Optional.                                     |
| `ios.bundleIdentifier`             | `PRODUCT_BUNDLE_IDENTIFIER`; the id `kuito dev` installs and launches.                                            |
| `ios.icon.light`                   | Replaces `icon` on iOS.                                                                                           |
| `ios.icon.dark`, `ios.icon.tinted` | The icon's dark and tinted appearances (iOS 18). May be transparent.                                              |
| `android.applicationId`            | Gradle's `applicationId`; the package `kuito dev` installs and launches.                                          |
| `android.adaptiveIcon.foreground`  | The adaptive icon's foreground layer. Without it, `icon` fills the visible area.                                  |
| `android.adaptiveIcon.background`  | A color (`#1E88E5`) or a PNG. Defaults to `icon`'s top-left color, or white.                                      |
| `android.adaptiveIcon.monochrome`  | The single-color layer of Android 13's themed icons.                                                              |
| `permissions`                      | What the app asks for, with iOS's reasons; see [Permissions](permissions.md#declare-them-in-kuitoconfigts).       |
| `backgroundTasks`                  | Names of the tasks the OS may run in the background; see [Background tasks](background-tasks.md).                 |
| `fonts`                            | .ttf and .otf files `fontFamily` takes, bundled into both shells; see [Fonts](fonts.md#bundle-fonts).             |
| `strict`                           | A fallback to the JS thread fails the build; see [Placement](placement.md#the-placement-report). `false`.         |
| `migrations`                       | The app's database migrations, oldest first; see [Storage](storage.md#migrations). Not per environment.           |
| `updates.url`, `updates.publicKey` | Where a release build looks for over-the-air updates, and the key it checks them with; see [Updates](updates.md). |
| `splash.logo`                      | The launch screen's logo, a PNG drawn in the middle; see [Splash screen](splash.md).                              |
| `splash.logoWidth`                 | The logo's width in points and dp, up to 288. `100`.                                                              |
| `splash.background`                | The launch screen's color. `#FFFFFF`.                                                                             |
| `splash.brand`                     | A PNG fitted into a 200×80 box, 60 from the bottom. Optional.                                                     |
| `splash.dark`                      | `logo`, `background` and `brand` in dark mode.                                                                    |
| `splash.variants.<name>`           | Other looks the app can pick for its next launch (Android 13 and later).                                          |
| Native settings                    | Orientation, appearance, URL schemes, Info.plist and manifest entries; see [Native settings](#native-settings).   |
| `environments.<name>`              | Overrides of any key above but `migrations`, plus `idSuffix`, for one environment (below).                        |

The CLI loads the file with Node and checks it: a missing or unknown key, a malformed id, an
icon that is not a `.png` path, a font that is not a `.ttf` or `.otf` path or a malformed color is an error naming the file and the key, in
whichever environment it is. The ids are reverse-DNS (`com.example.app`); Android's segments
must start with a letter. Image paths are relative to `kuito.config.ts`. `version` must be up to three
numbers (the stores' format) and `buildNumber` a whole number up to 2100000000 (Google
Play's limit); there is no other copy of either, and the app's `package.json` has no
`version`. Every `kuito` command that builds or runs an app needs a `kuito.config.ts` in
the directory it runs in, and fails without one. This checkout hosts an app the same way:
`demo/` is Reel, with its own `kuito.config.ts` and `package.json` ([showcase](showcase.md#config)).

Planned keys, not read yet: Gradle properties. They will be overridable per environment
the same way.

### Native settings

What would otherwise mean editing `Info.plist`, entitlements, `AndroidManifest.xml` or a
theme is a key in the config. Typed keys come first: one value, written to each platform's
own setting.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  orientation: 'portrait',
  colorScheme: 'dark',
  backgroundColor: '#101418',
  statusBar: { style: 'light' },
  urlSchemes: ['myapp'],
  linkDomains: ['example.com'],
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp', softInputMode: 'resize' },
} satisfies KuitoConfig;
```

| Key                          | Values (default first)                             | iOS                                                                                                 | Android                                                                                                                      |
| ---------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `orientation`                | `default`, `portrait`, `landscape`                 | `UISupportedInterfaceOrientations` and its `~ipad` variant                                          | The activity's `android:screenOrientation`: `portrait` or `sensorLandscape`                                                  |
| `colorScheme`                | `automatic`, `light`, `dark`                       | `UIUserInterfaceStyle`                                                                              | `AppTheme`'s parent, and the activity's night mode (meta-data `dev.kuito.colorScheme`)                                       |
| `backgroundColor`            | none, or a color like `#101418`                    | The window's and root view's color (`KuitoBackgroundColor`)                                         | `AppTheme`'s `android:windowBackground`, and the root's color (meta-data `dev.kuito.backgroundColor`)                        |
| `statusBar.style`            | `auto`, `light`, `dark`                            | `UIStatusBarStyle`                                                                                  | `AppTheme`'s `android:windowLightStatusBar`                                                                                  |
| `statusBar.hidden`           | `false`, `true`                                    | `UIStatusBarHidden`                                                                                 | `AppTheme`'s `android:windowFullscreen`                                                                                      |
| `urlSchemes`                 | none, or schemes like `myapp`                      | `CFBundleURLTypes`                                                                                  | A `VIEW` / `BROWSABLE` intent filter on the activity                                                                         |
| `ios.supportsTablet`         | `true`, `false`                                    | `TARGETED_DEVICE_FAMILY`: `1,2` or `1`                                                              | —                                                                                                                            |
| `ios.requiresFullScreen`     | `false`, `true`                                    | `UIRequiresFullScreen`: opts out of iPad multitasking                                               | —                                                                                                                            |
| `ios.deploymentTarget`       | `16.0`, or later                                   | The target's deployment target                                                                      | —                                                                                                                            |
| `ios.teamId`                 | none, or a Team ID like `A1B2C3D4E5`               | `DEVELOPMENT_TEAM`: the team a phone or store build signs with ([signing](cli.md#signing))          | —                                                                                                                            |
| `linkDomains`                | none, or domains like `example.com`                | An `applinks:` entry each in the associated domains entitlement                                     | A verified (`autoVerify`) `VIEW` / `BROWSABLE` intent filter for `https` on each host ([linking](linking.md#link-domains))   |
| `ios.associatedDomains`      | none, or entries like `webcredentials:example.com` | The `com.apple.developer.associated-domains` entitlement, beside `linkDomains`'                     | —                                                                                                                            |
| `ios.backgroundModes`        | none, or `audio`, `location`, `fetch`, ...         | `UIBackgroundModes`                                                                                 | —                                                                                                                            |
| `ios.pushEnvironment`        | none, `development` or `production`                | The `aps-environment` entitlement remote push needs ([notifications](notifications.md#remote-push)) | —                                                                                                                            |
| `permissions.locationAlways` | none, or the reason iOS shows                      | `UIBackgroundModes` `location`, beside the reason                                                   | The `KuitoLocationService` foreground service and `FOREGROUND_SERVICE_LOCATION` ([Location](location.md#background-updates)) |
| `android.softInputMode`      | `resize`, `pan`                                    | —                                                                                                   | The activity's `android:windowSoftInputMode`: `adjustResize` or `adjustPan`                                                  |
| `android.minSdk`             | `26`, up to `35`                                   | —                                                                                                   | Gradle's `minSdk`                                                                                                            |
| `android.signing.keystore`   | none, or a keystore relative to the config         | —                                                                                                   | The upload key a release build signs with ([signing](cli.md#signing)); its passwords come from the environment only          |
| `android.signing.keyAlias`   | none, or the key's alias in that keystore          | —                                                                                                   | The upload key's alias                                                                                                       |

A key left at its default writes nothing, so the shell's own setting stands: the device's
orientations, the system's light or dark, the status bar following it. The status bar's
`style` names its content: `light` for a dark background. `SystemBars` changes both at run
time; these are what the app launches with. `portrait` keeps iPads able to turn upside
down, as Apple's templates do; on iPad an app that doesn't support every orientation also
needs `ios.requiresFullScreen` for the App Store.

`android.softInputMode` stays `resize` unless the app avoids the keyboard itself. The
shell is edge to edge, so `adjustResize` resizes nothing; it hands the keyboard's insets
to the views, which keep focused inputs clear of it ([Keyboard](keyboard.md#avoidance)).
`pan` makes the system slide the whole window up as well, so content moves twice unless
avoidance is turned off (`keyboard={{ inset: false }}`).

Not settable: the shell is always edge to edge (as React Native's new apps are, and as
Android 15 requires), and Android's `targetSdk` is the framework's `compileSdk`, 35.

#### Info.plist, entitlements, manifest and theme entries

Anything without a typed key is still data, never a native file or an XML string:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  ios: {
    bundleIdentifier: 'com.example.myapp',
    infoPlist: { LSApplicationQueriesSchemes: ['maps'], ITSAppUsesNonExemptEncryption: false },
    entitlements: { 'aps-environment': 'production' },
  },
  android: {
    applicationId: 'com.example.myapp',
    manifest: {
      application: { allowBackup: false },
      activity: { screenOrientation: 'fullUser' },
      metaData: { 'com.google.android.geo.API_KEY': 'AIza...' },
      usesPermissions: ['android.permission.VIBRATE'],
      usesFeatures: [{ name: 'android.hardware.camera', required: false }],
      queries: { packages: ['com.google.android.apps.maps'] },
      intentFilters: [
        {
          actions: ['android.intent.action.VIEW'],
          categories: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
          data: [{ scheme: 'https', host: 'example.com', pathPrefix: '/show' }],
          autoVerify: true,
        },
      ],
    },
    theme: { 'android:navigationBarColor': '#000000' },
  },
} satisfies KuitoConfig;
```

| Key                                | Written to                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ios.infoPlist`                    | The generated `Info.plist`. Values are strings, numbers, booleans, arrays and objects.            |
| `ios.entitlements`                 | The generated `KuitoIOS.entitlements`, the target's `CODE_SIGN_ENTITLEMENTS`.                     |
| `android.manifest.application`     | `<application>` attributes, named without `android:`.                                             |
| `android.manifest.activity`        | Attributes of the app's one activity, named without `android:`.                                   |
| `android.manifest.metaData`        | `<meta-data>` under `<application>`.                                                              |
| `android.manifest.usesPermissions` | `<uses-permission>`, beside those `permissions` and modules add.                                  |
| `android.manifest.usesFeatures`    | `<uses-feature>`; `required` defaults to `true`.                                                  |
| `android.manifest.queries`         | `<queries>`: `packages`, and `intents` (an `action` and optional `data`), for package visibility. |
| `android.manifest.intentFilters`   | `<intent-filter>`s on the activity: `actions`, `categories`, `data` and `autoVerify`.             |
| `android.theme`                    | `<item>`s of `AppTheme`, by name, in both its light and night variants.                           |

Each entry is checked like every other key: an unknown key, a name that isn't one, a value
that holds markup or isn't plist data fails with the key's path.

**One owner per entry.** Every source of entries goes through one merge
(`src/cli/native-entries.ts`): the config's typed keys and `permissions`, included native
modules' specs (`ios.infoPlist`, `android.permissions`, ...), these raw entries, and what the shell itself sets. Two that
disagree on a key fail the build naming both, like `Info.plist key UISupportedInterfaceOrientations
is set by both kuito.config.ts: orientation and kuito.config.ts: ios.infoPlist`. So a raw entry
can't contradict a typed key or a module, and what the shell's code depends on
(`UIApplicationSceneManifest`; the activity's `launchMode`, `exported` and `configChanges`; the
application's label, icon and theme) can't be set at all. Two exceptions: a declared
`permissions` reason replaces a module's default for the same usage key, and list keys that
several sources add to (`UIBackgroundModes`, `LSApplicationQueriesSchemes`, `UIAppFonts`,
`BGTaskSchedulerPermittedIdentifiers`, associated domains) are joined.

On Android the raw and typed entries land in the manifest overlay Gradle merges over the
shell's (`kuito.manifest`); an attribute the shell's manifest also sets is replaced with
`tools:replace`, which the overlay adds itself. `AppTheme` is generated into
`.kuito/android/settings` (`values` and `values-night`, `kuito.settingsRes`), replacing the
framework's.

### Environments

The config itself is the production app. An environment is a name and the keys that differ
from it; every other key is inherited, nested keys one by one (`ios: { icon: { dark } }`
keeps `ios.bundleIdentifier`; `buildNumber` can differ for a staging upload; `permissions: { microphone }` adds one to the base's). Maps of entries (`ios.infoPlist`,
`ios.entitlements`, `android.theme`, and `android.manifest`'s `application`, `activity` and
`metaData`) merge key by key too; a list (`fonts`, `urlSchemes`,
`android.manifest.intentFilters`) is replaced whole. `idSuffix` appends to both the bundle id and the
applicationId, so each environment installs as its own app beside the others.

```sh
kuito dev ios                   # development
kuito dev ios --env staging     # MyApp Staging, com.example.myapp.staging
kuito build android             # production
```

`--env` picks one. `kuito dev` runs `development` and `kuito build` builds `production` when
it is not given. Both always exist and are the config as written unless declared; any other
name must be declared under `environments`. Names are lowercase letters, digits and `-`.

Environments are data, not code: one object per environment, so a mistake is an error that
names its key, and later keys become overridable without new mechanisms: an environment's
`splash: { background }` changes the color and keeps the logo. The environment is a build setting only; the app's JS does not see it yet.

### App icons

One 1024×1024 PNG is enough. On each build the CLI generates what each platform needs into
`.kuito/` (`src/cli/app-icons.ts`):

- **iOS**: `.kuito/ios/AppIcon.xcassets`, a single-size 1024 `AppIcon` with its dark and
  tinted appearances when the config has them. Xcode derives every other size. iOS icons are
  opaque: an icon with transparency is flattened onto white, and the session shows a warning
  naming the key, so export it without alpha to choose the background.
- **Android**: `.kuito/android/res`: an adaptive icon (`mipmap-anydpi-v26`) with 108dp
  foreground, background and monochrome layers, and 48dp legacy icons composed from the same
  layers, at every density from mdpi to xxxhdpi. Without `adaptiveIcon`, the whole icon is
  drawn into the 72dp a launcher's mask shows, over the icon's own corner color, so no part of
  it is cut off; set `adaptiveIcon.foreground` for artwork that bleeds into the margin.

Sources are checked first: each must be a PNG (not interlaced), square and at least 1024px,
or the build fails naming the key. The images are decoded, resampled and encoded by a small
PNG codec on `node:zlib` (`src/cli/png.ts`), so no image tool or package is needed and it runs
wherever Gradle does. Generation is skipped when neither the sources' bytes nor the config
changed since the last build (a stamp beside the generated directory).

## Generated shells

`kuito dev` and `kuito build` run in the project's directory and write to its `.kuito/`:

- **iOS**: `.kuito/ios/project.json` is an XcodeGen spec that includes the framework's
  `native/ios/project.yml` and adds the app's bundled JS and migrations (`Resources/`), bundle id, display
  name, version, build number, Info.plist entries and entitlements ([native settings](#native-settings)),
  icon catalog, the imported images' catalog (`Assets.xcassets`, [assets](assets.md)), launch screen (`Splash/`, [Splash screen](splash.md)), bundled fonts (`fonts/`, listed in `UIAppFonts`), the included native
  modules' sources and the generated link table (`Generated/KuitoLink.swift`); included specs merge, so
  the framework's spec is not edited. `KUITO_NATIVE` points the framework spec's own paths
  back into `native/ios`. Hermes is a local Swift package, `HermesEngine`, at
  `KUITO_HERMES` (`~/.cache/kuito/hermes-ios-<version>`, see [the CLI](cli.md)); the
  modules' Swift packages join it. xcodebuild builds `KuitoIOS.xcodeproj` and resolves
  the packages itself. Derived data goes to `.kuito/build/ios`.
- **Android**: Gradle builds the framework's `native/android` with `-Pkuito.applicationId`,
  `kuito.appName`, `kuito.assets` (the bundled JS, fonts and migrations), `kuito.buildDir`, the native modules'
  `kuito.sources` and `kuito.dependencies`, `kuito.manifest` (the permissions the app and
  its modules declare, the background task service and every manifest entry of its
  settings, merged over the framework's manifest), `kuito.settingsRes` (the app's
  `AppTheme`), `kuito.versionName`, `kuito.versionCode`, `kuito.minSdk` (when raised) and
  `kuito.res` (the generated icon, when there is one), `kuito.splashRes` (the splash theme's
  resources, when there is one), `kuito.imagesRes` (the imported images, when the app
  imports any, [assets](assets.md)), and
  `--project-cache-dir .kuito/android/.gradle`. The link table is generated too (`generated/dev/kuito/link/KuitoLink.kt`), so the
  project builds only through the CLI (`kuito build android`).

Each app installs as its own app, beside other Kuito apps on the same device.

## Native modules

`modules/<name>/` holds an app's own native modules: the spec `<name>.ts`, `ios/*.swift`
and `android/*.kt`. `kuito module create <Name>` makes one. The CLI discovers them beside
Kuito's built-ins, includes in each shell only the modules the app's bundle calls, and
generates the link table of the functions it calls, so nobody edits the framework. See
[native modules](native-modules.md#write-your-own-module).

Lifecycle hooks, third-party module packages and `kuito prebuild` come later.
