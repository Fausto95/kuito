# Performance

Kuito measures its own work in development builds: on screen while you use the app, in the LogBox when a frame drops, and as counts a test can hold to a budget.

**Use it for**

- Finding why a frame dropped, and which interaction asked for the work.
- Keeping an interaction's cost from growing, with a test that fails like a bug.
- Comparing two builds' frame rate and cold start.

## Watch frames while you use the app

Turn on the **Performance monitor** from the dev menu ([Devtools](./devtools.md#read-the-performance-monitor)). It shows the frame rate, how long the main thread worked in the worst frame of the last half second, the frames dropped, prop parses per commit, touch-to-screen latency, and JSON per frame.

## Find why a frame dropped

A development build keeps a receipt for each piece of main-thread work in a frame: what it was, how long it took, and which job asked for it. When a frame drops, the shell prints them in one line to the device log (`l` in `kuito dev` streams a simulator's) and on the monitor's last line:

```text
Dropped 2 frames (23.1 ms): layout 14.2 ms (812 nodes laid out, 96 framed) ← job 482 (press on Pressable like (31)); uiFrame 5.0 ms; awaitInput 3.9 ms (timed out)
```

A drop Kuito's work took the time of is also a LogBox warning, at most one a second. A drop no receipt covers (`no receipt covers it`) is the platform's own work, a system sheet or a native module. Your own UI-thread code past 4 ms in a frame is named by its line ([Placement report](./placement.md#find-a-slow-ui-thread-frame)).

## Hold an interaction to a budget

`costOf` from `kuito/tests` runs an interaction on the headless host and returns what it cost the main thread, in counts that do not depend on the machine: records applied, prop writes, layout passes, nodes laid out, measures, views created, each with the part that changed nothing (`wastedPropWrites`, `wastedFrames`, …).

```tsx
import { Pressable, Text, signal } from 'kuito';
import { costOf, press, render, screen, test } from 'kuito/tests';

function Like() {
  const liked = signal(false);
  return (
    <Pressable onPress={() => (liked.value = !liked.value)} opacity={liked.value ? 1 : 0.6}>
      <Text>Like</Text>
    </Pressable>
  );
}

test('a like lays nothing out', async () => {
  await render(<Like />);

  const cost = await costOf(() => press(screen.getByText('Like')));

  cost.toStayWithin({ layoutPasses: 0, measureCalls: 0, viewsCreated: 0 });
});
```

`toStayWithin` throws naming every counter over its budget ([Testing](./testing.md)).

## Count the kernel's work

`__kuito.stats()` returns what the kernel has done, so a debugger session diffs two snapshots around an interaction. `replans` counts committed plans; `total` holds the work since the kernel loaded (`thunkEvaluations`, `subscriptionsCreated`, `subscriptionsDestroyed`, `sendPropCalls`, `bytesStringified`, `uiMessages`, `jsonParses`), and `lastReplan` the same for the last plan. `held` counts what the kernel holds now, store by store: it should stay flat while the app runs. `__kuitoUI.stats()` answers for the UI thread.

## Compare two builds

The repository's benchmark scripts drive the Reel demo (`demo/`), cold-starting it for each run. On Android, `scripts/benchmark-android.ts` measures frames per scenario (`launch`, `sheet`, `tabs`, `discover`, `library`) on an emulator with a Pixel 3a's screen, whose coordinates it taps, from `dumpsys gfxinfo` and from a trace of the UI thread:

```sh
kuito dev android -d emulator-5554 --port 8766
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 3 --label mine
node scripts/benchmark-android.ts --runs 4 --build before=before.apk --build after=after.apk
```

Two builds passed with `--build` alternate within each run, so load on the host falls on both alike. Results go to `dist/benchmarks/android/<label>/`, with a trace per run to open in [Perfetto](https://ui.perfetto.dev). On iOS, `scripts/benchmark-ios.ts` times the `launch` of a simulator build:

```sh
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label mine
```

Both report medians over runs of a launch: `contentMs`, until the end of the largest commit (the time a user waits for content), and `evaluateMs`, the wall time spent evaluating the kernel and the app's modules. Android adds `startMs`, the time to the first draw. Compare UI-thread numbers (`uiP90`, `uiSlowPercent`) over emulator frame times: those are dominated by the host's GPU.

## Things that distort measurements

- The monitors redraw the window themselves: the Android benchmark turns them off for the run (`--overlays` keeps them); on iOS, turn them off yourself.
- An emulator's CPU count: the stock Pixel 3a AVD on Apple silicon has one core. Keep it fixed across before and after.
- Other emulators and simulators share the host's GPU: close them.
- Debug and release builds differ: compare builds of the same type.

## Related

- [Devtools](./devtools.md): the monitors and Highlight updates
- [Placement report](./placement.md): UI-thread code and its time
- [Testing](./testing.md): the headless host `costOf` runs on
- [Performance in depth](../../../../docs/performance.md): trace sections, native and cost counters, JSON at the boundary, bisecting frame cost
