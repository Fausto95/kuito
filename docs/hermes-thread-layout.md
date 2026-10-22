# Spike: layout on the Hermes thread (killed)

Phase 20 asked whether laying out on the JS (Hermes) thread, with a cache of
text measurements keyed by text, font and width mode and unseen ones measured
off the main thread, would cut the main thread's slow frames. Verdict:
**killed**. Layout itself costs the main thread almost nothing, so moving it
has nothing to save, and a measurement cache did not change `uiSlowPercent` on
a one-core or a two-core emulator. Layout stays on the main thread, in the
shared engine (native/shared/layout), as the renderers apply each batch.

## Kill criterion

Kill it if `uiSlowPercent` (frames whose own main-thread time passes 16.7 ms,
docs/performance.md) doesn't improve on the one-core emulator and a two-core
profile.

## Where the main thread's time goes

`scripts/benchmark-android.ts` traces the UI thread with `Kuito layout` (the
flex pass) and `Kuito measureLeaf` (a text or control measuring itself)
sections. On the one-core emulator, with the host quiet, three runs each:

| Scenario | uiSlowPercent | slow frames | flex layout, whole run | measuring, whole run | slow frames left without any layout or measuring |
| -------- | ------------: | ----------: | ---------------------: | -------------------: | -----------------------------------------------: |
| Discover |          0.17 |   1 of 1156 |             1.4–5.6 ms |             1.5–2 ms |                                                1 |
| Library  |          0.67 |  12 of 2225 |             1.2–1.3 ms |             31–34 ms |                                                5 |

The flex pass appears in no slow frame. Measuring appears in 10 of Library's
12, as rows scroll in. (Discover's first run cut its trace short; the table
counts the other two.) That bounds what the spike could do: even with every
measurement off the main thread, Library would keep 5 of its 12 slow frames,
and the flex pass would save nothing.

## The measurement cache

So the part worth trying was the cache. The prototype kept the last 1,024
text measurements on Android, keyed by text, typeface, size, letter and line
spacing, line limit, ellipsizing, both measure specs and padding, and
answered `measureLeaf` from it (`KuitoLayoutNode`; not merged). Measured
against the build without it, alternating builds per run, three runs each:

| Profile                 | Scenario | uiSlowPercent without |  with |
| ----------------------- | -------- | --------------------: | ----: |
| 1 core, loaded host (a) | Discover |                  7.54 |  6.32 |
| 1 core, loaded host (a) | Library  |                 25.55 | 25.53 |
| 1 core, loaded host (b) | Discover |                 10.05 |  8.79 |
| 1 core, loaded host (b) | Library  |                 14.33 | 15.26 |
| 2 cores                 | Discover |                     0 |     0 |
| 2 cores                 | Library  |                 0.271 | 0.408 |

A macOS storage service held a host core through both one-core rounds, which
is why their frames are slower than the quiet baseline above; each round
alternated the two builds, so the load fell on both. Neither moved beyond
round-to-round noise. On two cores, with the host quiet, Library's slow frames
went from 5 to 11 of about 2,200, and measuring took longer with the cache
(37–49 ms a run against 30–34 ms), building its keys. Per call it was no
faster on one core either (0.07–0.10 ms either way): rows that scroll in are new text, so they miss,
and the platform still measures each view in its own layout pass.

## Why it does not pay

- The flex pass is already cheap: a few milliseconds per run, in no slow
  frame.
- The measurements that land in slow frames are of text the screen has not
  shown yet, which a cache cannot answer; measuring it off the main thread
  ahead of time needs the width the layout has not computed yet.
- Moving layout to the Hermes thread would also put the platform's text
  measurement (NSAttributedString, StaticLayout) behind a thread hop for every
  new string, and the main thread would still lay views out to the frames it
  received.
