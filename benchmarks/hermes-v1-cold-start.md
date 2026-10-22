# Cold start on Hermes V1 (2026-10-18)

Phase 2 moved Android from React Native's legacy Hermes (`hermes-android`
0.82.1) to Hermes V1 `260318099.0.4`, the release iOS links, and made iOS start
from `bootstrap.hbc` and `app.hbc` instead of compiling the kernel and app from
source on the device. Both platforms now run bytecode from the same `hermesc`
(`native/hermes.json`).

**Before** is `96be524` (main before the change). **After** is this branch. Both
run the Reel demo (`demo/app.tsx`), debug builds, bytecode compiled `-O0 -g3`.
Medians over runs; all times in ms. See `docs/performance.md` for what the
metrics mean.

Host: MacBook Pro (Mac15,6, Apple M3 Pro), macOS 27.0, Xcode 27.1. Other
emulators, simulators and builds were running on the host at the same time, so
absolute times are noisy; compare the medians.

## iOS

`node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label <label>`,
iPhone 18 Pro Max simulator, iOS 27.0, launched offline (no dev server). The
before build carried the same `Kuito evaluate`/`Kuito commit` signposts,
patched in only to measure it.

| Build                              | contentMs | evaluateMs |
| ---------------------------------- | --------: | ---------: |
| Before: source, compiled on device |       416 |         79 |
| After: `app.hbc`                   |       258 |         16 |

Runs (contentMs / evaluateMs):

- Before: 1760/155, 416/58, 761/79, 377/82, 346/67, 279/59, 422/125
- After: 241/14, 257/22, 254/16, 288/17, 275/13, 334/18, 258/12

## Android

`node scripts/benchmark-android.ts --device emulator-5556 --port <port> --runs 5 --scenario launch --label <label>`,
an AVD (Android 14, API 34, one core, 1080×2220 at
480 dpi), through the dev server of the build being measured. Both builds start
from bytecode; the difference is the engine.

| Build                          | startMs | contentMs | evaluateMs |
| ------------------------------ | ------: | --------: | ---------: |
| Before: legacy Hermes 0.82.1   |    5337 |      9435 |       3469 |
| After: Hermes V1 260318099.0.4 |    4415 |      6686 |       2674 |

Runs (startMs / contentMs / evaluateMs):

- Before: 3404/6638/3490, 9694/10102/108, 5337/9435/3469, 6556/10529/4163, 3409/5178/1430
- After: 5079/7572/2843, 4415/6686/2674, 3826/6027/2194, 3827/5992/2323, 4938/6812/2745

`evaluateMs` on the one-core emulator is wall time, most of it waiting while
the main thread draws the first frames (`docs/performance.md`), so it moves
with host load more than with Hermes.

## The UI kernel as bytecode (2026-10-22)

The UI kernel (`src/ui-thread`) used to reach the UI runtime as source inside
the kernel, evaluated on the main thread the first time an app needed the UI
thread. It now ships as `ui.hbc` beside `bootstrap.hbc`, and the kernel asks
the host to load it by hash (`docs/on-device-hermes.md`).

**Before** is `4c1acad` (main). **After** is this branch. Both run a one-card
app that fades in from launch (`opacity` bound to a `motion` value animated
with `timing` in its body), so the UI kernel's first frame is the app's first
animated frame. Each build carried a probe in `native/shared/UIRuntime.cpp`,
patched in only to measure it and not part of either build otherwise:

- `createMs`: making the UI runtime's Hermes (the first display frame's drain
  makes it, before any UI-thread use).
- `kernelMs`: loading the UI kernel, from the record that asks for it.
- `firstFrameMs`: from that record to the end of the UI kernel's first frame:
  the kernel, the app's UI bundle (still source), the operations, the wait for
  the next display frame and the frame.

Each run kills the app and launches it offline (no dev server). Medians of
11 runs; all times in ms. No physical device was available.

| Platform, build                          | createMs before → after | kernelMs before → after | firstFrameMs before → after |
| ---------------------------------------- | ----------------------: | ----------------------: | --------------------------: |
| iPhone 18 Pro simulator, iOS 27, release |             0.59 → 0.55 |            15.83 → 0.16 |                24.81 → 6.96 |
| iPhone 18 Pro simulator, iOS 27, debug   |             0.60 → 0.54 |             5.98 → 0.19 |                16.32 → 6.55 |
| Android emulator (API 34), release       |             47.7 → 35.1 |            373.4 → 1.45 |               556.3 → 397.8 |
| Android emulator (API 34), debug         |             72.0 → 53.7 |             85.1 → 4.46 |               178.6 → 222.7 |

