# Devtools

Development builds of the Kuito shells include devtools. They stay out of
your app's way: there is no floating button.

## Opening them

| Where               | How                                |
| ------------------- | ---------------------------------- |
| iOS simulator       | ⌘D                                 |
| Android emulator    | ⌘M / Ctrl+M, or the menu key       |
| A physical device   | Shake it                           |
| The `kuito dev` CLI | Press `m` (works for every device) |

They open as a native sheet with:

- **Connection.** Whether the app is connected to the dev server, and the
  reason and countdown while it reconnects.
- **Reload / Reconnect.** Reload restarts your app in a fresh Hermes runtime
  with the latest source; Reconnect reopens the dev link.
- **Live Patch.** The last updates and how long each took to apply.
- **Last error.** Patch, render and event errors, until cleared. The
  [LogBox](logbox.md) shows each one in full, with its source.
- **Monitors** (remembered across launches):
  - **Performance monitor**: UI-thread FPS; `UI`, the longest the main
    thread worked between two display frames in the last half second (the
    work, not the frame interval: an idle app reads near 0 ms); the frames
    dropped since it opened, the display frames skipped while the thread
    worked past one (on Android, a touch's down and up, which the main looper
    reads between its messages, go uncounted);
    and a line of FPS over the last 15 seconds against the display's
    target. Below it, Kuito's commits: prop parses per commit and the
    last touch-to-applied latency with its p95 ([performance](performance.md#native-counters)).
    Its last line is the last dropped frame's receipt: what the main thread
    did in it, and which job asked for it ([frame receipts](performance.md#frame-receipts)).
    Drag it anywhere; it settles in the nearest corner.
  - **Highlight updates**: like react-scan, every view the renderer updates
    flashes — green, then amber, then red as the same view keeps updating
    within a second, with a ×N count. Constant red means something re-renders
    more than it should. Under each flash, the signal write that caused it
    (`visits = 2`): the write whose binding set the prop, or whose branch
    re-planned. An update no write caused (a Live Patch, a native event the
    view reported) has no label.

  Both monitors redraw the window themselves, so they cost some frame time of
  their own; [performance](performance.md) measures with them off.

- **Dev server.** The WebSocket URL, editable.

## While your app loads

A startup screen says what the shell is waiting for — Hermes, the dev server,
your app's first frame — and fades out on the first frame. Afterwards a pill
under the status bar reports Live Patch (`Updated in 18 ms`), failures (tap to
open the devtools) and a lost dev server until it is back (`Reconnected`).
Warnings and errors your app logs or throws collect in the
[LogBox](logbox.md).

## The dev link

The shell reconnects by itself: it pings the dev server to notice a dead link
and retries with backoff (0.5 s up to 5 s) until the server is back, so a
restarted `kuito dev` needs no action on the device. A patch the device has
already applied is not applied again when the server replays it.

The link carries JSON messages keyed by `type`, declared once in
`src/protocol/dev-link.ts`; `npm run generate` writes them into
`KuitoDevLink.generated` in Swift and Kotlin, and each shell's `handle()`
switches over the generated enum, so a new message fails to compile until both
handle it. The server sends `patch` (a revision's source), `command` and
`symbolicated`; a shell sends `hello` (its id, name and platform), `log`,
`open`, and an ack for every patch it receives: `applied` (the revision and
how long evaluating it took) or `rejected` (the revision, a code such as
`EVALUATION`, and the message). The server validates each message against the
same table and reports a malformed one with its reason.

## Debugging with Chrome DevTools

Development builds make both of the app's Hermes runtimes debuggable over the
Chrome DevTools Protocol, the way React Native DevTools debugs Hermes:

| Target    | What runs there                                                   |
| --------- | ----------------------------------------------------------------- |
| JS thread | Your app and the Kuito kernel (`src/runtime`)                     |
| UI thread | Motion values, gestures and UI-thread callbacks (`src/ui-thread`) |

Press `j` in `kuito dev` to open DevTools on the JS thread of the device that
connected last, or `u` for its UI thread (`k` opens the
[Components panel](#components)). You get Chrome's own frontend:

- **Sources**: your TypeScript, through the compiler's source maps.
  Breakpoints, stepping, scopes, watch expressions and `debugger;`
  statements all work. Live Patch keeps working while DevTools is attached;
  each patch shows up as a new script.
- **Console**: `console.*` output with the logged objects themselves, linked
  to the line that logged them, and evaluation in the paused frame or the
  global scope. Entries logged before DevTools opened are kept (the last
  1000).
- **Performance**: record a CPU profile.
- **Memory**: take a heap snapshot.

DevTools opens in a browser of its own: the first Chromium-based browser
installed (Chrome, Chrome Canary, Chromium, Edge, Brave), started with a
dedicated profile in `.kuito/devtools-browser` and a debugging port on
loopback. Set `KUITO_DEVTOOLS_BROWSER` to a Chromium executable to choose
another one. Chromium refuses to open `devtools://` URLs from outside, so
Kuito opens the same bundled frontend as that browser serves it on its
debugging port: nothing is downloaded, and the frontend always matches the
browser.

Every socket and route of the dev server takes the session's token, which
`kuito dev` makes at start and hands to the apps it launches and the windows
it opens: the debugger can read any project file and run code in the app.
The token keeps out web pages, other apps on a phone, sandboxed apps and
other users; a process of your own user can still read it from the
processes' environments. Each target's `webSocketDebuggerUrl` and DevTools
URL carry the token; `chrome://inspect`, which cannot send it, finds no
targets. A WebSocket from a web page's origin is refused, as is any request
sent to a host name other than `localhost` or an IP address, which a DNS
rebinding page would use.

### Components

Press `k` in `kuito dev` for the Components panel. It shows Kuito's own
model of the app, **signal → binding → view**, for the device that connected
last, in the same browser as DevTools.

- **Tree.** Every mounted component instance, named as you declared it, with
  its list `key`. It follows the app as components mount and unmount.
  Hovering a component outlines the views it rendered on the device.
- **Component.** Its props as it reads them, its hooks by name, the
  components that render it (owners), and the native views it rendered.
  The compiler passes each `signal()` the variable it is declared as, so
  `const visits = signal(1)` shows as `visits`; a hook it did not see shows
  its ordinal (`state 1`). `task()` and `resource()` show whether they are
  running, their data and their error; `motion()` values show their last
  value; refs show what they hold.
- **View.** Selecting a view, from a component or with **Select on device**
  (then tap the view), shows each of its props with the binding behind it:
  the signals its last run read, each with its value and the component
  that owns it. A prop without a binding is a constant. A prop updated
  while the panel was open shows the signal write that caused it.
- **Signal.** Selecting a signal shows what it drives: every prop whose
  binding reads it, and every branch it decides (a `Show`, a flow `Switch`,
  a reactive child expression, or a whole module's structure). Signals made
  outside a component, and computeds, show by kind and number.
- **Editing.** Values are JSON; Enter sets one. A state value or signal
  takes the edit as if your code had written `.value`, so bindings and
  structure follow. A `motion()` value moves to the edit. A view's prop
  takes the edit on the native view until its binding next writes it.
  Computeds are read-only.

- **History.** The panel's History lists the last 500 writes of the
  signals components own (`signal()` in a component), newest first, with the
  component that owns each and the value written. Writes older than the last
  500 are no longer kept. Tasks', motion values' and refs' writes are not
  listed: they come from what those hooks run. The panel does not step back
  to a write: a fresh runtime replaying the writes would fetch again, run
  its timers again and start native state such as a scroll offset over, so
  the state it reached would not be the one you saw.

The graph is read from the kernel's store when the panel asks for it (the
selection refreshes every second while the panel is open), so it costs the
app nothing while nobody looks. The panel talks to a small backend in the
kernel (`src/runtime/devtools.ts`, its graph in `devtools-graph.ts`); the
messages are typed once in `src/runtime/devtools-protocol.ts` and ride the
inspector's device socket as `panel` frames beside CDP, so the panel and a
DevTools window debug the same runtime side by side. A message the kernel
cannot take is refused with its reason, shown in the panel's header. After a
reload the new runtime greets the panel, which starts over with its tree.

Not supported yet: editing a component's props (edit the view's prop or
the signal behind it instead), a computed's own sources, and viewing a
component's source.

### Recording and replay

Development builds record every batch the app's runtime commits, as the
kernel wrote it (the typed host batch of [native scheduling](native-scheduling.md)),
from the moment the runtime starts. A job that throws loses its batches on
the device and in the recording alike.

Press `s` in `kuito dev` (or send `record` to a non-interactive session) to
save the recording of each connected device to
`.kuito/recordings/<time>-<device>.krec`, with the native view tree it built
beside it as `<file>.tree`: one line per view, in id order, with its kind, its
parent, the frame the layout engine gave it, and a text view's text. A list
row shows without its frame: the platform lays a row out when its list
shows it, which follows the list's own scrolling rather than the batches.

A recording is a golden test: `replay` from `kuito/tests` applies its
batches on the headless host and returns the tree they leave beside the one
the device left ([testing](testing.md#golden-tests)). It does not reproduce:

- **UI-thread code.** Motion values, gestures and animations run in the UI
  runtime, which a replay does not start; their records are left out.
- **Native state.** Scroll offsets, text typed into fields and other state the
  platform owns are not in the batches; neither are the native events the app
  answered. The tree compares layout, not where a scroll view is scrolled to.
- **Size.** A recording stops at 32 MB, and says so (the CLI notes
  "stopped at its size limit"); it still replays from the start.

There is no golden replay on a device: without the UI thread and native
state the screen it leaves is not the one the user saw, and the headless
replay checks the same batches without a build. A device replays a recording
for what it costs instead.

A `.krec` file is little-endian: `KREC`, a version (3), a truncated flag, then
for each batch the milliseconds since the runtime started, the batch's bytes
and its strings (`native/shared/Recording.h`). Props cross by their number
in the manifest, so a recording replays with the Kuito that recorded it,
as the platform that recorded it; its tree is that platform's. Version 2,
from before structured props crossed as plain data, still replays: its
structured props arrive as JSON text.

#### Cost replay

The renderer test bundles replay a recording on the simulator or emulator to
measure the renderer and layout share of each frame, with no JS and no UI
kernel: every batch is applied to the real UIKit or Android renderer on the
main thread, on the first display frame at or after the time its runtime
sent it, then laid out as that frame's commit (iOS) or traversal (Android)
would. Each replay prints one line:

```
kuito-cost-replay ios s4-scroll batches=133 records=7447 frames=19 p50=3.36 p95=155.16 max=155.16 over=7 interval=16.67 dropped=29 recordsApplied=7447 propWrites=5980 wastedPropWrites=0 layoutPasses=291 wastedLayoutPasses=167 nodesLaidOut=5082 nodesFramed=2599 wastedFrames=1731 measureCalls=2563 wastedMeasures=0 labelRedraws=123 wastedRedraws=0 viewsCreated=1067
kuito-cost-replay ios s4-scroll Dropped 11 frames (155.2 ms): layout 83.6 ms (2048 nodes laid out, 203 framed); measure 73.1 ms (1063 measures); redraw 0.7 ms (29 labels)
```

`frames` counts the display frames that applied batches; `p50`, `p95` and
`max` are their main-thread work in milliseconds, and `over` how many
outlasted the display's `interval`. `dropped` is the display frames the
replay dropped by the [frame receipts](performance.md#frame-receipts) rule,
and the rest are the replay's [cost counters](performance.md#cost-counters),
which do not flicker from run to run as times do. Each drop Kuito's work
took the time of follows on its own line, as its receipts describe it (a
replay's batches carry no job, so a drop names none). Subtract a replay from
a live run of the same interaction to get the JS and UI-kernel share. In
Instruments, each frame is a `Kuito replay frame` interval in Points of
Interest.

The fixtures are Reel (`demo/`) recorded from launch on an iPhone 18 Pro
simulator and an Android emulator, in `test/fixtures/recordings/<platform>/`.
The renderer test apps bundle the images they show under their compiled
names (`native/ios/TestHost/BundledImages`,
`native/android/app/src/rendererTests/res`).

| Fixture       | Interaction after the app settles                           |
| ------------- | ----------------------------------------------------------- |
| `s1-tap`      | Discover's `+ My List` on the top show                      |
| `s2-push-pop` | Open a show's route from Top rated, then close it           |
| `s3-sheet`    | Open the top show's Details and drag the sheet              |
| `s4-scroll`   | Library's list, four flings down                            |
| `s5-type`     | Search: focus the field and pick the `star trek` suggestion |

```sh
xcodegen generate --spec native/ios/tests.yml
xcodebuild test -project native/ios/KuitoRendererTests.xcodeproj -scheme KuitoRendererTests \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' -only-testing:KuitoRendererTests/KuitoCostReplayTests
```

On Android, `node scripts/test-android.ts` runs `KuitoCostReplayTest` with
the other renderer tests, or alone with
`-Pandroid.testInstrumentationRunnerArguments.class=dev.kuito.runtime.devtools.KuitoCostReplayTest`;
its lines are logged under the `KuitoCostReplay` tag. A development build's
recording carries devtools commands (update highlights): the replay takes
them and draws nothing. To replay a recording of your own, set `TEST_RUNNER_KUITO_RECORDING`
to its path for `xcodebuild`, or push it to the emulator and pass
`-Pandroid.testInstrumentationRunnerArguments.kuitoRecording=<path>`.

What a cost replay leaves out, beyond what a golden replay does:

- **The JS and UI-kernel share.** Motion, gestures and UI-thread handlers do
  not run, so a sheet drag or a scroll replays only the batches JS sent
  around it, not the frames the UI thread stepped.
- **Drawing.** Core Animation's commit and Android's draw happen after the
  measured work; a replay attributes neither.
- **Versions.** A recording replays with the Kuito that recorded it.
  Re-record the fixtures when the manifest's props or the wire format
  change: `test/recordings.test.ts` replays each one headlessly and fails
  once they no longer decode.

Record a fixture with `kuito dev` and `s` (or `record`), right after the
interaction, then copy the `.krec` and its `.tree` from
`demo/.kuito/recordings/` under the fixture's name.

### While paused

Pausing stops one thread; the rest of the app keeps going as far as it can:

- **JS thread**: the UI stays responsive and animations on the UI thread
  keep running. Events, timers and Live Patches queue and run after you
  resume.
- **UI thread**: the screen freezes until you resume, as the platform's UI
  thread is the one stopped. On Android, input during a long pause can bring
  up the system's _App isn't responding_ dialog; choose _Wait_.

The dev link stays up either way: its pings are answered off the paused
thread, so the shell does not reconnect while you step.

### How it works

Each runtime gets Hermes's own CDP agent (`hermes/cdp`), so Kuito speaks no
CDP itself. The shell opens a second socket to the dev server,
`/inspector/device`, on a thread of its own: commands reach a runtime even
while that runtime's thread is paused at a breakpoint. The dev server
(`src/dev/inspector-proxy.ts`) relays CDP between that socket and each
DevTools window, and adds one thing on the way: every Live Patch's source
map, inline, so any frontend maps scripts back to TypeScript without fetching
anything.

A DevTools session outlives the runtime it debugs. Reload from the dev menu,
or anything else that brings up a new runtime, and the session moves to it
with its breakpoints: DevTools clears the old runtime's scripts, as on a page
navigation, and lists the new one's.

Hermes's agent keeps no script source, so the dev server answers DevTools
for it: each Live Patch, the kernels, and the UI-thread bundle, which the
compiler names by its content (`kuito://ui/<hash>`) and writes beside the
patches. On iOS the JS runtime runs on a thread of its own rather than a
dispatch queue, because the CPU profiler samples the thread that registered
the runtime.

### Limits

- Breakpoints in a file you edit are dropped when its Live Patch lands: the
  file's code changed under them. Breakpoints in other files carry over.
- UI-thread code shows as the compiler's generated JavaScript: its bundle has
  no source map yet.
- The headless runtime that runs background tasks is not debuggable.
- Only one DevTools window debugs a runtime at a time: opening another closes
  the first.
- Release builds include none of this: the inspector, the dev link and the
  devtools compile only into debug builds (`KUITO_INSPECTOR`, and the
  development shell's own sources), and Android's release Hermes has no
  debugger.

## The release kernel

The kernel (`src/runtime`) and the UI kernel (`src/ui-thread`) build in two
profiles, `bundleKernel(profile)` in `src/dev/kernel.ts`:

| Profile         | Dev-only code | Minified | Used by                                                                   |
| --------------- | ------------- | -------- | ------------------------------------------------------------------------- |
| `dev` (default) | Kept          | No       | `kuito dev`, debug device builds, tests                                   |
| `release`       | Dropped       | Yes      | `kuito build --profile release` ([release builds](cli.md#release-builds)) |

Dev-only code is the Components panel's backend and its write log, update
causes and the inspector's console wrapping. Each of its branches tests
`__KUITO_DEV__`, a define the build replaces with `true` or `false`, so the
bundler folds the test and drops a release kernel's dead branch with
everything only that branch reached. A release kernel never answers an
inspector, even on a shell that offers one.

To add dev-only code, declare the define in the module
(`declare const __KUITO_DEV__: boolean;`) and test it directly, not
through a variable or a helper the bundler might not fold. Give the feature
a string only it holds in `test/kernel-release.test.ts`, which fails if a
release kernel carries it.

| Build                   | Kernel  | Gzip   | UI kernel | Gzip   |
| ----------------------- | ------- | ------ | --------- | ------ |
| `dev`                   | 345,011 | 95,625 | 104,681   | 28,779 |
| Minified, dev code kept | 152,938 | 51,660 | 48,376    | 16,565 |
| `release`               | 143,479 | 48,578 | 47,244    | 16,071 |

Each ships as its own bytecode, `bootstrap.hbc` and `ui.hbc`; the kernel
carries only the UI kernel's hash ([JavaScript versus Hermes bytecode](on-device-hermes.md#javascript-versus-hermes-bytecode)).
