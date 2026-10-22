# Spike: synchronous input commits (kept)

Phase 20 tried letting the main thread wait for a press's or a change's
JavaScript, so its views change in the frame the touch lands in rather than
the next one. Verdict: **kept**. By Phase 0's touch-latency metric it takes a
frame off Reel's median on both emulator profiles and leaves the p95 where it
was. How it works is in [native scheduling](native-scheduling.md#input).

## What was tried

A press or change that no UI-thread handler takes goes to the JS thread as
always, and the main thread then waits, up to a 4 ms budget, for that job to
end. If it does, the main thread drains the frame handoff at once, applying
the job's batch inside the touch's own input handling, before the frame is
drawn. A job that runs past the budget falls through: its batch waits for the
next display frame, as before. Other events never wait.

## Kill criterion

Kill it if Reel's p95 handler time exceeds the budget often enough that the
wait costs more than it saves, by Phase 0's touch-latency metric
(`KuitoCommitStats`: from the touch's own timestamp to the end of applying
the first batch sent after it, docs/performance.md#native-counters).

## Numbers

**Handler time**, from dispatching the event on the JS thread to its first
`__kuitoHostCommit`, microtasks included: what the main thread waits for.
Reel under `kuito dev`, read over the DevTools protocol: 20 rounds of opening
Breaking Bad's details sheet, saving it twice and closing it, and three tab
switches per round, then typing into Search.

| Device                                                    | events | p50 ms | p95 ms | over 4 ms |
| --------------------------------------------------------- | -----: | -----: | -----: | --------: |
| iOS simulator, "iPhone 18 Pro" (iOS 27.0)                 |    121 |   0.53 |   1.83 |         1 |
| Android emulator, 1 core, API 34 (host loaded, see below) |    121 |   0.79 |  10.49 |        22 |
| Android emulator, 2 cores, API 34                         |    121 |   0.82 |   4.85 |        11 |

Reel's p95 passes the budget on Android, mostly when a press opens the details
sheet (over 4 ms 9 times in 20 on one core, 7 on two). So the metric decides.

**Touch-to-applied latency** with the wait off and on, in alternating launches
of one build (a launch extra chose the arm): `adb shell input` taps on the tabs
and on a poster that opens the sheet, then a swipe that closes it.

| Device                                | arm     | touches | p50 ms | p95 ms | waits answered in time |
| ------------------------------------- | ------- | ------: | -----: | -----: | ---------------------: |
| Android emulator, 1 core              | without |      51 |     19 |     44 |                        |
| Android emulator, 1 core              | with    |      51 |     11 |     46 |               48 of 51 |
| Android emulator, 2 cores             | without |      34 |     16 |     38 |                        |
| Android emulator, 2 cores             | with    |      34 |      8 |     40 |               31 of 34 |
| Android emulator, 1 core, host loaded | without |      40 |     62 |    390 |                        |
| Android emulator, 1 core, host loaded | with    |      40 |     64 |    495 |               20 of 32 |

The last two rows ran while a macOS storage service held a host core, which
starved the one-core emulator (its frame benchmark showed 50–60% janky frames
then, against under 1% otherwise); the waits overran there too (a 4 ms wait
took 7.8 ms at p95). Under normal load the wait saves about one frame at the
median and costs nothing measurable at the p95, so it pays.

The iOS simulator's handlers answer within the budget at p95 (1.83 ms); its
touch latency was not measured, since its touches come from the simulator's
injection one at a time.

## What it costs

- A press or change whose job is slow holds the main thread for up to 4 ms
  before the frame; that is the budget, and the frame it tried to save is
  four times as long.
- A change that sends nothing (a two-way field the view already shows) still
  waits for its job to end, which is quick: the job is the handler alone.
- Code that must answer in the touch's own frame whatever the JS thread is
  doing belongs on the UI thread, which runs before any wait
  ([placement](placement.md)).
