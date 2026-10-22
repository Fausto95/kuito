# Host boundary (Phase 5)

What a commit costs the UI thread on the first render of a 1,000-row
FlatList (`demo/first-render.tsx`), as the host batch changes. Each row is
the median of cold launches; the columns come from the shells' commit log
(`KuitoCommitStats`, `scripts/commit-stats.ts`).

- **calls/job**: `__kuitoHostCommit` calls that carried one job's batch,
  the most any job made and the mean. Before the typed batch each view
  mutation was its own host call; that column then counts the mutations
  each job delivered, a lower bound (writes the queue coalesced away were
  calls too).
- **p50/p95 ms**: time to apply one batch on the UI thread.
- **total ms**: every batch of the run: the first screen and the rows the
  list binds.
- **parses**: prop values the renderer parsed from text (Phase 0's counter)
  over the run. It falls to zero as the concern tables take typed values.

## How it was taken

```bash
npm run demo:ios -- --device "P5 iPhone 18 Pro" --port 8850 --entry first-render.tsx
```

```bash
node scripts/benchmark-commits.ts --platform ios --device <udid> --port 8850 --runs 5 --seconds 8 --label <label>
```

```bash
npm run demo:android -- --device emulator-5580 --port 8851 --entry first-render.tsx
```

```bash
node scripts/benchmark-commits.ts --platform android --device emulator-5580 --port 8851 --runs 5 --seconds 12 --label <label>
```

- iOS: simulator "iPhone 18 Pro" model (iOS 27.0), debug shell.
- Android: an AVD (API 34, arm64), debug shell.
- Host: Apple M3 Pro, 18 GB, macOS (Darwin 27.0.0), 2026-10-18, shared with
  other builds. The emulator's times swing widely between runs; compare its
  calls and parses first, and its times only within one sitting.
- `before` is `497d77a` (the last commit before the typed batch) with the
  same commit log patched in.

## iOS simulator

| label      | runs | calls/job max | calls/job mean | p50 ms | p95 ms | total ms | parses |
| ---------- | ---: | ------------: | -------------: | -----: | -----: | -------: | -----: |
| before     |    5 |            15 |          14.79 |  0.335 |  3.080 |     26.3 |    301 |
| wire       |    5 |             1 |           1.00 |  0.267 |  3.152 |     21.2 |    151 |
| layout     |    5 |             1 |           1.00 |  0.332 |  3.231 |     24.6 |    151 |
| decoration |    5 |             1 |           1.00 |  0.295 |  3.143 |     20.8 |    151 |
| text       |    5 |             1 |           1.00 |  0.270 |  2.446 |     19.6 |     40 |
| animation  |    5 |             1 |           1.00 |  0.299 |  3.397 |     29.3 |      0 |
| drain      |    5 |             1 |           1.00 |  0.262 |  2.901 |     21.7 |      0 |
| gate       |    5 |             1 |           1.00 |  0.245 |  2.664 |     20.0 |      0 |

## Android emulator

| label      | runs | calls/job max | calls/job mean | p50 ms | p95 ms | total ms | parses |
| ---------- | ---: | ------------: | -------------: | -----: | -----: | -------: | -----: |
| before     |    5 |            15 |          14.77 | 12.368 | 127.78 |   1965.8 |    275 |
| wire       |    5 |             1 |           1.00 | 11.971 | 108.56 |   1430.6 |    137 |
| layout     |    5 |             1 |           1.00 |  9.761 |  62.44 |   1269.2 |    137 |
| decoration |    5 |             1 |           1.00 |  1.113 |  10.50 |    118.9 |    137 |
| text       |    5 |             1 |           1.00 |  0.861 |   5.50 |     72.0 |     35 |
| animation  |    5 |             1 |           1.00 |  1.539 |  26.34 |    251.2 |      0 |
| drain      |    5 |             1 |           1.00 |  1.077 |  12.93 |    119.9 |      0 |
| gate       |    5 |             1 |           1.00 |  0.738 |  4.778 |     70.2 |      0 |

`wire` is #129 and #130: one typed batch per job, numeric ids, colors
parsed once in C++. The renderer still parses what its untyped setters
read as text (enums, lengths, JSON); the concern-table migrations remove
that, one table at a time.

`layout` moves the layout table to typed values. Its parses were already
none here: since `wire` lengths and flex factors arrive as numbers, and the
list rows' layout enums were all defaults. Its times are within this
sitting's noise.

`decoration` moves corners, borders, shadows, overflow and gradients to
typed values: colors arrive as `0xRRGGBBAA` and the renderer parses no hex.
The first-render list draws none of them, so its parses stay; the
emulator's tenfold faster times in this row are the host's load falling
between sittings, not the change.

`text` moves text, color and typography to typed values: the list's rows
no longer parse their text color, size and weight, so the first render's
parses fall by three quarters on both platforms. What is left comes from
the tables still on scalars (background colors in the animation table,
the list's own props).

`animation` is the last table, measured with #148's (images, controls,
lists, scrolls, accessibility) already in: opacity, transforms,
background colors and entering/exiting specs take typed values, and the
first render parses nothing on either platform. Its times are within
noise on iOS; the emulator ran it on a host under several times the
`text` row's load (load average 30 to 80), so its times are not a
regression to read from this table.

`drain` moves the frame handoff into `native/shared/FrameHandoff.h`:
`UIRuntime::drain` applies batches and then the UI kernel's frame from
one display link per shell. Commit times are within noise on both
platforms. The emulator's first sitting for this row (p50 6.229 ms,
total 1092.5 ms, single batches near 1 s) ran while the host's load
average was falling from 40. The row shows the second sitting minutes
later, on the same build.

