# {{name}}

A [Kuito](https://github.com/Fausto95/kuito) app: TypeScript on Hermes,
driving real UIKit and Android views.

## Run it

```sh
npm run ios       # kuito dev ios
npm run android   # kuito dev android
```

`kuito dev` builds the native shell, installs it on a simulator or emulator
(a picker appears when there are several), and starts Live Patch: save a file
and the running app updates in place, keeping its state. Press `?`
in the session for its shortcuts.

```sh
npm test          # kuito test: tests/ on the headless host, no simulator
```

The first build needs Xcode and XcodeGen for iOS, and the Android SDK, JDK 21
and Gradle 8 for Android. `npx kuito doctor` checks what is missing.

{{routes}}
## Where Kuito comes from

`package.json` depends on the `kuito` release that created this app;
upgrading is a version bump and `npm install`. An app created from a Kuito
checkout depends on it as a `file:` path instead: if you move the checkout,
update the path and run `npm install`.

This app commits no native projects. `kuito dev` generates the iOS and
Android shells from Kuito into `.kuito/` (gitignored), named and identified
by `kuito.config.ts`: change the name, ids or icon there, never in generated
files. `assets/icon.png` is the app icon; `npm run ios -- --env staging`
builds the staging environment, with its own name, icon and ids, beside it. `modules/` is reserved for the app's own native modules. See Kuito's
`docs/apps.md`.
