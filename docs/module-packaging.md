# Module packaging

Plan item 2.9.3: tree shaking drops whole native modules, not only their
functions, and a module ships as a package without an Expo-style manifest.
Both parts are built: A, the shell names no module; B, packages
([native modules](native-modules.md#ship-a-module-in-a-package)).

## Before

- A module was its spec (`<dir>/<dir>.ts`), with `always` among its native
  needs. `kuito-module.json` and the name registry went with #206.
- Eight modules set `always` and shipped in every shell: AppState,
  Appearance, BackgroundTasks, Linking, Notifications, Splash, SystemUI and
  Window, about 1,300 lines of Swift and 1,500 of Kotlin. Every Android
  app's manifest carried Notifications' `SCHEDULE_EXACT_ALARM` and
  `RECEIVE_BOOT_COMPLETED` and its two receivers, and Google Play restricts
  exact alarms to apps that need them. The reason: the shell named
  singletons that lived in those modules (`KuitoLinks.shared`,
  `KuitoSplash.shared`, `KuitoWindowMetrics`, ...).
- Specs were found only in `native/modules/` and the app's `modules/`.

## A. The shell names no module

- What only the shell sees is the shell's own state, in
  `native/ios/App/Shell` and `dev.kuito.runtime.shell`: `KuitoLinks`,
  `KuitoAppLifecycle`, `KuitoTraits`, `KuitoWindowMetrics`,
  `KuitoSystemBars` and `KuitoPushRegistration`. The shell writes it; a
  module reads and observes it. Camera, Audio, Video and WebView read it too,
  so they no longer require AppState or Linking.
- The launch screen is the shell's (`KuitoSplash`). It hides at the first
  frame with content ([splash](splash.md#until-the-app-is-ready)), Splash
  module or not; the module adds `hold`, `hide`, `visible`, `layout` and
  variants.
- Work iOS or Android takes only at launch is a module's
  [launch](native-modules.md#launch) (`launch: true` in its `ios` or
  `android` section): BackgroundTasks registers its BGTaskScheduler
  handlers and the headless runtime's start, Location starts that runtime
  when iOS relaunched the app for a location event, Notifications becomes
  the notification center's delegate. The generated `KuitoLink.launch()` calls
  the included ones.
- `always` is gone from the spec format. A module is in a shell exactly when
  the bundle calls it, a module it calls requires it, or the config needs
  it: declared background tasks bring BackgroundTasks, whose job service
  runs them, and `locationAlways` brings Location, whose foreground service
  it declares (`configuredModules`, src/cli/modules.ts).

## B. A module in a package is the same directory

A package ships modules laid out as an app's `modules/` are, and names the
directory in its `package.json`:

```json
{ "name": "kuito-battery", "kuito": { "modules": "modules" } }
```

The CLI reads that key only for packages in the app's own `dependencies`,
and catalogs their specs beside the built-ins and the app's. The spec stays
the manifest: no JSON file, config plugin or autolinking step to keep in
sync. An app imports the spec, or a namespace the package exports, as it
imports its own (`import Battery from 'kuito-battery/modules/battery/battery'`).
The rules that hold today hold across packages: two modules of one name, or
two specs that declare one type name, fail the build naming both files.

## Not in scope

- Stable ids across spec changes. Numbering stays global, so adding a
  package rebuilds the shell once, as adding an app module does.
- Prebuilt binaries in packages: a package ships sources, compiled with the
  shell.