## Gate

`gate` is the build after the last Phase 5 change (#159, the Android
layout bridge), measured with the commands above on 2026-10-19. Against
`before`, every job crosses the host boundary in one call on both
platforms, and the first render parses no prop text. iOS's p95 commit
time goes from 3.080 ms to 2.664 ms. Android's goes from 127.78 ms to
4.778 ms, but the host's load differed between those sittings, so that
time delta is not the change's alone.

The simulator is a clone of the "iPhone 18 Pro" device type (iOS 27.0),
not the shared simulator of that name, which other sessions keep in use.

### Bounded over a long run

The shells' commit log also logs a `KuitoCommitFrames` gauge at most
once a second while frames run: the batches the frame handoff holds
after a drain, and the motion values the mirror holds.
`scripts/benchmark-commits.ts` prints their bounds. One 60 s run of
`demo/motion.tsx`, tapping Pop and Spin and scrolling the feed
throughout:

```bash
npm run demo:ios -- --device "P5 iPhone 18 Pro" --port 8850 --entry motion.tsx
```

```bash
node scripts/benchmark-commits.ts --platform ios --device <udid> --port 8850 --runs 1 --seconds 60 --label motion
```

| platform | gauge samples | batches | most batches waiting | most motion values | motion values at the end |
| -------- | ------------: | ------: | -------------------: | -----------------: | -----------------------: |
| iOS      |            33 |      47 |                    1 |                  3 |                        3 |
| Android  |            54 |     191 |                    0 |                  3 |                        3 |

Neither grows: the handoff empties on each frame (the one batch iOS saw
waiting arrived mid-drain), and the mirror holds one entry per motion
value the app made. Frames stop when nothing animates and no batch
waits, so the gauges sample only the seconds that ran frames. On
Android, `adb shell input` drove the taps and scrolls; on iOS, the
simulator's touch injection did.

### Android: what crossing JNI costs a commit

Before packing the batch into one int and one double buffer, as React
Native did (#58692), we measured what the crossing costs now. A debug
build timed `sendBatch` (`JavaValues.h`) from its start to its Kotlin
call (packing: every array, string and JNI call), the Kotlin call itself
(`onNativeBatch`: decoding and applying), and, in a separate pass over
the same batch, `KuitoMutations.value` for every prop record (the
decoding, one `KuitoValue` per number, text, color or structured value).
JNI calls are counted from the records. Three cold launches of each,
Pixel 3a AVD (API 34, 1 core, 3 GB), 2026-10-22, the host shared with
other builds:

| scenario                                 | batches | records | JNI calls | values decoded | packing ms | Kotlin call ms | decoding ms | packing + decoding |
| ---------------------------------------- | ------: | ------: | --------: | -------------: | ---------: | -------------: | ----------: | -----------------: |
| `first-render.tsx`, 1,000-row list       |      38 |   1,509 |     6,015 |          1,104 |    2.6–4.7 |      444–1,463 |     1.1–1.4 |          0.3–1.3 % |
| Reel, Discover scrolled (rails, 4 pages) |     3–7 |  48–228 |   160–528 |         40–188 |  0.12–0.27 |          24–27 |   0.12–0.14 |          0.9–1.5 % |

Packing and decoding together stay under 2% of a commit; the rest is
the renderer creating and changing views. One buffer would save at most
that, so the batch keeps its parallel arrays: the plan's bar was 10%.
