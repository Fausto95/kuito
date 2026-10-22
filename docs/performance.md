# Measure interaction cost

Start with the interaction that feels slow: opening a sheet, scrolling a feed, switching tabs or changing one value. Use the device monitor to locate the work, then a repeatable test to prevent regressions.

## Diagnose a dropped frame

Open [DevTools](devtools.md) and enable the Performance monitor. A frame report attributes main-thread time to layout, UI callbacks and commit work:

```text
Dropped 2 frames (23.1 ms): layout 14.2 ms (812 nodes laid out, 96 framed) ← job 482 (press on Pressable like (31)); uiFrame 5.0 ms; awaitInput 3.9 ms (timed out)
```

Here, layout is the largest recorded cost. Check the affected subtree and whether the interaction changes layout unnecessarily. A report saying `no receipt covers it` means the recorded Kuito work does not explain the drop; investigate platform work or a native module.

Kuito-attributed drops can also appear as LogBox warnings, limited to one per second. UI callbacks over the development frame budget name their source location; see [code placement](placement.md).

## Add an interaction budget

Headless cost tests count operations rather than wall-clock time, so a busy CI machine does not change the result.

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

`costOf` measures native-side operation counts: prop writes, layout passes, measures, views created and redundant work. Start from the behavior the interaction requires. A color-only change should not create views or trigger layout; mounting a new screen legitimately does both. `toStayWithin` reports counters that exceed your budget.

## Compare builds on a device

Run the repository benchmark from its root with the same device, scenario and build profile:

```sh
node scripts/benchmark-android.ts --device emulator-5554 --runs 4 --build before=before.apk --build after=after.apk
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label candidate
```

The Android script drives the Reel demo's fixed scenarios and alternates supplied builds. Results and traces are saved under `dist/benchmarks/android/`; open traces in Perfetto. The iOS script measures simulator launch. Device names are examples; use names returned by `kuito devices`.

Compare medians across runs. Keep CPU allocation, build profile and host load fixed. Turn off overlays and close unrelated simulators. Emulator frame times include host GPU contention, so interpret them alongside main-thread work.

## Inspect runtime counters

In a debugger, compare `__kuito.stats()` before and after the interaction. `total` counts kernel operations, `lastReplan` covers the last committed plan and `held` shows retained runtime objects. Growing retained counts after repeatedly opening and closing a screen suggest missing cleanup. `__kuitoUI.stats()` reports UI-runtime work. These are implementation diagnostics rather than app APIs.