Host: MacBook Pro (Mac15,6, Apple M3 Pro), macOS 27.0, `emulator-5554`. Other
sessions' simulators, emulators and builds ran on the host at the same time.
On iOS the source kernel alone took most of a 60 Hz frame in release; from
bytecode, loading it costs a fifth of a millisecond. On the emulator
`kernelMs` falls by two orders of magnitude in both profiles; `firstFrameMs`
there is mostly wall time waiting on a main thread busy with the first frames
(84 to 1,430 ms across one build's runs), so it moves with host load more than
with the UI kernel.

Runs (kernelMs / firstFrameMs):

- iOS release before: 30.9/41.7, 26.7/35.6, 15.8/27.3, 17.4/24.4, 12.7/19.0, 20.5/28.8, 15.8/24.8, 15.6/24.6, 14.9/21.7, 16.3/24.9, 13.8/23.4
- iOS release after: 0.15/8.8, 0.22/6.5, 0.19/6.5, 0.16/7.0, 0.16/9.1, 0.13/6.0, 0.17/6.8, 0.23/9.5, 0.21/8.3, 0.15/7.0, 0.15/5.7
- iOS debug before: 11.3/22.2, 6.0/16.4, 6.7/21.7, 5.6/14.2, 5.7/23.7, 6.5/16.0, 5.8/14.6, 5.9/16.3, 7.6/19.9, 5.9/16.3, 6.0/15.5
- iOS debug after: 0.32/17.4, 0.19/6.5, 0.21/8.8, 0.24/6.3, 0.24/7.1, 0.18/7.8, 0.18/6.3, 0.17/7.2, 0.18/6.5, 0.21/6.3, 0.18/6.6
- Android release before: 722/830, 334/662, 304/534, 3234/4094, 583/662, 253/356, 373/404, 203/315, 405/556, 736/843, 226/271
- Android release after: 59.4/1389, 0.51/280, 0.61/71, 1.45/328, 2.55/398, 0.64/416, 0.52/153, 0.91/288, 28.3/445, 1.55/844, 9.77/401
- Android debug before: 51/179, 85/216, 54/144, 133/244, 60/143, 40/122, 85/175, 123/237, 277/687, 63/166, 226/316
- Android debug after: 0.89/1017, 4.46/1431, 2.21/84, 8.43/126, 4.34/223, 50.9/280, 1.69/110, 1.26/253, 5.41/382, 6.13/159, 12.6/176

### The app's UI bundle as bytecode

A release build now ships the app's UI-thread functions as `app-ui.hbc`
beside `app.hbc`, and the root chunk names the bundle by hash rather than
carrying its source (`UIBundle` record, `docs/on-device-hermes.md`). Debug
builds and Live Patches still send source.

**Before** is `fce0328` (main). **After** is this change. Same method and
probe as above, with `bundleMs` added: the first evaluation of the app's UI
bundle, from source before and from `app-ui.hbc` after. `firstFrameMs` runs
from the `UIKernel` record to the end of the first UI-thread frame. Release
builds only, offline, medians of 11 runs, ms. Two apps: the fade-in app above
and Reel (`demo/`).

| Platform, app                      | bundleMs before → after | firstFrameMs before → after |
| ---------------------------------- | ----------------------: | --------------------------: |
| iPhone 18 Pro simulator, fade-in   |             6.89 → 0.16 |                 7.75 → 0.74 |
| iPhone 18 Pro simulator, Reel      |            13.56 → 0.27 |                14.61 → 1.08 |
| Android emulator (API 34), fade-in |            14.82 → 0.22 |                16.15 → 2.05 |
| Android emulator (API 34), Reel    |            18.86 → 0.35 |                21.07 → 4.54 |

The UI bundle no longer costs a frame: loading it from bytecode takes a
fifth to a third of a millisecond, and the first UI-thread frame now costs
about a millisecond on iOS. `app.hbc` stops carrying the bundle as a string:
for Reel, `app.hbc` (428 KB) becomes `app.hbc` (22 KB) and `app-ui.hbc`
(173 KB); for the fade-in app, 281 KB becomes 37 KB and 105 KB.

Host as above, `emulator-5554`; other sessions' builds ran at the same time.
The emulator's first runs after an install are its slowest (up to 322 ms
before), so its medians move with host load more than iOS's.

Runs (bundleMs / firstFrameMs):

- iOS fade-in before: 14.44/15.48, 8.48/9.34, 6.89/7.75, 8.66/9.51, 9.79/10.66, 5.56/6.29, 5.37/5.89, 5.15/5.79, 5.42/6.19, 5.26/5.81, 8.72/9.54
- iOS fade-in after: 0.17/0.90, 0.29/1.16, 0.20/0.76, 0.15/0.68, 0.14/0.68, 0.15/0.60, 0.15/0.65, 0.16/0.79, 0.15/0.74, 0.21/0.69, 0.17/0.75
- iOS Reel before: 14.22/15.14, 13.56/14.61, 13.64/14.64, 14.09/15.11, 13.40/14.33, 12.36/13.28, 13.67/14.70, 12.75/13.67, 11.49/12.37, 12.50/13.42, 15.29/16.41
- iOS Reel after: 0.27/1.22, 0.29/1.10, 0.27/1.05, 0.26/0.97, 0.28/1.04, 0.30/1.08, 0.26/0.98, 0.29/1.14, 0.29/1.09, 0.27/1.13, 0.27/1.00
- Android fade-in before: 321.96/441.59, 279.41/291.10, 35.47/37.81, 121.31/196.86, 12.69/14.12, 12.51/14.68, 15.98/17.37, 14.82/16.15, 11.05/12.53, 14.38/16.04, 14.44/15.61
- Android fade-in after: 0.24/1.91, 0.59/10.73, 0.23/1.80, 2.77/19.25, 0.22/1.84, 0.19/2.05, 0.17/3.70, 0.16/1.70, 0.28/10.70, 0.18/1.47, 0.21/4.31
- Android Reel before: 35.42/38.47, 18.81/20.35, 18.51/20.27, 24.64/26.52, 30.44/32.58, 18.86/21.07, 17.94/19.86, 25.14/26.98, 16.82/18.98, 20.77/22.39, 17.19/19.66
- Android Reel after: 0.41/6.36, 0.33/2.71, 0.50/14.11, 4.58/10.05, 0.33/2.22, 0.46/5.66, 0.69/19.51, 0.35/2.63, 0.30/3.89, 0.30/2.33, 0.31/4.54

`createMs` stays near half a millisecond on iOS and tens of milliseconds on the
emulator, and the runtime is already made on the first display frame rather
than on first use, so creating it earlier would not move it out of a frame:
it stays as it is.
