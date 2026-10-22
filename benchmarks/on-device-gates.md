# Roadmap gates on devices

Several phase gates were first proven only by kernel tests in Node
(`node:vm`, see `test/support/kuito-host.ts`). This file holds the same
checks run on Hermes on a simulator and an emulator, with how each was taken.

- **iOS**: "iPhone 18 Pro" simulator, iOS 27.0, and a temporary "iPad Pro
  11-inch (M5)" simulator, iOS 27.0.
- **Android**: an API 34 arm64 emulator (Google APIs image, Pixel 3a
  profile, 2 cores, 3 GB).
- **Host**: Apple M3 Pro, macOS (Darwin 27.0.0), 2026-10-19. Hermes V1
  `260318099.0.4` (`native/hermes.json`). `main` at `e977b02` and `59db6ee`.
- **No physical device**: neither platform had one connected for these runs.
  `xcrun devicectl list devices` listed a paired iPhone over the network only,
  `kuito devices` lists no physical iOS device, and `adb devices` listed
  only the emulator.

| Phase | Check                                                       | iOS                   | Android             |
| ----- | ----------------------------------------------------------- | --------------------- | ------------------- |
| 4     | `demo/motion.tsx` behaves the same on both platforms        | pass                  | pass                |
| 4     | `demo/gestures.tsx` behaves the same on both platforms      | pass (see below)      | pass (see below)    |
| 4     | Reel's details-sheet toggle on Hermes                       | 0.83–1.66 ms median   | 0.95–1.06 ms median |
| 8     | A one-line Reel edit applies in under 300 ms                | pass, max 255 ms      | not run             |
| 10    | Theme switch: only token-backed props, no re-plan           | pass                  | pass                |
| 10    | Width-class change on an iPad rotation, in one commit       | pass                  | not applicable      |
| 11    | `present()` → `dismiss(result)` round trip                  | pass                  | pass                |
| 14    | A persisted signal survives kill and relaunch               | pass                  | pass                |
| 17    | Selecting a Text shows its binding and the signals it reads | failed, fixed in #215 | pass                |
| 17    | A recorded Discover scroll replays to the same tree         | pass, 88 batches      | pass, 57 batches    |

## How the kernel was read

Development shells expose both Hermes runtimes over the Chrome DevTools
Protocol (docs/devtools.md). The dev server lists them at
`http://127.0.0.1:<port>/json/list`; a small client sent `Runtime.evaluate`
to the JS thread's `webSocketDebuggerUrl` and read `__kuito.stats()`,
`__kuito.view(label)` and `__kuito.widthClass()`. Hermes's agent doesn't
await promises, so an async snippet stored its result in a global and the
client polled for it with a deadline. To see what a change sent to the host,
the snippet wrapped `__kuitoHostCommit`, copied each batch's bytes and
strings, and `decodeBatch` from `test/support/host-wire.ts` decoded them in
Node.

The iPhone simulator had Highlight updates and the performance monitor left
on from earlier sessions (they are remembered across launches). With
Highlight updates on, each prop update also sends a `devtoolsCause` command.
Both were turned off before measuring.

## Phase 4: details-sheet toggle on Hermes

[kernel-replan.md](kernel-replan.md) timed this in Node. On the devices,
Reel ran under `kuito dev`, and for each of 30 rounds the snippet did this:
open Breaking Bad's sheet (`top-169`), close it, wait until
`__kuitoHostBusy()` is false, then time `dispatch(top-82, 'press')` through
one microtask and read `__kuito.stats().lastReplan`. The fourth iOS run
was on a fresh launch an hour later. Without waiting for an
idle host, some rounds deferred the re-plan to the host's idle event, and
`lastReplan` then held the close's re-plan.

