# App projects

An app made by `kuito create` holds TypeScript and configuration only. Everything native ships in the framework, and the CLI generates and builds each app's native shells on demand.

```text
MyApp/
  app/                 the app: file-based routes
  assets/              icon.png and icon-staging.png, the app icons; splash.png
  modules/             the app's own native modules
  kuito.config.ts      native settings: name, ids, icon, environments
  package.json         one dependency: kuito
  .kuito/              generated shells and builds; never committed
```

The app commits no `ios/` or `android/` project. `kuito` is its only dependency, and the shells are regenerated from the installed framework on every build, so a new version brings new shells.

## kuito.config.ts

`kuito.config.ts` is the only native input. Every `kuito` command that builds or runs an app needs one in the directory it runs in, and fails without one.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  version: '1.2.0',
  buildNumber: 14,
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
} satisfies KuitoConfig;
```

| Key                                             | Effect                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `name`                                          | The name under the app icon.                                                  |
| `version`                                       | What users see. Up to three numbers. `1.0.0`.                                 |
| `buildNumber`                                   | What the stores order uploads by. Raise it per upload. `1`.                   |
| `icon`                                          | The app icon on both platforms: a square PNG of at least 1024x1024. Optional. |
| `ios.bundleIdentifier`, `android.applicationId` | Reverse-DNS ids (`com.example.app`); what `kuito dev` installs and launches.  |

Other keys have pages of their own: `permissions` ([Permissions](../../../../docs/permissions.md#declare-them-in-kuitoconfigts)), `backgroundTasks` ([Background tasks](../../../../docs/background-tasks.md)), `fonts` ([Fonts](../../../../docs/fonts.md#bundle-fonts)), `migrations` ([Storage](../../../../docs/storage.md#migrations)) and `splash` ([Splash screen](../../../../docs/splash.md)).

The CLI checks the file: a missing or unknown key, a malformed id, an icon that is not a `.png` path or a malformed color is an error naming the file and the key. Image paths are relative to `kuito.config.ts`.

## Native settings

What would otherwise mean editing `Info.plist`, entitlements, `AndroidManifest.xml` or a theme is a key in the config. Typed keys come first: one value, written to each platform's own setting. A key left at its default writes nothing, so the shell's own setting stands.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  orientation: 'portrait',
  colorScheme: 'dark',
  backgroundColor: '#101418',
  statusBar: { style: 'light' },
  urlSchemes: ['myapp'],
  linkDomains: ['example.com'],
} satisfies KuitoConfig;
```

Anything without a typed key is still data, never a native file or an XML string: `ios.infoPlist`, `ios.entitlements`, `android.manifest` and `android.theme`. Every source of entries goes through one merge; two that disagree on a key fail the build naming both, so a raw entry can't contradict a typed key or a module.

## Environments

The config itself is the production app. An environment is a name and the keys that differ from it; every other key is inherited, nested keys one by one. A list (`fonts`, `urlSchemes`, `android.manifest.intentFilters`) is replaced whole. `idSuffix` appends to both the bundle id and the applicationId, so each environment installs as its own app beside the others.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
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

```sh
kuito dev ios                   # development
kuito dev ios --env staging     # MyApp Staging, com.example.myapp.staging
kuito build android             # production
```

`--env` picks one. `kuito dev` runs `development` and `kuito build` builds `production` when it is not given; any other name must be declared under `environments`. The environment is a build setting only; the app's JS does not see it yet.

## Native modules

`modules/<name>/` holds an app's own native modules: the spec `<name>.ts`, `ios/*.swift` and `android/*.kt`. `kuito module create <Name>` makes one. The CLI includes in each shell only the modules the app's bundle calls, so nobody edits the framework ([native modules](../../../../docs/native-modules.md#write-your-own-module)).

## In depth

[App projects](../../../../docs/apps.md) covers every config key, the full native-settings table, raw `Info.plist` and manifest entries, app icon generation, and what the generated Xcode and Gradle shells contain.
