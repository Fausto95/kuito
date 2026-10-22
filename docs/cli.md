# Kuito CLI — simulator-to-source in one command

The CLI is the intended entry point to Kuito's native development loop. It discovers devices, boots an iOS Simulator or Android Emulator, builds the relevant native development shell, installs the app, launches it and starts the Rolldown/Oxc Live Patch watcher. You do **not** have to open Xcode or Android Studio to run the app, but the underlying Apple/Android SDKs must be installed.

## Quick start

```sh
kuito doctor
kuito devices
kuito dev ios
kuito dev android --device Pixel_9
```

`kuito` runs the app in the directory it is started in, which needs a `kuito.config.ts`; in this checkout that is `demo/` (`cd demo && kuito dev ios`). The default entry is `./app`. To use another entry: `kuito dev ios --entry navigation.tsx` in `demo/`. For headless use: `kuito devices --json` or supply `--device` (a prompt is only shown when several devices are available and a real TTY exists). `kuito --help` shows all commands and switches.

## Create an app

```sh
npx kuito create MyApp # alias: kuito init MyApp
cd MyApp
npx kuito dev ios      # or: npx kuito dev android
```

`kuito create <name>` writes a new app into `./<name>` and runs `npm install`
there (`--no-install` skips it). The name starts with a letter and holds
letters, digits, `-` and `_`; it names the directory, and lowercased, the npm
package. An existing directory must be empty: `create` never overwrites files.

```text
MyApp/
  package.json     scripts ios / android / start; depends on kuito
  kuito.config.ts native settings: name, ids, icon, a staging environment (docs/apps.md)
  assets/          icon.png, icon-staging.png and splash.png
  tsconfig.json    Kuito's JSX settings, for the editor and tsc
  README.md
  .gitignore       includes .kuito/, the generated shells
  modules/         the app's native modules (kuito module create)
  app/             file-based routes (docs/navigation.md)
    _layout.tsx                    Home and Explore tabs, platform symbols
    (home)/index.tsx               image, state, a motion animation, links
    (explore)/explore.tsx          a List of topics
    (explore)/explore/[topic].tsx  each topic with a live demo
    about.tsx                      a sheet
    _components/                   shared components, topics and demos
```

The template lives in `templates/app`, `kuito.config.ts` included, with the app's
name and `com.example.<name>` ids filled in; `package.json` and `tsconfig.json` are
written by `src/cli/create.ts`.

**Where Kuito comes from.** `kuito create` adds the published `kuito` package
as the app's dependency and installs it. That package is the app's imports
and types, and the `kuito` command. Upgrading is a version bump.

**Native shells stay in the framework.** The app commits no native project.
`kuito dev` and `kuito build` generate its shells from the framework's
`native/ios` and `native/android`, configured by `kuito.config.ts`, into the
app's gitignored `.kuito/`, and install them under the app's own name and
ids. Copying the native projects into every app would fork them on the first
framework change; upgrading is a version bump instead. [App projects](apps.md)
covers the layout, the config keys and how the shells are generated.

