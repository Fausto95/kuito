# Android baseline (Phase 0)

The Reel demo on `main` before Phase 2 moves Android to Hermes V1: the numbers
later phases compare against. What each column means is in
[docs/performance.md](../../docs/performance.md#what-it-reports); per-run values are in
[`baseline.json`](baseline.json).

## How it was taken

- Build: `main` at `95c76fc` (legacy Hermes on Android), the debug APK the dev
  server installs.
- Device: Android emulator, AVD `Pixel_3a_API_34_extension_level_7_arm64-v8a`
  (Android 14, 1080×2220 at 480 dpi, `hw.cpu.ncore = 1`, 1.5 GB RAM).
- Host: Apple M3 Pro, 11 cores, 18 GB, macOS (Darwin 27.0.0), 2026-10-18.

```bash
node scripts/kuito.ts dev android -d emulator-5554 --port 8766
```

```bash
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 4 --label baseline
```

## Summary (median of 4 runs)

| Scenario   | runs | frames | jankPercent |  p50 |   p90 |  p99 | anrs | uiSlowPercent | uiP90 | uiMaxMs | uiTotalMs |
| ---------- | ---: | -----: | ----------: | ---: | ----: | ---: | ---: | ------------: | ----: | ------: | --------: |
| `launch`   |    4 |    165 |        34.1 |   23 |    73 | 1200 |    0 |          54.7 |  61.6 |  1872.1 |    5209.2 |
| `sheet`    |    4 |   40.5 |        67.7 |   42 |   225 |  375 |    0 |          20.9 |  43.6 |   278.6 |    1160.4 |
| `tabs`     |    4 |   47.5 |        59.7 |   45 |   175 |  325 |    0 |          35.2 |  49.7 |   142.9 |    1681.0 |
| `discover` |    4 |    273 |        52.4 |   40 | 137.5 |  650 |    0 |           8.7 |  16.1 |   246.9 |    2093.0 |
| `library`  |    4 |  200.5 |        51.0 | 33.5 |    83 |  150 |    0 |          14.2 |  23.4 |   109.5 |    2368.3 |

Launch: `startMs` 4662, `contentMs` 8076.7, `evaluateMs` 3256.0.

## How far to trust it

The host was shared with other builds and a second emulator while this ran:
its load average went from about 12 to 30. An earlier attempt under heavier
load (load average up to 77, one run lost to a 120 s busy app) was discarded.
gfxinfo's jank and percentiles swing widely between runs on this emulator
(`sheet` ranged from 4 % to 70 % jank); compare `uiSlowPercent`, `uiP90` and
`uiTotalMs` first, and take before and after on the same host in one
alternating run (`--build before=… --build after=…`) rather than against this
table alone. `tabs` run 4 rendered no frames (gfxinfo reported 0 frames), which
pulls its medians down slightly.
