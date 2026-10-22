# Frame cost in counts

What each budgeted interaction costs the main thread in the cost counters
([performance.md#cost-counters](../docs/performance.md#cost-counters)), at
`ed51394` plus the counters. Counts do not depend on the machine; they are
the starting point each fix in the frame-drops plan tightens. A budget a fix
has not reached is a known failure in its test and names its target.

Recorded 2026-10-22 on the headless host (Node 24, `npm test`), the
"iPhone 18 Pro" simulator (iOS 27, Debug renderer tests) and the Android
emulator `emulator-5554` (API 34, arm64, debug renderer tests). No physical
device was connected.

## Budgets

| Interaction                | Budget                                             | Today, headless | Today, iOS             | Today, Android         | Target  |
| -------------------------- | -------------------------------------------------- | --------------- | ---------------------- | ---------------------- | ------- |
| S1: tap a paint-only prop  | 0 layout passes, ≤ 1 label redraw, 0 views created | holds           | 1 layout pass          | 1 layout pass          | F1      |
| S1: tap a paint-only prop  | 0 nodes framed                                     | 109 framed      | 103 framed             | 3 framed               | F1      |
| One label's text among 100 | 1 measure call, ≤ 2 nodes framed, ≤ 1 label redraw | 3 measures, 109 | 3 measures, 103 framed | 3 measures, 102 framed | F2, F3  |
| S6: an idle frame          | 0 of everything                                    | holds           | holds                  | holds                  | (holds) |

Android's paint-only tap lays out once but frames only the root's direct
children: a pass reaches a view only when it is forced or resized. iOS
applies every view's frame on every pass (`applyFramesToChildren`).

## Counts

`test/frame-cost.test.ts` (headless, `test/fixtures/frame-cost/app.tsx`:
a Pressable, a second Pressable that renames label 50, a TextField, 100
labels in a column; 109 nodes). S4 is `test/fixtures/wire/scroll-app.tsx`
scrolled 10 steps of 40 pt, a frame apart.

| Headless          | records | props (wasted) | passes (wasted) | laid out | framed (wasted) | measures (wasted) | UI entries (wasted) | views |
| ----------------- | ------: | -------------: | --------------: | -------: | --------------: | ----------------: | ------------------: | ----: |
| S1 paint-only tap |       1 |          1 (0) |           0 (0) |        0 |       109 (109) |             0 (0) |               0 (0) |     0 |
| Rename one label  |       1 |          1 (0) |           1 (1) |       10 |       109 (109) |             3 (2) |               0 (0) |     0 |
| S4 scroll a list  |      86 |         48 (0) |         29 (10) |      249 |     9071 (9014) |          163 (28) |             29 (19) |    38 |
| S6 idle 1 s       |       0 |          0 (0) |           0 (0) |        0 |           0 (0) |             0 (0) |               0 (0) |     0 |

`KuitoCostTests.swift` and `KuitoCostTest.kt` (a Pressable with a label,
then 100 labels in a column; 103 nodes):

| Renderer          | Platform | records | props (wasted) | passes (wasted) | laid out | framed (wasted) | measures (wasted) | redraws (wasted) | views |
| ----------------- | -------- | ------: | -------------: | --------------: | -------: | --------------: | ----------------: | ---------------: | ----: |
| S1 paint-only tap | iOS      |       1 |          1 (0) |           1 (1) |        0 |       103 (103) |             0 (0) |            0 (0) |     0 |
| S1 paint-only tap | Android  |       1 |          1 (0) |           1 (1) |        0 |           3 (3) |             0 (0) |            0 (0) |     0 |
| Rename one label  | iOS      |       1 |          1 (0) |           1 (1) |        7 |       103 (103) |             3 (0) |            1 (0) |     0 |
| Rename one label  | Android  |       1 |          1 (0) |           1 (1) |        7 |       102 (102) |             3 (2) |            1 (0) |     0 |
| Same color twice  | iOS      |       2 |          2 (1) |           1 (0) |        4 |           1 (0) |             0 (0) |            0 (0) |     0 |
| Same color twice  | Android  |       2 |          2 (1) |           1 (1) |        0 |           1 (1) |             0 (0) |            0 (0) |     0 |
| S6 idle frame     | both     |       0 |          0 (0) |           0 (0) |        0 |           0 (0) |             0 (0) |            0 (0) |     0 |

Every rename's pass is wasted: the label stretches across its column, so its
new text changes no frame, yet every view is framed again. The two wasted
measures on Android are the label measured again at the widths it was
measured at before its text changed, to the same answers.
