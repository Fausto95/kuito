# UI-thread round trips in the demos

Phase 20's gate: the gesture, motion and audio demos make no `__kuito.ui`
round trip (`__kuito.stats().total.uiMessages`, docs/placement.md) while you
use them, on the "iPhone 18 Pro" simulator and an Android emulator.

Each demo ran under `kuito dev` (`--entry gestures.tsx`, `motion.tsx`,
`audio.tsx`) on a temporary "iPhone 18 Pro" simulator (iOS 27.0) and a
one-core API 34 emulator (`Pixel_3a_API_34` image). Real touches came from
the simulator's touch injection and `adb shell input`. A Chrome DevTools
Protocol client read `__kuito.stats().total` on the JS thread before and
after, and `__kuitoUI.stats()` on the UI thread.

| Demo         | Interaction                                                                          | iOS `uiMessages` | Android `uiMessages` |      JS `sendPropCalls` during it |
| ------------ | ------------------------------------------------------------------------------------ | ---------------: | -------------------: | --------------------------------: |
| gestures.tsx | tap, double tap, long press, drag the card, flick the knob, touch the pad, pinch     |                0 |                    0 |                                 0 |
| motion.tsx   | Pop, Spin (counting spins), scroll the feed past the header, Stop                    |                0 |                    0 |                                 0 |
| audio.tsx    | play a stream, −5 s from end, loop, rate, volume, pause; progress bars while playing |                0 |                    0 | changes only for the status label |

Before Phase 20 the gestures demo made one round trip per tap: its counters
were JS-thread signals written from UI-thread gesture callbacks, and its
analytics call went to the JS thread. The counters are now the component's
signals on the UI thread, and the demo no longer has the analytics call.
The audio demo made one per "−5 s from end": that handler read a motion
value, so it ran on the UI thread, and the seek it called answered on the JS
thread. It now stays on the JS thread, where its result is real.

Reel's placement report (`kuito dev` in `demo/`) lists no fallback: every
prop, handler and component that reads or moves a motion value, or whose
signals only views and handlers use, is placed on the UI thread.
