# Frame drops

Measurements behind the work on main-thread frame drops: what each change
cost or saved, where, and how it was taken.

## Native optimization

The frame path's shared C++ (layout, gestures, `UIRuntime`, `ViewTable`)
at `-O2` in every build, and an iOS Release app at `-O2` rather than `-Os`
([performance](../docs/performance.md#native-optimization)). Before is
`ed51394`, after is `ed51394` with the change, built and measured on
2026-10-22.

Numbers come from one phone, iTroika (an iPhone 16 Pro Max, iOS 27.2,
paired with the host), and otherwise from the
iPhone 18 Pro simulator (iOS 27.0), the API 34 arm64 emulator
(`emulator-5554`, NDK 27.0.12077973) or the host, an Apple M3 Pro on
macOS 27.0 with Apple clang 21.0.0. The simulator and the emulator were
shared with other work.

### The engine alone

`benchmarks/native/layout-pass.cpp` lays out `demo/text-rows.tsx`'s tree
(100 rows of two labels too wide for them) with a measure function of a
few arithmetic operations, so the time is the engine's. Every label is
marked dirty before each of 200 timed passes, after 20 to warm up. Three
runs on the host, the same machine the simulator runs on:

| Level |   p50 per pass |   p90 per pass |
| ----- | -------------: | -------------: |
| `-O0` |   2.55–2.58 ms |   2.64–2.68 ms |
| `-Os` | 0.139–0.141 ms | 0.147–0.154 ms |
| `-O2` | 0.131–0.133 ms | 0.141–0.143 ms |

`-O2` is about 19 times faster than `-O0`, a Debug build's level, and 6%
faster than `-Os`, an iOS Release build's level before. Every level gives
the same layout (the root's height, 6,216 points).

The same program built with NDK 27's clang for `arm64-v8a` and run with
`adb shell` on the emulator, three runs each: `-O0` p50 5.7–29.6 ms, `-O2`
p50 0.16–0.35 ms. The emulator shared the host with other work, which
spreads each level's runs widely, but no `-O0` run came near any `-O2` one.

### Layout passes in the app

`demo/text-rows.tsx`, retitling all 200 labels each second, with a local
timer around the engine's pass (iOS `KuitoRootView.layoutSubviews`,
Android `KuitoRootLayout.onMeasure`), the method of
[text-min-content.md](text-min-content.md). The timer is not in the tree.
Each pass includes the platform's text measuring, which the engine calls
and which the change does not touch. Each app ran its bundled JS, without
a dev server. The four builds of a platform were installed in turn, three
rounds of 60 s each after a 25 s warm-up, so host load fell on all alike.

| Build                      |  Passes | p50 before → after | p90 before → after |
| -------------------------- | ------: | -----------------: | -----------------: |
| iPhone 16 Pro Max, Debug   | 157/165 |     62.3 → 59.2 ms |     64.4 → 60.9 ms |
| iPhone 16 Pro Max, Release | 171/172 |     60.5 → 60.5 ms |     62.0 → 62.3 ms |
| iOS simulator, Debug       | 177/178 |     47.7 → 41.0 ms |     62.2 → 50.1 ms |
| iOS simulator, Release     | 177/176 |     44.6 → 47.1 ms |     58.1 → 58.5 ms |
| Android emulator, debug    | 168/117 |       855 → 776 ms |   1,335 → 1,368 ms |
| Android emulator, release  | 153/153 |       108 → 104 ms |       237 → 178 ms |

- **On the phone**, Debug is faster in every round: after medians
  59.2 ms each, before 61.9–62.5 ms. Release does not move (60.2–60.6 ms
  before and after): text measuring is nearly all of a pass there. The
  phone's builds were installed with `devicectl` and timed through its
  console; the before builds are the same tree with `KUITO_NATIVE_DEBUG=1`
  and, for Release, without `GCC_OPTIMIZATION_LEVEL`, which compiles what
  `ed51394` compiles (`-O0` and `-Os`, read from the build).
- **iOS simulator Debug** is faster in every round: after medians 40.3–43.2 ms,
  before 45.0–51.5 ms. Text measuring is most of a pass, so the engine's
  share, a few milliseconds at `-O0`, is what the change removes.
- **iOS simulator Release** shows no change beyond the spread between rounds (before
  43.7–47.3 ms, after 45.7–49.6 ms): at `-Os` the engine was already a
  fraction of a millisecond of a pass.
- **Android** shows nothing the emulator's noise does not swamp. Its
  rounds ran under heavy host load (medians from 230 to 1,229 ms for the
  same debug build), and a debug pass is dominated by measuring text
  through JNI and Kotlin. The release builds compile the same: AGP builds
  release as `RelWithDebInfo`, which the NDK compiles at `-O2 -g -DNDEBUG`,
  so their libraries are the same size and the release row is a
  measure of the noise.

### Compiler flags, as the builds ran them

Read from the builds' compile commands (Xcode's response files,
`compile_commands.json`), not assumed:

| Build                 | Frame-path sources                  | Other C++ (`Http.cpp`, `KuitoJNI.cpp`) |
| --------------------- | ----------------------------------- | -------------------------------------- |
| iOS Debug, before     | `-O0`                               | `-O0`                                  |
| iOS Debug, after      | `-O0 … -O2`                         | `-O0`                                  |
| iOS Release, before   | `-Os`                               | `-Os`                                  |
| iOS Release, after    | `-O2 … -O2`                         | `-O2`                                  |
| Android debug, before | none (clang: `-O0`)                 | none                                   |
| Android debug, after  | `-O2`                               | none                                   |
| Android release, both | `-O2 -g -DNDEBUG`, then `-O2` after | `-O2 -g -DNDEBUG`                      |

### Binary sizes

| Artifact                                        |     Before |      After |
| ----------------------------------------------- | ---------: | ---------: |
| iOS Debug, `KuitoIOS.debug.dylib`               | 11,070,016 |  9,560,624 |
| iOS Release, `KuitoIOS` executable              |  3,538,000 |  3,537,248 |
| iOS Release, its `__text` section               |  1,086,640 |  1,151,000 |
| iPhone (`iphoneos`) Release, `__text`           |  1,089,224 |  1,150,444 |
| iOS Release, the `.app`                         |   16,584 K |   16,584 K |
| Android debug, `arm64-v8a/libkuito_mobile.so`   |  3,859,744 |  3,024,296 |
| Android debug APK                               | 44,596,503 | 41,724,627 |
| Android release, `arm64-v8a/libkuito_mobile.so` |    894,840 |    894,840 |
| Android release APK                             | 23,190,647 | 23,190,647 |

Bytes unless marked. Release code grows 5.9% on iOS (`__text`, +64 KB;
React Native reported +6.2% for the same change, `60c817e`, #59226).
The executable's file size hardly moves because its link-edit data
(`__LINKEDIT`, symbols and function starts) shrinks by about as much:
1,933,312 → 1,867,776 bytes. Debug libraries shrink: optimized code is smaller than
`-O0` code.

## Ablation upper bounds

The plan's fixes (`kuito-frame-drops-novel-plan.md`, F1 to F10) ranked by what
skipping (`elide`) or slowing (`slow<ms>`) each main-thread subsystem does to
frames over budget, before any fix is written
([ablation](../docs/performance.md#ablation)). An elision's saving is an upper
bound on what fixing that subsystem can win. A slowdown that moves nothing
says the subsystem is off the critical path.

Recorded 2026-10-22, 18:30 to 19:50 CEST, at `df2cc0d` with the ablation
switchboard on top (before `-O2` landed in #337), Debug builds; the iOS
receipt quoted under rank 4 is from 17:51, the same code before its merge.
These runs used no physical device: every number comes from a simulator or
an emulator on a laptop running several other sessions' builds and tests at
the same time.

### Ranking

| Rank | Fix                                                         | Subsystem it removes                     | Upper bound measured                                                                                                                                                                                                                                                                         |
| ---: | ----------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | F1 effect-typed props + F2 layout delta journal (F10 in it) | layout (calculation and frames apply)    | iOS replay: frames over budget over S1 to S5, 26.7 → 20.7 (−22%); per run 25–28 against 20–22, most of it from S2 (6.0 → 2.3). Worst frames move within the baseline's spread, and S1's got worse (197 → 291 ms). Android replay: none above noise.                                          |
|    2 | F3 measure-ahead                                            | measure                                  | iOS replay: 26.7 → 22.0 (−18%); per run 25–28 against 21–23. S5's worst frame 41–64 → 21–36 ms is the one worst-frame change clear of the baseline's spread. Android replay: 19.7 → 18.4 (−7%, within noise).                                                                                |
|    3 | F8 `-O2` for the shared C++ (landed in #337 after this run) | the engine's share of layout and measure | Bounded by 1 and 2. Both are on the critical path: slowing them raises iOS's worst frame by 0.4 to 1 s and Android's frames over budget about fivefold (below).                                                                                                                              |
|    4 | F4 staged landing, shape memory                             | applyBatch (can be slowed, not elided)   | Not boundable by ablation: slowing it 4 ms per batch moved no count. Receipts put it first among Kuito's work in the drop a press on Reel's Details button caused (it pushes the show screen): applyBatch 175 ms of a 1,031 ms drop, layout 82, measure 79, redraw 4 (iOS, live, one drop). |
|    5 | F2's equality guards on label redraws                       | labelRedraw                              | ~0: iOS 26.7 → 26.0, Android none. #324 already removed the redraws.                                                                                                                                                                                                                         |
|    6 | F5 animation promotion                                      | uiFrame                                  | 0 measurable. iOS live: Lab's Spin and +1, the two UI-thread interactions run, dropped no frame in the baseline. Android live: noise (below).                                                                                                                                                |
|    7 | F6 event subscription table, compiled bindings              | uiEvent                                  | 0 measurable, same runs.                                                                                                                                                                                                                                                                     |
|    8 | F7 adaptive input wait                                      | awaitInput                               | 0 measurable, same runs. The receipts of the iOS press drop show no input wait.                                                                                                                                                                                                              |
|    9 | F9 frame-slack harvesting                                   | none (moves deferrable work)             | No subsystem to toggle; nothing to bound.                                                                                                                                                                                                                                                    |

What this says: the measurable bounds are in the renderer and layout share
(F1/F2/F10, then F3), which the cost replays isolate, and even those save
only 5 to 6 frames over budget across five recordings, on iOS alone. The two
UI-thread interactions run live (a tap and a spring) dropped no frames on
the iOS simulator. In the one press drop receipted, applying the batch was
Kuito's largest cost, which ablation can't bound because the views must
take every batch. Measure F4 with receipts
before and after instead.

### Cost replay under each toggle

`KuitoCostReplayTests` / `KuitoCostReplayTest` (#341) replay the S1 to S5
recordings in `test/fixtures/recordings` through the real renderer with no
JS, three runs per toggle. Each recording starts from the app's mount, so
the mount frames weigh in every scenario. "over" is frames whose work
outlasted the 16.67 ms interval, as a mean over the runs; the second number
is the run's p95 frame work, which with 4 to 21 frames is its worst frame,
taken from the middle run (the higher one of two).

**iOS**: own simulator ("iPhone 18 Pro" model, iOS 27), `TEST_RUNNER_KUITO_ABLATE`.

| Toggle            | S1 tap        | S2 push, pop | S3 sheet     | S4 scroll     | S5 type       | Total over |
| ----------------- | ------------- | ------------ | ------------ | ------------- | ------------- | ---------: |
| none              | 3.3, p95 197  | 6.0, p95 44  | 4.0, p95 57  | 6.7, p95 40   | 6.7, p95 58   |       26.7 |
| layout:elide      | 3.0, p95 291  | 2.3, p95 34  | 4.0, p95 32  | 5.7, p95 36   | 5.7, p95 55   |       20.7 |
| measure:elide     | 3.7, p95 151  | 4.3, p95 34  | 3.3, p95 32  | 5.3, p95 31   | 5.3, p95 30   |       22.0 |
| labelRedraw:elide | 3.7, p95 108  | 5.0, p95 31  | 4.7, p95 36  | 6.3, p95 51   | 6.3, p95 36   |       26.0 |
| layout:slow4      | 4.0, p95 663  | 4.3, p95 576 | 4.0, p95 546 | 6.0, p95 667  | 8.0, p95 434  |       26.3 |
| measure:slow1     | 3.0, p95 1087 | 4.3, p95 745 | 4.0, p95 597 | 6.7, p95 1025 | 6.7, p95 1089 |       24.7 |
| labelRedraw:slow1 | 4.0, p95 174  | 6.0, p95 103 | 4.7, p95 169 | 6.3, p95 49   | 6.3, p95 59   |       27.3 |
| applyBatch:slow4  | 3.7, p95 220  | 5.7, p95 34  | 4.0, p95 30  | 6.3, p95 49   | 5.7, p95 38   |       25.3 |

A replay has only 4 to 21 frames, and the mount frames are over budget
whatever is toggled, so slowing work raises the worst frame rather than the
over count; it can even lower that count, as slowed batches gather into
fewer frames. `layout:slow4` adds 380 to 630 ms to the worst frame, which
at 4 ms a root means about 95 to 155 layout roots calculated in one mount
frame (every list row is a root of its own). `measure:slow1` adds 540 to
1,030 ms: as many leaf measures in one frame. The over count is a coarse,
non-monotonic measure; read the bounds above with that in mind.

**Android**: emulator-5554 (API 34, arm64), `adb shell setprop debug.kuito.ablate`.

| Toggle            | S1 tap       | S2 push, pop | S3 sheet     | S4 scroll     | S5 type       | Total over |
| ----------------- | ------------ | ------------ | ------------ | ------------- | ------------- | ---------: |
| none              | 3.3, p95 17  | 3.7, p95 30  | 2.7, p95 17  | 3.7, p95 17   | 6.3, p95 23   |       19.7 |
| layout:elide      | 4.8, p95 18  | 8.0, p95 34  | 4.0, p95 34  | 4.7, p95 18   | 4.7, p95 23   |       26.1 |
| measure:elide     | 3.1, p95 17  | 3.0, p95 24  | 3.7, p95 23  | 3.3, p95 14   | 5.3, p95 20   |       18.4 |
| labelRedraw:elide | 3.3, p95 17  | 4.3, p95 44  | 5.0, p95 19  | 4.7, p95 22   | 8.7, p95 30   |       26.0 |
| layout:slow4      | 22.2, p95 30 | 17.7, p95 31 | 19.0, p95 31 | 22.7, p95 35  | 25.0, p95 38  |      106.6 |
| measure:slow1     | 21.7, p95 63 | 16.7, p95 47 | 20.7, p95 39 | 24.0, p95 188 | 21.7, p95 115 |      104.7 |
| labelRedraw:slow1 | 5.0, p95 18  | 5.3, p95 40  | 10.3, p95 59 | 7.3, p95 18   | 4.7, p95 30   |       32.7 |
| applyBatch:slow4  | 2.3, p95 14  | 2.5, p95 18  | 4.0, p95 45  | 3.5, p95 28   | 5.0, p95 22   |       17.3 |

S1 has 9 runs per toggle: the class's other tests replay S1 too. The third
`applyBatch:slow4` run reported nothing, so that row has 2 runs (6 for S1). Another session's
replay ran on emulator-5554 at the same time once. Its lines (they carry
counters this branch doesn't print) were left out. On Android, eliding
layout or measure doesn't lower the counts, while slowing them multiplies
the frames over budget by five. The replay's over-budget frames there are
mostly Android's own measure, layout and draw, which no Kuito toggle
removes.

### Live runs

The JS thread, the UI kernel and the input wait only run in the app, so
`uiFrame`, `uiEvent` and `awaitInput` were measured live in Reel (Debug, no
dev server), counting `Dropped N frames` receipts per scenario.

- **iOS** (own simulator, Reel without a dev server): Lab's +1 five times and Spin three times dropped
  0 frames in the baseline, so these subsystems can't save anything there.
  The other toggles weren't run live on iOS; these counts come from the
  simulator's log, not kept in the repository. Under `kuito dev`, a press
  on Details dropped 60 frames (1,031 ms): receipts name 175 ms of applying
  the batch, 82 ms of layout, 79 ms of measures and 4 ms of redraws, which
  may overlap; no receipt covers the rest.
- **Android** (emulator-5554, adb input, 2 launches per toggle): the same
  baseline scenario dropped 64 frames on one launch and 1 on the next. With
  that spread, no toggle's effect is distinguishable (frames dropped, launch 1/launch 2):

| Toggle            | S6 idle 5 s | S1 +1 ×5 | Spin ×3 | S2 push, pop | S4 scroll ×4 |
| ----------------- | ----------- | -------- | ------- | ------------ | ------------ |
| none              | 64/1        | 3/0      | 100/1   | 37/0         | 60/0         |
| uiFrame:elide     | 1/208       | 283/1    | 210/160 | 182/125      | 60/74        |
| uiEvent:elide     | 76/0        | 91/5     | 150/6   | 146/14       | 213/32       |
| awaitInput:elide  | 5/642       | 82/7     | 1/0     | 156/38       | 0/61         |
| layout:elide      | 2/1         | 6/0      | 41/0    | 46/94        | 5/0          |
| measure:elide     | 0/0         | 0/190    | 0/935   | 17/75        | 51/0         |
| labelRedraw:elide | 0/388       | 296/0    | 69/0    | 230/211      | 325/100      |

The emulator shared the host's CPU and GPU with other sessions' builds,
simulators and emulators, so treat these as showing the noise floor, not
effects.

### Not covered

- No physical device, and no release build: ablation is debug-only.
- S6 idle has no recording to replay; it was only run live.
- Combined toggles (layout and measure elided together) weren't run.
- The live runs keep the development shell's LogBox, whose warning toast
  adds platform work of its own.
- Re-run on a quiet machine before these numbers decide a close call.