**Environments.** `--env <name>` builds one of the config's environments:
`kuito dev ios --env staging` installs the starter's staging app, with its own
name, icon and ids, beside the production one. `kuito dev` defaults to
`development` and `kuito build` to `production` ([environments](apps.md#environments)).

**Entry.** `--entry` is relative to the directory `kuito` runs in. Without it,
`kuito dev` runs `./app`: the `app/` directory when it exists, and otherwise
`app.tsx`. This checkout's `demo/` has an `app/` directory, Reel. The Live Patch server runs in that directory too,
so the LogBox opens the app's files and the session shows paths relative to it.

## Interactive experience

`kuito dev` opens a type-to-filter device picker when several targets exist (booted first, then newest runtime; `--device` accepts an exact name such as `"iPhone 18 Pro"`). The session then prints one settled line per step — device booted, native app built, Live Patch started, app launched — followed by one line per edit:

```
02:05:14  ✔ patched   app.tsx  rev 2 · 18ms
02:05:14  ✔ applied   app.tsx → iPhone 18 Pro  rev 2 · 142ms from save · eval 9ms
02:05:40  ✖ rejected  app.tsx:12:4
            Unexpected token
             12 |   return (,
            previous version stays live
```

`patched` is the build: its revision and how long compiling took, or `no device
connected` when it reached none. Each device then acks the revision itself
([the dev link](devtools.md#the-dev-link)): `applied` names the device and the
time from saving the file to that device having evaluated the patch, and a
patch that throws on a device shows `rejected on <device>` with the error.
Under the feed, one line per connected device shows the last revision it acked;
with no device connected there are none.

After the first build, and whenever a file's placement changes, a `Placement`
item lists what each file runs on the UI thread and every fallback to the JS
thread with its line and reason ([Placement](placement.md#the-placement-report)).

A persistent bar lists single-key shortcuts: `r` rebuild and relaunch, `l` toggle device logs, `d` switch device, `m` open the devtools on the device ([devtools](devtools.md)), `j` debug the JS thread in Chrome DevTools (`u` for the UI thread, [debugging](devtools.md#debugging-with-chrome-devtools)), `k` the Components panel ([components](devtools.md#components)), `s` save a recording for a golden test ([recording](devtools.md#recording-and-replay)), `c` clear, `?` help, `q` quit; `kuito help` lists the same table. Colours are the terminal's own named ANSI colours, so light and dark themes stay readable. Build output is hidden unless `--verbose` is set; a failing step shows its summary and the lines of tool output that name the error. Compile errors — in a startup step (the device engine compiles the app first) or a rejected edit — show `file:line:column`, the code frame and the compiler that reported them (for example `reported by the styles() compiler`); errors without a line still name the file.

The Live Patch compiler stays alive between edits: a rebuild reruns Kuito's transforms only for the modules whose source changed, and a build whose output is the same as the last one (a comment, an unused export) is the same revision and sends no patch.

Native code reloads too. Saving a `.swift`, `.kt` or `.ts` file under the app's `modules/` rebuilds the shell incrementally and relaunches the app, and so does a Live Patch that calls a native module function the running shell didn't link ([native modules](native-modules.md#4-use-it)). TypeScript edits stay Live Patches.

The CLI watches the launched app. When it crashes, the session shows the cause and top frames — from the macOS crash report (`~/Library/Logs/DiagnosticReports`) for the iOS Simulator, and from `adb logcat -b crash` for Java exceptions and native tombstones on Android — and offers `r` to rebuild and relaunch. An app that exits without crashing (for example, swiped away) only produces a warning.

Without a TTY (CI, pipes) the same feed is printed as plain lines, stdin accepts `quit` and passes `devtools`, `components` and `debug js|ui` to the dev server, and a crash ends the command with exit code 1.

The app's `console` output appears in the session at the source line that logged it, and the [LogBox](logbox.md) opens frames in the editor named by `KUITO_EDITOR`.

The CLI talks to the Live Patch server through newline-delimited JSON events: `ready`, `patched` (revision, build duration, edited files, whether it is the initial build, how many devices it reached, the native modules the bundle requires), `unchanged` (a rebuild with the same output; nothing sent), `rejected` (diagnostics with file, line, column and code frame), `device:connected` and `device:disconnected` (a device's id, name and platform), `device:applied` (revision, evaluation time on the device, and the time from the edit to this ack) and `device:rejected` (revision, code, message) for each device's ack ([the dev link](devtools.md#the-dev-link)), `console` (level, message, file, line, column), `placement` (each changed file's report: site, line, column and, for a fallback, its reason), `error` and `state`. The server writes nothing else: `kuito dev` runs it and shows what it reports.

Other commands:

- `kuito create <name>`: a new app ([above](#create-an-app)).
- `kuito module create <Name>`: a native module in `./modules/<name>` (kebab case): its TypeScript spec, Swift and Kotlin ([native modules](native-modules.md#write-your-own-module)).
- `kuito build ios|android`: compile without launching an emulator or starting Live Patch. `--profile release` builds the signed `.ipa` and `.aab` an app ships ([release builds](#release-builds)); `--device` picks a simulator, an emulator or a phone to build for instead.
- `kuito test [ios|android] [files...]`: run the app's `*.test.tsx` files on the headless host, no simulator or SDK needed ([testing](testing.md)).
- `kuito update build ios|android`: compile and sign an over-the-air update of a release build, laid out to upload to `updates.url`; `kuito update key <file>` makes the key pair that signs them ([updates](updates.md)).
- `kuito symbolicate <report.json>`: map a release build's crash report back to the app's source, with the maps that build kept ([crash reports](crash-reports.md#symbolication)).
- `kuito devices`: show iOS simulators, running Android emulators and connected devices, installed stopped AVDs, and the iPhones and iPads paired with this Mac (`xcrun devicectl list devices`), connected or not. A dev session lists them too and runs on one over its CoreDevice tunnel ([Live Patch on an iPhone](phone-live-patch.md)).
- `kuito doctor`: what the build needs that this machine lacks, with how to fix each.
- `kuito logs ios|android --device ...`: stream platform logs.
- `kuito dev ios --no-launch --port 9000`: run the Live Patch server only. Each platform gets
  its own bundle ([platforms](styles.md#platforms)), so a session serves one platform's
  devices and needs it named; a device of the other platform is reported as an error. An
  app started some other way must send the session's token: set `KUITO_DEV_TOKEN` (43
  characters or more) for `kuito dev` and in the app's environment (iOS) or its
  `files/kuito-dev-link.json` (Android).

## Release builds

`kuito build ios|android --profile release` builds the app as it ships. Without
`--device` it makes what the stores take: an `.ipa` for App Store Connect and an `.aab`
for Google Play, each signed with your credentials ([signing](#signing)). With `--device`
it makes the same release app to install on that device, so what a phone runs and what is
measured on it is the real thing. `debug`, the default, is what `kuito dev` runs; only
`kuito build` takes `--profile`.

| Step     | `debug`                                     | `release`                                                                                                            |
| -------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Bytecode | `hermesc -O0 -g3`: every scope debuggable   | `hermesc -O`, no debug info                                                                                          |
| Kernel   | The dev kernel                              | The release kernel: no devtools, update causes or time travel, minified ([devtools](devtools.md#the-release-kernel)) |
| iOS      | `Debug`, the debug Hermes with its debugger | `Release`, the release Hermes (`iosReleaseSha256`, `~/.cache/kuito/hermes-ios-<version>-release`)                    |
| Android  | `:app:assembleDebug`                        | `:app:assembleRelease` for a device, `:app:bundleRelease` for the store: R8 shrinks both                             |
| C++      | `-O0`, the frame path's at `-O2`            | `-O2` ([native optimization](performance.md#native-optimization))                                                    |

| Artifact             | iOS                                                                                                       | Android                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| No `--device`        | `xcodebuild archive`, then `-exportArchive` for App Store Connect: `.kuito/build/ios/export/KuitoIOS.ipa` | `.kuito/android/build/app/outputs/bundle/release/app-release.aab` |
| `--device <phone>`   | `.kuito/build/ios/Build/Products/Release-iphoneos/KuitoIOS.app`, development signed                       | `.kuito/android/build/app/outputs/apk/release/app-release.apk`    |
| `--device <virtual>` | `Release-iphonesimulator/KuitoIOS.app`, signed ad hoc                                                     | The same APK                                                      |

`--device` takes a simulator, an emulator or a phone, by its name or UDID from
`kuito devices`. A simulator build is signed ad hoc in both profiles. `kuito build`
prints where the artifact is and does not install it; on a phone,
`xcrun devicectl device install app --device <UDID> <app>` or `adb install` does.

The version users see and the build number the stores order uploads by are `version` and
`buildNumber` in `kuito.config.ts` ([apps](apps.md#kuitoconfigts)): raise
`buildNumber` for every upload. The export keeps them as written; Xcode does not raise the
build number on its own. `kuito submit`, which would upload the artifacts, does not exist
yet: upload the `.ipa` with Xcode's Organizer or Transporter, and the `.aab` in the Play
Console.

A release shell is the production shell: it compiles none of the dev server connection,
the inspector, the devtools or the LogBox, allows no plain http load the app did not ask
for, and carries the app as bytecode only, without the source a debug shell keeps to
recognize a Live Patch ([isolation](on-device-hermes.md#verification-gates-and-kill-criteria)).
Console output and failures go to the system log: Xcode's console or Console.app, and
logcat with the tag `Kuito`; errors and crashes are also recorded as [crash
reports](crash-reports.md), and the source maps that resolve them are kept in
`.kuito/sourcemaps/`.

### Signing

A phone or store build for iOS uses automatic signing with the team `ios.teamId` names in
`kuito.config.ts`, the 10-character ID under Xcode › Settings › Accounts, and passes
`-allowProvisioningUpdates` so Xcode may create the certificates and provisioning profiles
it needs. Without a team it fails before Xcode runs, and so does a build for a paired
phone that is not connected. A phone paired over Wi-Fi is listed as disconnected while
idle; the build reaches it first and fails only if it does not answer. On a machine with no Apple account signed in to Xcode, such
as CI, an App Store Connect API key signs instead: set all three of

| Variable                            | What                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| `KUITO_APP_STORE_CONNECT_KEY_PATH`  | The `AuthKey_<id>.p8` file App Store Connect gave you |
| `KUITO_APP_STORE_CONNECT_KEY_ID`    | The key's ID                                          |
| `KUITO_APP_STORE_CONNECT_ISSUER_ID` | The issuer ID above the keys list                     |

and `kuito` passes them to `xcodebuild` as `-authenticationKeyPath`,
`-authenticationKeyID` and `-authenticationKeyIssuerID`. Setting only some of them fails
before Xcode runs.

Android release builds sign with your upload key. Name its keystore and alias in
`kuito.config.ts` or in the environment, which wins, so CI can point at its own copy; the
passwords come from the environment only, and Gradle reads them there itself, so they never
appear in a config file or on a command line:

| Config key                 | Variable                          |
| -------------------------- | --------------------------------- |
| `android.signing.keystore` | `KUITO_ANDROID_KEYSTORE`          |
| `android.signing.keyAlias` | `KUITO_ANDROID_KEY_ALIAS`         |
| —                          | `KUITO_ANDROID_KEYSTORE_PASSWORD` |
| —                          | `KUITO_ANDROID_KEY_PASSWORD`      |

A store build without an upload key fails before Gradle runs, as does a keystore that does
not exist or a missing password. A release APK for a device signs with the upload key when
one is named, and otherwise with the debug keystore. Keep the keystore out of the
repository.

## SDK prerequisites

On **macOS**, install Xcode and its simulator runtime and `xcodegen` (typically `brew install xcodegen`). The CLI uses `xcrun simctl` for boot/install/launch, `xcrun devicectl` to find paired iPhones and `xcodebuild` for building. Simulator builds are signed ad hoc; phone and store builds need `ios.teamId` ([signing](#signing)).

For **Android**, install JDK 21, Android SDK platform tools (`adb`), emulator and an AVD, and Gradle 8 (or add `native/android/gradlew`). It uses Gradle, `adb install`, `adb shell am start` and `emulator -avd`; `adb` and `emulator` come from `$ANDROID_HOME` (or `$ANDROID_SDK_ROOT`) when set, otherwise from `PATH`. On physical devices it uses `adb reverse` to reach the local dev server; on the Android emulator it uses `10.0.2.2`. `kuito doctor` checks Node, Xcode, XcodeGen, adb, the JDK and Gradle, at the versions `src/cli/requirements.ts` states once (Node's minimum is `package.json`'s `engines`); it does not install SDK packages or replace developer licensing/SDK setup. An emulator `kuito` starts writes its output to `kuito-emulator-<avd>.log` in the temporary directory: if it exits before booting, the boot fails with that output. A boot that fails or is cancelled stops it; a booted one keeps running after `kuito` exits.

## App connection

Each `kuito dev` session makes a 256-bit token that every socket and route of the dev server requires, loopback included ([devtools](devtools.md#debugging-with-chrome-devtools)). The CLI passes the URL and token to the iOS Simulator process as `SIMCTL_CHILD_KUITO_DEV_URL` and `SIMCTL_CHILD_KUITO_DEV_TOKEN`, to a paired iPhone as `DEVICECTL_CHILD_KUITO_DEV_URL` and `DEVICECTL_CHILD_KUITO_DEV_TOKEN`, and to Android by writing `files/kuito-dev-link.json` into the app's private storage through `adb shell run-as`: the debug activity is exported, so it reads no URL from its intent. `--port` configures both the dev server and app URL. The dev server listens on loopback, and an Android physical device uses port reversal. For a paired iPhone it also listens on the Mac's CoreDevice tunnel address ([Live Patch on an iPhone](phone-live-patch.md)). The `l` shortcut streams a simulator's logs; a phone's are in Console.app.

## Scope & remaining work

This CLI automates development against Kuito's **native UI shells**. It is not a standalone on-device compiled Kuito application, a production binary distribution service, or a substitute for an installed Xcode/Android SDK. iOS simulator build/launch and Android install/launch must be checked on real host machines: Linux CI cannot validate an Xcode run. Typed Static Hermes AOT is a separate experiment.

## On-device Hermes

`kuito dev ios|android` builds bootstrap and application JS assets, compiles the mobile app with the Hermes/JSI bridge, installs/launches it, and starts a localhost source-patch server. JavaScript runs in **each device process**; the desktop only bundles TSX and sends source patches. The native build still needs Hermes. Both platforms link the same prebuilt Hermes V1 release (the static_h line), pinned in `native/hermes.json`: iOS links its xcframework (`com.facebook.hermes:hermes-ios`, the debug variant, or the release one for a [release build](#release-builds)) as a local Swift package: the CLI downloads the tarball once, checks it against `iosSha256` (`iosReleaseSha256`), and unpacks it with a generated `Package.swift` into `~/.cache/kuito/hermes-ios-<version>` (`-release` for the release variant), which the generated project depends on (`src/cli/hermes-ios.ts`). Maven ships a tarball and SwiftPM's remote binary targets must be zips, hence the local package; Android links `com.facebook.hermes:hermes-android`. Read [on-device caveats](on-device-hermes.md).
