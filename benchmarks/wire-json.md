# JSON at the boundary (plans 1.3, 2.5, 2.6)

What a scroll, a drag and a list update cross as JSON between the kernel, the
UI kernel and the renderer, counted on the headless host
(docs/performance.md#json-at-the-boundary). Plans 2.5 (typed events) and 2.6
(structured props) were done when every parse count here read zero.

## How it is taken

```bash
npx vp test run test/wire-json.test.ts
```

- The apps are `test/fixtures/wire/scroll-app.tsx` (a `List` of 200 rows
  whose `onScroll` writes a value a `Text` shows), `test/fixtures/drag-app.tsx`
  (a card that follows a pan and springs back, all on the UI thread) and
  `test/fixtures/wire/list-app.tsx` (a `For` of 100 rows with layout and
  enter animations and a gradient; one press moves a row, inserts one and
  edits one).
- The scroll and the drag run 30 display frames, an event each; the list
  update is one press and one frame. The test asserts the counts, so a change
  that moves one fails until this file and the test agree.
- Counts, not times: the same on any machine. Device numbers come with the
  device suite (plan 1.2), from the performance monitor and the commit log's
  frame gauge.

## Result

### After 2.6 (plain data)

| scenario    | frames | kernel parses | UI parses | renderer parses | kernel bytes |
| ----------- | -----: | ------------: | --------: | --------------: | -----------: |
| scroll      |     30 |             0 |         0 |               0 |            0 |
| drag        |     30 |             0 |         0 |               0 |            0 |
| list update |      1 |             0 |         0 |               0 |            0 |

The UI-thread operations, the rows' gradients and every other structured
prop now cross as plain data that C++ checks against the prop's schema once
(docs/native-scheduling.md#structured-props); the UI kernel makes no JSON at
all, so its byte count went with it.

### After 2.5 (typed events)

| scenario    | frames | kernel parses | UI parses | renderer parses | kernel bytes | UI bytes |
| ----------- | -----: | ------------: | --------: | --------------: | -----------: | -------: |
| scroll      |     30 |             0 |         0 |               0 |            0 |        0 |
| drag        |     30 |             0 |         0 |               0 |            0 |        0 |
| list update |      1 |             0 |         1 |               2 |          684 |        0 |

Every view event now crosses in its typed record (docs/events.md#typed-events):
the scroll's events and the rows it binds, the drag's gesture events and the
press. What the list update still parses is plan 2.6's: the UI-thread message
with the rows' animations, and the rows' gradients as JSON props.

### Before 2.5 and 2.6

`main` at `8e70fe85`:

| scenario    | frames | kernel parses | UI parses | renderer parses | kernel bytes | UI bytes |
| ----------- | -----: | ------------: | --------: | --------------: | -----------: | -------: |
| scroll      |     30 |            58 |        30 |               0 |            0 |        0 |
| drag        |     30 |             0 |        33 |               0 |            0 |        0 |
| list update |      1 |             3 |         1 |               2 |          684 |        0 |

- **Scroll**: each frame's scroll event is parsed on the UI thread, where the
  compiler placed `onScroll`; each row the list binds as it comes near
  reaches the kernel as a JSON `bind` event (58 rows over 30 frames).
- **Drag**: every gesture event (two to start, one per move, the release) is
  parsed on the UI thread; nothing reaches the kernel.
- **List update**: the press's three events (`pressin`, `pressout`, `press`)
  are parsed by the kernel; the rows' enter and layout animations go to the
  UI thread as one JSON message (684 characters); the new and the edited
  rows' `backgroundGradient` reach the renderer as JSON.
