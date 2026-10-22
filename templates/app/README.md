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
in `app/` and the running app updates in place, keeping its state. Press `?`
in the session for its shortcuts.

```sh
npm test          # kuito test: tests/ on the headless host, no simulator
```

The first build needs Xcode and XcodeGen for iOS, and the Android SDK, JDK 21
and Gradle 8 for Android. `npx kuito doctor` checks what is missing.

## What's inside

```text
app/
  _layout.tsx                  the tab bar: Home and Explore
  (home)/index.tsx             /                 counter, motion, image
  (explore)/explore.tsx        /explore          a List of topics
  (explore)/explore/[topic].tsx /explore/:topic  a pushed screen with a live demo
  about.tsx                    /about            a sheet
  sign-in.tsx, sign-up.tsx     /sign-in, /sign-up  account sheets: fields that
                               tell the keyboard and autofill what they hold
  _components/                 not routes: shared components and data
  _components/demos/           one demo per topic: layout, text and image,
                               state, motion, gestures, async, lists,
                               navigation
tests/
  home.test.tsx                Home's counter on the headless host: npm test
  account.test.tsx             the sign-in and sign-up forms
```

Every `.tsx` file in `app/` is a route; `(group)` directories are the tabs
`_layout.tsx` declares, `[name]` is a parameter, and files under `_` are not
routes. See Kuito's `docs/navigation.md`.

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
