# On-device Hermes vertical slice (experimental)

This is an **implementation prototype**, not a validated mobile release.

## Objective

Run Kuito's bootstrap, UI reactivity, event handlers, and app source **inside each native mobile process** instead of executing JS on the desktop and mirroring UI events over WebSocket.

- Shared `native/shared/KuitoRuntime.{h,cpp}` embeds a persistent `facebook::hermes::HermesRuntime` and stages typed view mutations in a C++ queue. After each VM entry, it flushes one batch, deduplicating repeated property writes without reordering view creation/removal.
- Android `KuitoJNI.cpp` and `KuitoNativeRuntime.kt` own Hermes on a `HandlerThread`, deliver one JNI array batch per VM task, and apply mutations to `KuitoAndroidRenderer` on the main Looper. The Gradle native build consumes the Hermes V1 prefab from `com.facebook.hermes:hermes-android` and builds `libjsi.so` from Hermes's `API/jsi` at the same release's tag (`native/android/app/src/main/cpp/jsi`, whose `jsi/jsi/VERSION` names the commit), the ABI that `libhermesvm.so` links against. No React Native library is packaged.
  - A Kotlin exception during a host call (a request, a timer, a native module, a log) is cleared before any further JNI call and becomes a JavaScript error naming the call and the Java exception (`JavaException.h`), so it reaches the app's `catch` or the LogBox instead of aborting the process.
  - Hermes's Android `Intl` (`toLocaleString`, `Intl.DateTimeFormat`, ...) is Java behind fbjni, which loads its libraries through SoLoader's `NativeLoader`. `KuitoNativeRuntime` initializes it before Hermes starts: an exception inside Hermes's own `Intl` code never reaches Kuito's catch and aborts the process.
- iOS `KuitoHermesBridge.mm` and `KuitoHermesBridge.h` own Hermes on a serial dispatch queue, buffer view mutations and send each ordered batch to `KuitoUIKitRenderer` on the main dispatch queue. A local Swift package links the same Hermes V1 release, prebuilt (`src/cli/hermes-ios.ts`).
- `src/dev/device-server.ts` delivers **only JavaScript source patches** over a localhost-only WebSocket. All application logic and button dispatch run inside the device VM.

## Usage

Install Node dependencies and native SDKs. On macOS, have Xcode and XcodeGen. On Android, JDK 21, Android SDK/NDK, CMake, Gradle 8, emulator. `kuito doctor` checks them.

```sh
kuito doctor
kuito dev android
# macOS only:
kuito dev ios
```

`kuito build android` builds the Android shell with generated JS bootstrap/app assets. `kuito dev --no-launch` runs source-patch compilation only.

To build without launching:

```sh
kuito build ios              # or android: the bundled JS and the shells, in .kuito/ (apps.md)
```

`native/ios` and `native/android` still build on their own, but without the
bundled JS, which belongs to the app being built.

`KUITO_DEV_URL` (iOS) and the dev link `kuito dev` writes into the app's private files (Android) select the localhost patch transport, with Android emulator using `10.0.2.2` and physical Android using `adb reverse`. Both carry the session token every request sends ([devtools](devtools.md)).

## JavaScript versus Hermes bytecode

Hermes only runs bytecode compiled by its own release. Both platforms link the same Hermes V1 release, pinned once in `native/hermes.json` (version, tag commit, compiler integrity, iOS checksum), which the CLI, Gradle and CI read. `test/hermesc.test.ts` fails when a consumer repeats the pin or the vendored JSI is of another commit.