| Platform         | median ms (runs of 30) |    p10 ms | thunks | subscriptions created / destroyed | sendProp |
| ---------------- | ---------------------: | --------: | -----: | --------------------------------: | -------: |
| iOS simulator    | 1.54, 1.61, 1.66, 0.83 | 0.76–1.08 |      6 |                             4 / 0 |       22 |
| Android emulator |       0.95, 0.97, 1.06 | 0.78–0.80 |      6 |                             4 / 0 |       22 |

Every round re-planned the branch alone: 6 thunks, where the whole app
module re-planned 165 before Phase 4. Since Reel moved onto routes (#166),
the sheet is a route of its own, so the counts are smaller than the Node
"after" row. No Hermes "before" exists to compare against: that build
predates the routes. The roadmap's "under half of the baseline" is therefore
still shown only by the Node ratio and by the thunk count, which doesn't
depend on the engine.

## Phase 4: motion and gestures

`kuito dev <platform> --entry motion.tsx` and `--entry gestures.tsx`, driven
by simulator taps and swipes (`adb shell input` on Android):

- **Motion**: scrolling the feed past 160 fades and slides the header away
  and switches the title to "Scrolled past the header". Scrolling back
  restores both. Spin counts whole turns ("Stop (6 spins)" on iOS, "Stop (4
  spins)" on Android after a few seconds) and Stop returns to "Spin". Same
  on both platforms.
- **Gestures**: a tap counts a tap, a long press (over 400 ms) counts a long
  press, and dragging the slider knob slowly follows the finger, on both
  platforms. A fast flick coasts the knob to its end (200) on iOS.
- **Not verified**:
  - _Double tap, both platforms._ Neither driver sends two taps close enough
    together: each tool call (simulator) or `input` process (Android) takes
    longer than the double-tap window.
  - _Fast flick, Android._ A 60–80 ms `adb shell input swipe` on the loaded
    emulator reaches the pan's `VelocityTracker` with almost no velocity, so
    the knob stopped where the finger left it.
  - _Pinch and rotate._ Not driven.

## Phase 8: Live Patch latency

```bash
npm run demo:ios -- --device "iPhone 18 Pro" --port 18960
node scripts/benchmark-live-patch.ts --platform ios --port 18960 --rounds 20
```

The script starts the CLI's own Live Patch server, waits for the shell, then
rewrites one line of `demo/reel/screens/discover.tsx` 20 times. For each
edit it reads `device:applied`'s latency, the CLI's measurement from the
file's change to the device's ack. It exits 1 if any edit takes 300 ms or
more, and puts the line back when done. A shell that reconnects skips the
revision it already applied, so the script waits only for acks that carry
an edit's latency. Run 2 used a shell rebuilt on `3fd669d`.

| Run                  | rounds | p50 ms | p95 ms | max ms | budget ms |
| -------------------- | -----: | -----: | -----: | -----: | --------: |
| iOS simulator, run 1 |     20 |    180 |    199 |    255 |       300 |
| iOS simulator, run 2 |     20 |    183 |    214 |    220 |       300 |

## Phase 10: theme switch and width class

Theme: `xcrun simctl ui <udid> appearance dark|light` and
`adb shell cmd uimode night yes|no`, with Reel on Discover. Each switch,
both ways:

| Platform         | commits | re-plans | props sent | props by name                                                                       |
| ---------------- | ------: | -------: | ---------: | ----------------------------------------------------------------------------------- |
| iOS simulator    |       1 |        0 |        371 | color 228, borderColor 110, backgroundColor 31, backgroundGradient 1, shadowColor 1 |
| Android emulator |       1 |        0 |        266 | color 158, borderColor 75, backgroundColor 31, backgroundGradient 1, shadowColor 1  |

No view was created, moved or removed, and every prop is one that
`tokens.css`'s themes set. Android sends fewer because its rails had bound
fewer list rows.

Width class: Reel on the iPad simulator (834 pt wide in portrait: `medium`;
1210 pt in landscape: `expanded`). Neither `simctl` nor Simulator.app is
available to rotate a simulator here, so the rotation was asked of UIKit
from LLDB:
`[scene requestGeometryUpdateWithPreferences:[[UIWindowSceneGeometryPreferencesIOS alloc] initWithInterfaceOrientations:UIInterfaceOrientationMaskLandscapeRight] errorHandler:nil]`.
UIKit refuses that request for an app that supports iPad multitasking
("The current windowing mode does not allow for programmatic changes to
interface orientation"), so this run built Reel with
`ios.requiresFullScreen: true`. That change was local and is not committed.

| Rotation             | width class       | commits | re-plans | props sent                    |
| -------------------- | ----------------- | ------: | -------: | ----------------------------- |
| portrait → landscape | medium → expanded |       1 |        0 | paddingLeft 4, paddingRight 4 |
| landscape → portrait | expanded → medium |       1 |        0 | paddingLeft 4, paddingRight 4 |

Those are `theme.css`'s `@media (width-class: expanded)` margins on
`.header` and `.inset`.

## Phase 11: screen results

`kuito dev <platform> --entry routes`: open Severance, tap Rate, pick 4.
`present(routes.rate(...))` resolved with 4 and the screen showed "★★★★".
Opening the sheet again and dismissing it without a choice (tapping outside
on iOS, outside the sheet on Android) resolved with `undefined`: "Not rated".
Same on both platforms.

## Phase 14: persisted signal across a kill

`test/shell-smoke.test.ts` builds a shell of its own around
`test/fixtures/persisted-launches-app.tsx` and launches it offline from its
bundled scripts. The app reads a persisted count, increments it, and posts
both values to the test once the store reads back the new one. The test then
kills the process (`simctl terminate` or `am force-stop`), launches the shell
again and expects the second launch to read the new count. It is skipped
unless a device is named, and `.github/workflows/mobile-shells.yml` runs it:

```bash
KUITO_SMOKE_IOS="iPhone 18 Pro" KUITO_SMOKE_ANDROID=emulator-5660 npx vp test run test/shell-smoke.test.ts
```

It passed on both, as did the fetch and Intl smoke tests in the same file.

## Phase 17: Components panel and replay

**Select on device.** In the Components panel (`/components/<page>` on the
dev server), tapping "Tonight" on Android selected Text #10: `color` bound to
the appearance signal ("signal 1 = light"), `fontSize`, `fontWeight` and
`letterSpacing` constant, rendered by Discover. On iOS 27 every tap selected
NavigationStack #1 instead. `UINavigationController` lays a full-screen
`_UIFloatingBarContainerView` over its screens, and the hit test stopped
there. #215 fixed it: each renderer now picks the deepest view it drew. After
the fix, iOS selected Text #10 for "Tonight" and Text #152 ("12 shows",
`RailView key=top`) as Android does.

**Replay.** Reel scrolled on Discover, saved with `record` on the
`kuito dev` session, then replayed on a clean shell:

```bash
kuito replay .kuito/recordings/20261019-171002-iphone-18-pro.krec ios
kuito replay .kuito/recordings/20261019-171534-sdk-gphone64-arm64.krec android
```

| Platform         | batches | replay time | final tree       |
| ---------------- | ------: | ----------: | ---------------- |
| iOS simulator    |      88 |      854 ms | same as recorded |
| Android emulator |      57 |     1,016 s | same as recorded |

A replay keeps the pace of the recording, and the Android recording covered
about 17 minutes of runtime (Reel started at 16:52 and was recorded at
17:15). On that emulator, the host load also stalled the system for minutes
("System UI isn't responding"); the first attempt was stopped before it
finished.

## Seen along the way

- **iOS: a blank sheet left on screen.** On iOS only, 30 fast rounds of
  opening and closing Reel's details sheet from JS (`dispatch(top-169,
  'press')`, then the sheet's `close`) left a blank, full-height native sheet
  on screen, while the kernel had no sheet. A single open and close did not.
  It reproduced on two runs; Android was not checked.
