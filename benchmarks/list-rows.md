# Reel's Library list: rows from signals (Phase 16)

Phase 16 renders a List's rows from per-row signals instead of a memo array,
adds sections and sticky headers, and turns the viewable range on only once
something reads it. Its gate: Reel's Library list scrolls at the same
`uiSlowPercent` as before, or better. The Library list is a plain array, not a
store, so this measures the row path every List now takes.

## How it was taken

- Before: `main` at `abda9df8`, a worktree of its own. After: the Phase 16
  sections branch (sticky sections, numbered scroll requests, viewable range on
  demand). Each runs Reel from its own dev server and APK.
- Device: Android emulator, AVD `P16_Lists`, a copy of the baseline's
  `Pixel_3a_API_34` configuration (Android 14, 1080×2220 at 480 dpi,
  `hw.cpu.ncore = 1`, 1.5 GB RAM).
- Host: Apple M3 Pro, shared with other builds and three other emulators
  (load average 20–30), 2026-10-19.
- Three rounds, alternating before and after, two runs each:

```bash
node ../scripts/kuito.ts dev android -d emulator-5660 --port 8818
```

```bash
node scripts/benchmark-android.ts --device emulator-5660 --port 8818 --runs 2 --scenario library --label main1
```

## Result (median of each round's two runs)

| Build  | round 1 | round 2 | round 3 | median `uiSlowPercent` | median `uiTotalMs` |
| ------ | ------: | ------: | ------: | ---------------------: | -----------------: |
| before |    3.48 |    4.93 |    0.59 |                   3.48 |               1845 |
| after  |    1.50 |    1.04 |   17.64 |                   1.50 |               2020 |

After's round 3 had a run that drew 69 frames at a 300 ms median frame: the
host stalled. Without that round, `uiTotalMs` is 1797–2020 after against
1711–1932 before. The gate holds: `uiSlowPercent` is no worse.

An earlier attempt reported the viewable range on every List. After's
`uiSlowPercent` came out at 4.5 and 2.2 against 16.1 and 0.8 before: too noisy
to call, but Android's `reportViewable` allocates on every scroll frame, so
reporting now starts only for `onViewableChange` or a row that reads
`visible`. The Library list reads neither.
