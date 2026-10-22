# Performance

How to measure Kuito's frame rate on Android and cold start on both platforms,
and what the numbers mean.

## The Android frame benchmark

`scripts/benchmark-android.ts` replays the Reel demo (`demo/app.tsx`) on an
emulator or device with on-device `input` gestures:

| Scenario   | What it does                                                                  |
| ---------- | ----------------------------------------------------------------------------- |
| `launch`   | Cold start, then the catalog, posters and layout, until the app goes idle     |
| `sheet`    | Opens and closes the details Sheet twice                                      |
| `tabs`     | Search → Library → Lab → Discover, twice                                      |
| `discover` | Swipes two rails, scrolls Discover down with a rail swipe per screen, back up |
| `library`  | Scrolls Library down six screens and back                                     |

Each run cold-starts the app. Each scenario starts once the app is idle, which
means it uses under a tenth of a core for two seconds. A fixed wait is not
enough: on a slow emulator the first content can land a minute after launch.

### Running it

Start the dev server for the device, which also installs the app, and leave it running:

```bash
kuito dev android -d emulator-5554 --port 8766
```

Then measure the installed app:

```bash
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 3 --label mine
```

To compare two builds, pass both APKs. They alternate within each run, so load
on the host (other emulators, builds) falls on both alike:

```bash
node scripts/benchmark-android.ts --runs 4 --build before=before.apk --build after=after.apk
```

Build an APK with JDK 21 and Gradle 8, then copy
`native/android/app/build/outputs/apk/debug/app-debug.apk` aside before building the next:

```bash
cd native/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) PATH=/opt/homebrew/opt/gradle@8/bin:$PATH gradle :app:assembleDebug
```

`--scenario discover` runs one scenario, and `--report` prints an earlier run's
summary again from its saved traces. Coordinates are for a 1080×2220 screen at
480 dpi (Pixel 3a).

Results go to `dist/benchmarks/android/<label>/`: `results.json`, and one atrace
text file per scenario and run (about 60 MB each; delete them when done).
Open a trace in [Perfetto](https://ui.perfetto.dev) to see it.

### What it reports

Per scenario, the median over runs of:

- **From `dumpsys gfxinfo`**: frames rendered, jank % (frames that missed their
  deadline), p50/p90/p99 frame time. This is what a user sees, but on an
  emulator it is dominated by the host GPU (see below).
- **From the trace's UI thread**: `uiSlowPercent` (frames whose own main-thread
  time exceeds 16.7 ms), `uiP90`, `uiMaxMs` (the longest frame) and `uiTotalMs`.
  "Own time" leaves out `postAndWait`, the wait for RenderThread. This is the
  work Kuito's renderer controls, and it is far less noisy.
- `startMs` (launch only): `am start -W`'s time to the activity's first draw,
  which is the startup screen.
- `contentMs` (launch only): from the process's first traced event to the end
  of its largest `Kuito commit`. On Reel that is the catalog: the time a user
  waits for content.
- `evaluateMs` (launch only): the wall time of every `Kuito evaluate`. On one
  core it is mostly waiting for the core, not Hermes running.
- `anrs`: "Application Not Responding" reports during the scenario.

`results.json` also keeps the 40 largest main-thread sections of every run.

### Trace sections

The shell and renderer mark their work so a trace attributes it:

| Section               | Thread | What                                                   |
| --------------------- | ------ | ------------------------------------------------------ |
| `Kuito commit <rows>` | main   | Applying one mutation batch from Hermes                |
| `Kuito layout`        | main   | One pass of the flexbox engine over the root           |
| `Kuito measureLeaf`   | main   | The engine asking Android to measure a text or control |
| `Kuito image ready`   | main   | Delivering a decoded image to its views                |
| `Kuito image decode`  | worker | Decoding image bytes                                   |
| `Kuito evaluate`      | Hermes | Running a script: the kernel, the app, a patch         |
| `Kuito dispatch`      | Hermes | Delivering an event to JS                              |
| `Kuito timer`         | Hermes | A JS timer firing                                      |

A trailing number is detail: the benchmark adds every `Kuito commit` together.
On Android a name with a number is built only while a trace records (API 29
and later; earlier ones cannot tell), so a commit outside a trace makes no
string for it.

## Cold start

