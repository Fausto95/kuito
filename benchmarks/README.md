# Kuito benchmark protocol

**Do not compare a host-only C++ microbenchmark with React Native device measurements.** They measure different execution paths.

## Android frame baseline

[android/README.md](android/README.md) holds the Reel frame benchmark on `main` before Hermes V1 on Android (Phase 0 of the roadmap), with its command and device. Later changes compare against it.

## Host boundary

[host-boundary.md](host-boundary.md) holds what a commit costs the UI thread on a 1,000-row FlatList's first render, and host calls per job, as Phase 5 types the host batch. Its gate, on the current build:

| platform                                        | host calls per job | p95 commit ms, before → after | parses, before → after |
| ----------------------------------------------- | -----------------: | ----------------------------: | ---------------------: |
| iOS simulator, "iPhone 18 Pro" model (iOS 27.0) |                  1 |                 3.080 → 2.664 |                301 → 0 |
| Android emulator (API 34, arm64)                |                  1 |                127.78 → 4.778 |                275 → 0 |

The Android "before" ran under heavier host load; compare its calls and parses, not its times. These numbers come from a simulator and an emulator, not a phone: no physical device was connected when the gate ran, nor when [on-device-gates.md](on-device-gates.md) checked again on 2026-10-19 (a paired iPhone was reachable over the network only, and `kuito devices` lists no physical iOS device). Over 60 s of `demo/motion.tsx` driven by taps and scrolls, the frame handoff held at most one batch after a drain and the motion mirror stayed at 3 values on both platforms. Commands and the full rows are in [host-boundary.md](host-boundary.md#gate).

## Roadmap gates on devices

[on-device-gates.md](on-device-gates.md) runs gates first proven in Node on Hermes on the iOS simulator and the Android emulator: the details-sheet toggle (Phase 4), motion and gestures (Phase 4), Live Patch latency (Phase 8), the theme switch and width class (Phase 10), screen results (Phase 11), persisted signals across a kill (Phase 14), and the Components panel and replay (Phase 17).

## Live Patch latency

`scripts/benchmark-live-patch.ts` edits one line of Reel 20 times and fails if any edit takes 300 ms or more to apply, as the CLI measures it from the file's change to the device's ack. Run `kuito dev` and the script with the same `KUITO_DEV_TOKEN` in their environments, so the shell `kuito dev` launched reaches the script's server. On the "iPhone 18 Pro" simulator, over two runs of 20: p50 180–183 ms, p95 199–214 ms, max 255 ms ([on-device-gates.md](on-device-gates.md#phase-8-live-patch-latency)).

## Text min-content width

[text-min-content.md](text-min-content.md) holds a layout pass over 200 labels in shrinking rows (`demo/text-rows.tsx`) before and after each label's min-content width is measured once per text and font: p50 65.5 → 42.5 ms on the iOS simulator, 1,382 → 1,020 ms on a loaded Android emulator, debug builds.

## Native optimization

[frame-drops.md](frame-drops.md#native-optimization) holds what compiling the frame path's C++ at `-O2` in every build changed: the engine alone 19 times faster than at `-O0` on the host, a text-rows layout pass p50 62.3 → 59.2 ms in a Debug build on an iPhone 16 Pro Max (47.7 → 41.0 ms on the iOS simulator) and no gain beyond the spread between rounds in Release, iOS Release code +5.9%.

## Images

[images.md](images.md) holds what twelve large photos in small squares cost before and after images decode at display size: peak memory 516 → 61 MiB on the iOS simulator and 416 → 199 MiB on the Android emulator (`demo/image-grid.tsx`).

## Kernel re-plan cost

[kernel-replan.md](kernel-replan.md) holds what Reel's details sheet costs the kernel to show another show, before and after Phase 4's branch re-plans.

## Signal writes

[kernel-signals.md](kernel-signals.md) holds what one signal write costs the kernel host with 1, 100 and 1,000 listeners, computeds or view bindings reading it, in time and bytes allocated (`node scripts/benchmark-signals.ts`).

## Kernel microbenchmarks

[kernel/README.md](kernel/README.md) holds the kernel's hot paths case by case (`node scripts/benchmark-kernel.ts`): signal writes, keyed reorders, planning a 1,000-view tree, and one view's 10, 50 or 200 props in one commit. One script runs in Node now and on a device's Hermes later.

## Props in one commit

[kernel-commit.md](kernel-commit.md) holds what a commit costs as one view's props grow, before and after the commit journal kept one entry per view: 13.8 ms → 1.0 ms for 200 props, in Node.

## JSON at the boundary

[wire-json.md](wire-json.md) holds what a scroll, a drag and a list update cross as JSON between the kernel, the UI kernel and the renderer, on the headless host: the counts plans 2.5 and 2.6 bring to zero.

## Route modules

[reel-route-modules.md](reel-route-modules.md) holds which modules a cold start of Reel evaluates once each route is a module of its own (Phase 11), and its cold start on routes, as one module, and on `main` before the move: the Router adds nothing measurable, and the gap to `main` comes from two later changes to the first screen.

## UI-thread round trips

[ui-thread-round-trips.md](ui-thread-round-trips.md) holds the `__kuito.ui` round trips the gesture, motion and audio demos make while used, on the iOS simulator and the Android emulator (Phase 20): none.

## List rows

[list-rows.md](list-rows.md) holds Reel's Library list scrolling before and after Phase 16 renders rows from signals: `uiSlowPercent` 3.48 before, 1.50 after (median of three alternating rounds on the 1-core emulator).

## Planned apples-to-apples device comparison

Compare **Kuito on-device Hermes** to a verified current React Native release built in release mode, on the _same physical phone and OS version_:

| Scenario                      | What to measure                                      |
| ----------------------------- | ---------------------------------------------------- |
| Cold launch                   | median/p95 launch-to-first-content (ms), memory peak |
| 1,000-row app                 | allocated view count, memory (MB), first render (ms) |
| Tap changes one text          | input-to-visible update p50/p95/p99, UI frame drops  |
| Insert/reorder 100 keyed rows | retained native identity, frame cost, allocations    |
| Animated opacity/position     | missed 60Hz/120Hz frames, CPU, battery               |
| 100 concurrent fetches        | cancellation correctness, JS responsiveness          |

Instrument Android with Perfetto/FrameMetrics and iOS with Instruments/signposts. Warm up, isolate OS load, run at least 30 iterations, and publish raw traces and build commits. Kuito's current mobile engines are **not validated**, so these comparisons are currently blocked.

## Version and fairness checklist

Record React Native version, Hermes version/flags, native build configuration, device/OS, simulator vs device, and app source equivalence. Avoid comparing old RN Bridge mode to Kuito's modern JSI path.

A smaller C++ operation count is a useful internal signal, not evidence that Kuito renders faster than React Native.

## Headless layout

[headless-discover.md](headless-discover.md) holds Reel's Discover screen rendered on the headless host (Phase 18) against an iPhone 18 Pro simulator on the same data and fonts: all 858 views match, frames to the tenth of a point.

## Frame cost in counts

[frame-cost.md](frame-cost.md) holds what each budgeted interaction (a paint-only tap, one label's text among 100, an idle frame) costs the main thread in the cost counters, headless and in both renderers' tests, with the fix each failing budget waits on.