- **Both platforms** start from bytecode: `bootstrap.hbc` (the bundled `src/runtime` kernel) and `app.hbc`, compiled once by that release's `hermesc` (`src/cli/hermesc.ts`). The compiler ships in the `hermes-compiler` npm package, so the CLI downloads the pinned tarball once into `~/.cache/kuito`, checks its integrity hash and keeps `hermesc`. Bytecode spares the device parsing and compiling about 270 KB of script during cold start (`docs/performance.md`).
- **The UI kernel** (`src/ui-thread`) ships beside the kernel as `ui.hbc`, compiled with the same flags. The kernel carries only its hash, the SHA-1 of the source it was built with, which `hermesc` also writes into the bytecode's header. The first time the app needs the UI thread, the kernel sends a `UIKernel` record naming that hash (`docs/native-scheduling.md`), and the UI runtime loads `ui.hbc` on the main thread only if its header names the same one (`native/shared/UIKernel.h`). A `ui.hbc` from another build, or none, leaves the UI thread off and reports the mismatch through the host log, which reaches the LogBox; rebuild the app, or ship both kernels in one update (`docs/updates.md`). From bytecode the UI kernel loads in a few milliseconds instead of parsing its 47 KB (release) to 105 KB (debug) of source inside a visible frame (`benchmarks/hermes-v1-cold-start.md`). The headless host (`kuito/tests`) has no Hermes: it checks the same hash against the UI kernel's source and runs that.
- **The app's UI bundle**, its UI-thread functions, ships in a release build as `app-ui.hbc` beside `app.hbc`, compiled with the same flags. The root chunk names it by the SHA-1 of its source rather than carrying that source, and the kernel sends a `UIBundle` record naming the hash with its first UI-thread operations; the UI runtime evaluates `app-ui.hbc` only if its header names the same one, and otherwise reports the mismatch through the host log as it does for `ui.hbc`. A debug build's first UI bundle travels in `app.hbc` as source, as every Live Patch's does, so a debug shell takes the dev server's bundles the same way it takes its own. From bytecode the bundle no longer parses on the main thread in the app's first UI-thread frame (`benchmarks/hermes-v1-cold-start.md`).
- **Live Patches** reach both as source, their UI bundles included.

The shells bundle these assets for offline startup. A debug shell carries `app.js` beside them only to recognize the dev server's replay of the same build; a release shell carries none. Reconnecting the patch socket replays the latest source patch; the persistent runtime retains compatible state and views. Script compilation or runtime exceptions are reported to the device UI; a commit whose host calls throw is dropped as a whole.

## Verification gates and kill criteria

1. **Gradle/NDK:** Android must compile/link the JSI bridge against Hermes and install on an emulator. Fail: fix CMake prefab targets or package/link strategy before adding features.
2. **Xcode/SwiftPM:** iOS must compile/link the Objective-C++ bridge and start on a simulator. Fail: resolve pinned framework headers, the Hermes package, and project generation; no runtime claims until passed.
3. **On-device operation:** With the dev server stopped, an offline launch displays `Count: 0`, taps update the label locally, and local UI remains responsive.
4. **Live Patch:** Two source versions retain count, handler replacement, view identity on each device. A syntax error retains the last working UI. Measure median/p95 latency.
5. **Isolation:** A release shell holds no patch transport and no insecure developer setting. Each build type compiles its own view controller or activity: Release excludes `App/Debug`, `App/Devtools` and `App/LogBox` on iOS (`EXCLUDED_SOURCE_FILE_NAMES` in `native/ios/project.yml`), and Android's dev link, devtools and LogBox live in `src/debug`, so a release file that named one of their types would not compile. Only debug shells allow plain http to any host (`NSAllowsArbitraryLoads`, under any App Transport Security keys the app sets, and `usesCleartextTraffic`); a release shell allows what the app's own config asks for and nothing more, and only they carry the app's source. `test/cli-shell.test.ts` checks those settings, and that no file Release compiles names a type defined by a dev-only file of the same name. Release shells are what `kuito build --profile release` signs for the stores ([release builds](cli.md#release-builds)).

## Known limitations

- The current source moves Hermes onto dedicated serial worker queues, so expensive JavaScript does not monopolize the native UI thread ([native scheduling](native-scheduling.md)). Host mutations are buffered and delivered asynchronously; native UI and JS can temporarily observe different states.
- Android's vendored JSI sources must move with `native/hermes.json`: bump both together, or `libhermesvm.so` and `libjsi.so` disagree on the JSI ABI.
- Device patch transport takes the session token on every request, listens on loopback (and a paired iPhone's CoreDevice tunnel, [phone-live-patch.md](phone-live-patch.md)), and is strictly for development; release builds compile none of it.
- No production AOT, focus preservation tests, deterministic structural remounts, platform benchmarks, or physical-device validation.
