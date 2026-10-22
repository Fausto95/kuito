# Text min-content width

What a layout pass costs when every label in a shrinking row is measured
again, before and after the renderers keep each label's min-content width
on its style and measure it once per text and font
([performance](../docs/performance.md#text-layout)).

## Scenario

`demo/text-rows.tsx`: 100 rows of two labels too wide for them, every label
retitled each second. In such a row the engine asks each label for its
min-content width three times a pass, under three different cache keys
(counted with a counting measure function on the headless engine,
`src/tests/layout.ts`): 600
word-by-word measurements a pass before, 200 after.

## Method

Each build carried a local timer around the engine's pass (iOS
`KuitoRootView.layoutSubviews`, Android `KuitoFlexLayout.onMeasure`),
logging its milliseconds; the timer is not in the tree. Both builds ran
the same JS from one dev server. The before and after apps were installed
in turn, three rounds of 60 s each after a 25 s warm-up, so load on the
host fell on both alike. Only passes over 1 ms count: the passes that
measured the retitled labels.

Debug builds, on a simulator and an emulator shared with other work: no
physical device was connected.

## Results (2026-10-22)

| Platform                                         |  Passes | p50 before → after | p90 before → after |
| ------------------------------------------------ | ------: | -----------------: | -----------------: |
| iOS simulator, "iPhone 18 Pro" (iOS 27.1), debug | 177/176 |     65.5 → 42.5 ms |     82.5 → 56.2 ms |
| Android emulator (API 34, arm64), debug          | 100/144 |   1,382 → 1,020 ms |   1,832 → 1,474 ms |

Each round's after median was below every round's before median on both
platforms (iOS 64.0–79.0 before, 41.1–43.0 after; Android 1,311–1,432
before, 959–1,131 after). The emulator ran under heavy host load (other
emulators and builds; load average above 30 in the guest at times), which
makes its absolute times large and its passes fewer than one a second;
compare the ratio, not the times.