Both shells start from Hermes bytecode (`docs/on-device-hermes.md`):
the kernel and the app arrive compiled, so Hermes neither parses nor compiles
them. On the Pixel 3a emulator that took Hermes's own time in `Kuito evaluate`
from about 46 ms to 9 ms per launch. `evaluateMs` stays well above that: on one
core the Hermes thread spends most of an evaluate waiting while the main thread
draws the first frame. Anything else that runs during startup, like an
animated startup screen, makes that wait longer. That bytecode is compiled
for debugging, unoptimized and with full debug info, so Chrome DevTools can
show every scope ([devtools](devtools.md#debugging-with-chrome-devtools)).

`contentMs` also includes Reel's request to the TVMaze API, which varies by
hundreds of milliseconds between runs. Compare medians over several runs.

### iOS

`scripts/benchmark-ios.ts` measures the same `launch` timeline on an iOS
simulator. The shell marks `Kuito evaluate` and `Kuito commit <mutations>` as
signposts in Points of Interest (`native/ios/App/KuitoTrace.swift`); the script
reads them from the simulator's `log stream`, and times `contentMs` from the
process's first log event. Build and install the shell (`kuito dev ios`), then:

```bash
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label mine
```

Without `--port` the app starts offline, from its bundled bytecode alone. The
first run after an install pays for cold file caches; compare medians.
Results go to `dist/benchmarks/ios-launch-<label>.json`. Recorded numbers live
in `benchmarks/`.

## Text layout

`demo/text-rows.tsx` lays out 200 labels in rows too narrow for them, and
retitles every one each second, so each pass measures all 200 again. A
label in a shrinking row is asked for its min-content width (its widest
word) three times a pass, under three different engine cache keys. The
renderers keep that width on the label's style and measure it once per
text and font ([styles](styles.md#platform-notes)), on iOS with one
typesetter over the whole text.

Run it with `--entry text-rows.tsx` and time each layout pass. Numbers and
how they were taken are in
[benchmarks/text-min-content.md](../benchmarks/text-min-content.md).

## Native optimization

The shared C++ every layout pass and touch runs compiles at `-O2` in every
build, Debug included: the layout engine (`native/shared/layout`), gesture
arbitration (`native/shared/gestures`), the UI runtime (`UIRuntime.cpp`)
and the view table (`ViewTable.cpp`). At a Debug build's `-O0` the engine's
share of a layout pass costs many times what users get (about 19 times on
the host), so a Debug build would show frame drops users never see. The rest of the C++ (the inspector, sockets, HTTP)
keeps the build's own level.

| Build           | Frame-path C++ | Everything else                                     |
| --------------- | -------------- | --------------------------------------------------- |
| iOS Debug       | `-O2`          | `-O0`                                               |
| iOS Release     | `-O2`          | `-O2` (`GCC_OPTIMIZATION_LEVEL`, not Xcode's `-Os`) |
| Android debug   | `-O2`          | `-O0`                                               |
| Android release | `-O2`          | `-O2 -g -DNDEBUG`, the NDK's `RelWithDebInfo`       |

On iOS each frame-path source in `native/ios/project.yml` takes the
`KUITO_NATIVE_OPTIMIZATION` setting the CLI writes into the generated
project; a per-file flag comes after the configuration's level, so it wins.
On Android `CMakeLists.txt` gives the same sources `-O2` as source options,
which come after the build type's flags.

To step through that C++ in a debugger, build with `KUITO_NATIVE_DEBUG=1`:

```bash
KUITO_NATIVE_DEBUG=1 kuito dev ios --device "iPhone 18 Pro"
```

It leaves the frame-path sources at the build's level on both platforms
(the CLI sets `KUITO_NATIVE_OPTIMIZATION`, `-O2` in `project.yml`, to
nothing, and passes
`-Pkuito.nativeDebug=true`, which CMake reads as `KUITO_NATIVE_DEBUG`).
Layout times from such a build are not comparable with anything else.

The headless host's WebAssembly (`src/cli/headless-wasm.ts`) and the C++
test builds of the layout fixtures (`test/flex-conformance.test.ts`,
`test/flex-layout.test.ts`) already compile at `-O2`, so conformance runs
are fast too. The gesture and batch tests (`test/gesture-arbitration.test.ts`,
`test/native-batch.test.ts`) run small fixtures and keep the compiler's
default, which compiles faster. Numbers are in
[benchmarks/frame-drops.md](../benchmarks/frame-drops.md#native-optimization).

## Images

`demo/image-grid.tsx` shows twelve 3000 × 2000 photos in 100-point squares
and logs `image-grid: 12 images in <ms> ms` once the last one loads, timed
from the module's first line. Build it as a release app, then launch it a
few times: the first launch downloads the photos, the later ones read them
from the disk cache, which survives a reinstall of the same build, so they
time the decode.

```bash
cd demo && kuito build ios --profile release --device "iPhone 18 Pro" --entry image-grid.tsx
```

Peak memory comes from the process itself: on the simulator,
`footprint --pid <pid> --sample 0.1` reports `phys_footprint_peak`; on the
emulator, `adb shell cat /proc/<pid>/status` reports `VmHWM`, the peak
resident set. Recorded numbers live in
[benchmarks/images.md](../benchmarks/images.md).

## Kernel counters

`__kuito.stats()` returns a snapshot of the work the kernel has done, so a
test or a debugger session diffs two snapshots around an interaction:

| Counter                  | Counts                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `replans`                | Committed `patch()` runs, each module's first plan included                              |
| `thunkEvaluations`       | Tracked expressions run: `when`s, child expressions, computed props                      |
| `subscriptionsCreated`   | Signal subscriptions made                                                                |
| `subscriptionsDestroyed` | Signal subscriptions released                                                            |
| `sendPropCalls`          | Props sent to the host, animated and UI-thread-bound ones included                       |
| `bytesStringified`       | Length of the JSON made to cross the host boundary: native module arguments and commands |
| `uiMessages`             | `__kuito.ui` messages from the UI thread: calls, signal writes, moved values             |
| `jsonParses`             | JSON the kernel parsed from the host: a module view's event payloads                     |

`total` holds the work counters since the kernel loaded; `lastReplan`
holds what the last committed `patch()` did, from registration through its
mounts. A `patch()` that throws commits nothing and leaves `lastReplan` as it
was. Tests read them through `installKernel` (`test/support/kuito-host.ts`).

`__kuito.work` is `total` itself, live rather than a copy: what a shell
reads after each job ([JSON at the boundary](#json-at-the-boundary)).

`held` counts what the kernel holds now, store by store: hook `states`,
`motions`, the JS-thread functions (`remotes`) and `signals` the UI thread
may call or write, gesture tags, removed views kept for their late events,
`views` and `handlers`. Each stays flat while an app does: a hook's state
lasts as long as its instance (`docs/reactivity.md`), a remote or signal as
long as some module's committed plan encodes it, and disposing a module frees
all of it. The UI kernel answers the same question for its own stores with
`__kuitoUI.stats()`: UI-thread `functions`, `motions`, `handlers` and
`bindings`. `test/demo.test.ts` and `test/motion-app.test.ts` keep both flat
over 200 Live Patches.

## Native counters

The performance monitor's commit line (`JS · 12 parses/commit · touch 48 ms (p95
61)`) counts two costs the renderers pay for each Kuito commit, the same way
on iOS and Android (`KuitoCommitStats`, `KuitoParses`):

- **Parses per commit.** The host batch types every built-in prop's value
  (docs/native-scheduling.md), so built-in setters parse no text. A native
  module view's own props arrive as scalars; the color helpers they use
  (`UIColor(kuitoHex:)`, `cssColor`) count each parse. JSON props parse
  their JSON by contract and are not counted. Shown as the mean over the monitor's half-second
  window, for batches applied in it; UI-thread driven props are not commits
  and are not counted.
- **Touch-to-applied latency.** From a touch going down or up (the event's own
  timestamp, read by the window before any view sees it) to the end of applying
  the first batch the JS thread sent after it. A later touch replaces one still
  waiting; a touch no batch answers within 5 s is dropped, since it sent
  nothing to apply. The p95 is over the last 64 answered touches. A batch the
  JS thread sent after the touch for another reason (a timer) answers it too.

## Cost counters

Debug builds count the main thread's work in units that do not depend on the
machine, so a budget can be a test (`costOf`, [testing](testing.md#cost-budgets))
and wasted work shows as a number. Each counter has a wasted twin for the
part that changed nothing:

| Counter          | Counts                                                                                                              | Wasted when                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `recordsApplied` | Batch records applied, the UI thread's prop writes included                                                         |                                                                                  |
| `propWrites`     | Props set through the property tables                                                                               | `wastedPropWrites`: the value is the one the view has                            |
| `layoutPasses`   | Layout passes: a root's frames applied (iOS), a root calculated (Android), a layout that computed a node (headless) | `wastedLayoutPasses`: no frame changed                                           |
| `nodesLaidOut`   | Nodes the engine computed rather than took from its cache                                                           |                                                                                  |
| `nodesFramed`    | Views a pass set the frame of                                                                                       | `wastedFrames`: the frame is the one the view has                                |
| `measureCalls`   | Leaves measured: every one missed the engine's measure cache                                                        | `wastedMeasures`: the answer is the one the leaf gave before it was marked dirty |
| `labelRedraws`   | Labels drawn                                                                                                        | `wastedRedraws`: same text, size and padding as the last draw                    |
| `uiEntries`      | Calls into the UI-thread kernel (headless)                                                                          | `wastedUiEntries`: an event no UI-thread handler took                            |
| `viewsCreated`   | Native views made                                                                                                   |                                                                                  |

A paint-only batch never marks layout, so `layoutPasses` and `nodesFramed`
stay 0 for it ([prop effects](native-renderer.md#prop-effects)). A measure
write frames the fixed-size ancestor that contains it, not the screen.

The renderers count in the property table dispatch (`setProperty`, one
place per platform, so every prop is covered), in the frames apply
(`applyFramesToChildren` on iOS, `KuitoFlexLayout.onLayout` on Android) and
in the label's draw; the engine counts nodes and measures
(`layout::LayoutCost`, `native/shared/layout/FlexLayout.h`) for all three.
A prop write is compared with the last value written to the view, which the
style object keeps in debug builds. Counting is compiled out of release
shells: `native/shared/Instruments.h` (on with `DEBUG` or `KUITO_INSPECTOR`,
and on the headless host), `#if DEBUG` in Swift, `BuildConfig.DEBUG` in
Kotlin.

The headless host reports them through `costOf` (`HeadlessHost.counts()`);
the renderer tests read `KuitoCost.total` (`KuitoCostTests.swift`,
`KuitoCostTest.kt`) and check budgets with the same names. Being debug's,
they are tested in debug builds only: on iOS, where the renderer suite also
runs in Release, `KuitoCostTests` and `KuitoFrameReceiptsTests` skip
there; Android's renderer tests build against the debug variant alone. A
budget a fix has not reached yet is a known failure that states its target
(`test.fails`, `XCTExpectFailure`, `expectOverBudget`): it fails the run once
the fix lands, so the budget is tightened in the same change. Current counts
are in [benchmarks/frame-cost.md](../benchmarks/frame-cost.md).

## Frame receipts

A development build writes a receipt for each piece of main-thread work in
a frame: what it was, how long it took, what it did and which job asked for
it (`native/shared/FrameLedger.h`). When a frame drops, the shell keeps its
receipts and the two frames' before it and reports them in one line:

```text
Dropped 2 frames (23.1 ms): layout 14.2 ms (812 nodes laid out, 96 framed) ← job 482 (press on Pressable like (31)); uiFrame 5.0 ms; awaitInput 3.9 ms (timed out)
```

Every drop's line goes to the performance monitor's last line and to the
device log, which `kuito dev` prints. A drop that Kuito's work took the
time of is a [LogBox](logbox.md) warning too, at most one a second; one no
receipt covers (`no receipt covers it`: UIKit's or Android's own work, such
as a system sheet's presentation or the LogBox's, or a native module's) is
logged only, so the LogBox's own drops cannot feed it. Instruments shows
where time went; a receipt says why the work was asked for.

| Receipt      | Written by                                                                                                                                                    | Counts                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `drain`      | The display frame's drain of the JS thread's batches (`UIRuntime::drain`)                                                                                     |                                                |
| `applyBatch` | Each batch applied; its cause is the job that made it                                                                                                         | records                                        |
| `uiFrame`    | The UI kernel's frame                                                                                                                                         |                                                |
| `uiEvent`    | A native event offered to the UI kernel                                                                                                                       |                                                |
| `awaitInput` | The wait for an input's job (`FrameHandoff::awaitInput`)                                                                                                      | timed out                                      |
| `layout`     | A root's calculation (the bindings), and a pass's frames applied to views                                                                                     | nodes laid out, measures, nodes framed, wasted |
| `measure`    | Leaves measured, added up into one receipt per frame                                                                                                          | measures                                       |
| `redraw`     | Labels drawn, added up into one receipt per frame                                                                                                             | labels                                         |
| `caCommit`   | Core Animation's commit (iOS), from run loop observers around it; recent iOS commits in UIKit's update sequence, outside them, so most commits go unreceipted |                                                |

`drain` holds the `applyBatch` receipts inside it, `caCommit` the layout and
drawing UIKit does in the commit, and `layout` the measures it asked for: a
report lists kinds by their own time, so a nested kind is counted in both.

**Causes.** The JS thread's runtime numbers each job it runs and notes why it
ran: an event on a view, a timer, a network answer, a native module, a
script. The number and the cause travel with the job's batch
(`Batch::cause`, `native/shared/FrameHandoff.h`). Applying the batch names
it, and the layout, measures, redraws and commit of the frame it applied in
name the last job applied. The report names an event's view by its kind,
label and number, as renderer errors do: an app id when the view has one,
else the source module and path the compiler gave it.

**Drops.** The rule is the performance monitor's: a frame dropped when the
display skipped vsyncs while the main thread worked past one interval. Both
shells feed it from the same places, the run loop's or the looper's wake and
sleep and each display frame, so iOS and Android judge drops alike.

**Cost.** A receipt is a clock read and a few stores into fixed arrays: no
strings and no allocation (`test/frame-ledger.cpp` checks both, and that a
write takes under a microsecond). Release shells compile none of it in
(`native/shared/Instruments.h`).

## Bisecting frame cost

`scripts/bisect-frame-cost.ts` judges one commit for `git bisect run` by what
its frames cost. At each step it applies `--patch` files (build flags or
counters the commit predates), cost-replays `--replay` recordings on the
iPhone 18 Pro simulator ([cost replay](devtools.md#cost-replay)), runs
`--measure` commands, and reads every `kuito-cost-replay` and
`kuito-frame-cost <label> key=value ...` line they print. It exits 1 when a
reading crosses its `--max`, 0 when none does, and 125, which skips the
commit, when a patch does not apply, the build fails or no reading can judge
it. It leaves the tree as it found it, the user's untracked files included.

```sh
cp scripts/bisect-frame-cost.ts "$TMPDIR/"
git bisect start <bad> <good>
git bisect run node "$TMPDIR/bisect-frame-cost.ts" \
  --patch counters.patch,counters-older.patch \
  --measure './measure.sh' --max reel-open.nodesFramed=70000 --log readings.jsonl
```

- **A copy.** Bisect checks out older commits, so the script runs from
  outside the tree and imports nothing from it.
- **Limits.** `--max p95=8` holds every reading; `--max s1-tap.p95=8` only the
  readings whose label has `s1-tap`. A replay runs `--runs` times (3) from one
  build and is judged by its medians.
- **Patches.** Each `--patch` lists versions for the stretches of the range,
  separated by commas: the first that applies is used. Counters arrived after
  most of the history worth bisecting, so bisecting on them means applying
  them at every step; so do build flags, so a setting does not hide the
  change being looked for.
- **Recordings.** A recording replays only with the Kuito that recorded it.
  Across a manifest change, record at both ends, or bisect on the headless
  counters, which need no recording. A commit from before the cost replay
  borrows its files from `--harness` (main).
- `--log` appends each commit's readings as a JSON line, for the wasted-work
  diff across the commit the bisect names.

## Ablation

What-if ablation ranks fixes before they are written: a development build
can slow or skip each main-thread subsystem, and the drops that move show
what fixing it could win (`native/shared/Ablation.h`). Slowing a subsystem
that changes no drop count says it is off the critical path; skipping it
gives an upper bound on what any fix to it can save.

| Subsystem     | Slowed (`slow<ms>`)                   | Elided (`elide`)                                             |
| ------------- | ------------------------------------- | ------------------------------------------------------------ |
| `layout`      | before each root's calculation        | a root that has laid out keeps its frames; views keep theirs |
| `measure`     | before each leaf's measure            | a leaf that measured before answers what it answered last    |
| `labelRedraw` | before each label's draw              | labels draw nothing                                          |
| `uiFrame`     | before the UI kernel's frame          | the UI kernel steps no frame                                 |
| `uiEvent`     | before an event reaches the UI kernel | events go straight to the JS thread                          |
| `awaitInput`  | before the input wait                 | the main thread never waits for an input's job               |
| `applyBatch`  | before each batch                     | not allowed: the views take every batch                      |

Elided work leaves the app wrong (stale frames, blank labels): the numbers
are for measuring, not for using the app. Set it as comma-separated
toggles, read once at launch:

```bash
SIMCTL_CHILD_KUITO_ABLATE=layout:elide,uiEvent:slow4 xcrun simctl launch booted dev.kuito.shell
TEST_RUNNER_KUITO_ABLATE=measure:elide xcodebuild test …
adb shell setprop debug.kuito.ablate layout:elide
```

The shell logs what is toggled as a warning at launch, and an error for a
setting it cannot read, which toggles nothing. Release shells compile none
of it. A [cost replay](devtools.md#cost-replay) under each toggle gives the
renderer and layout share repeatably; the UI kernel's and the input wait's
need the live app. [benchmarks/frame-drops.md](../benchmarks/frame-drops.md#ablation-upper-bounds)
ranks the plan's fixes by these bounds.

## JSON at the boundary

Every runtime counts the JSON it parses and makes to cross a boundary, so a
change to the wire is judged by a number rather than a profile:

- **The kernel**: `jsonParses` and `bytesStringified` above.
- **The UI kernel**: `__kuitoUI.work` holds `jsonParses`: a module view's
  event payload a UI-thread handler takes. Its operations, mirrored values
  and messages cross as plain data, with no JSON either way.
- **The C++ and the renderers**: `native/shared/WireWork.h` counts each JSON
  prop value a drained batch carries, which the renderer parses (a module
  view's object props; structured props cross as records). Module function
  values cross with no JSON (`LinkJSI.h`, `test/link-jsi.test.ts`). After each job the JS
  runtime adds what the kernel's `work` grew by, and the UI runtime after
  each entry what the UI kernel's did, so `WireWork` holds every runtime's
  count. It counts frames too: the display frames the UI runtime drained
  batches on (an input's drain runs on its frame's time, so it is no extra
  frame).

The performance monitor's last line shows them per display frame over its
half-second window (`JSON · 2.9 parses/frame · 0 B/frame`), the same way on
iOS and Android. With commit logging on, each `KuitoCommitFrames` gauge
carries the totals since launch (`frames=… json=… stringified=…`), and
`scripts/benchmark-commits.ts` reports them per frame between a run's first
gauge and its last.

The headless host counts the same sites (`HeadlessHost.wireWork()`,
src/tests/host.ts); its module fakes cross no C++.
`test/wire-json.test.ts` records a scroll, a drag and a list update on it;
`benchmarks/wire-json.md` holds the numbers. A string is counted by its
length in UTF-16 code units where JavaScript made it, in bytes where C++ did.

## Things that distort measurements

- **Devtools overlays.** The performance monitor and update highlighter redraw
  the window on their own, and an emulator without partial updates redraws all
  of it each time. The benchmark turns both off through `run-as` for the run and
  restores your settings afterwards, even when interrupted; `--overlays` keeps them
  on to measure them. On the Pixel 3a image they added about a third to Discover's
  UI-thread time.
- **Emulator CPU count.** The stock Pixel 3a AVD on Apple silicon has
  `hw.cpu.ncore = 1`: the UI thread, RenderThread, Hermes and image decoding
  share one core, and a UI thread that has work can spend most of a frame
  waiting for that core. Raise it in the AVD's `config.ini` for numbers closer
  to a phone; keep it fixed across before and after.
- **The host GPU.** Every emulator frame goes through the host's GPU, shared
  with every other emulator and simulator running. `eglSwapBuffers` and
  `dequeueBuffer` then dominate RenderThread and gfxinfo's jank varies widely
  between runs of the same build. Compare UI-thread numbers, alternate builds,
  and close other emulators.
- **Debug builds.** The benchmark measures debug APKs, as `kuito dev` builds
  them. Compare builds of the same type.
