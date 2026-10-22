# Motion

Everything that moves is one small algebra, written as data:

- **Sources**: a motion value, a gesture, a view's motion source (a Scroll's
  offset), a signal, time (an animation).
- **Transforms**: `map`, `clamp`, `interpolate`; `timing`, `spring`, `decay`;
  `delay`, `sequence`, `parallel`, `stagger`, `repeat`, `keyframes`.
- **Sinks**: props.

Declarations compile to programs the UI thread runs next to the views, so
moving never waits for JavaScript and never re-renders a component. A callback
is the exception, for what needs JavaScript.

```tsx
import { Box, interpolate, motion, pan, spring } from 'kuito';

export function Card() {
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  return (
    <Box
      translateX={x}
      opacity={interpolate(x, [0, 200], [1, 0.5])}
      rotate={x.map((v) => v / 20)}
      gestures={[drag]}
    />
  );
}
```

That is a complete draggable that springs home with the finger's velocity: no
handler, and nothing crosses to the JavaScript thread while it moves.

## Motion values

`motion(initial)` works like `signal()`: call it while a component sets up,
read and write `.value` anywhere. Use `signal()` for values components react
to, and `motion()` for values the screen moves with. A motion value goes when
its component unmounts.

- `x.follows(source)` moves `x` with `source` on the UI thread: a gesture's
  field (`drag.x`), another motion value, or a derived one. `null` stops it.
- `x.map(fn)`, `interpolate(x, input, output)` and `clamp(x, min, max)` make
  derived values: computed on the UI thread whenever `x` moves, and given to a
  prop or followed like a motion value. `interpolate` maps piece by piece
  between numbers or hex colors, holding its end values unless
  `{ extrapolate: 'extend' }`. `map` takes a function the compiler compiled for
  the UI thread ([Placement](placement.md)).
- `x.value = animation` animates it; `x.value = 5` moves it now.

## Gestures

Gestures are values, recognized natively by ports of
[React Native Gesture Handler](https://github.com/software-mansion/react-native-gesture-handler)
(RNGH)'s recognizers, and attached with one prop:

| Gesture       | Options                                               | Moves (follow these)                      |
| ------------- | ----------------------------------------------------- | ----------------------------------------- |
| `pan()`       | `axis`, `minDistance`                                 | `x`, `y`: its translation, added          |
| `touches()`   |                                                       | `x`, `y`: where the finger is in the view |
| `pinch()`     |                                                       | `scale`, multiplying                      |
| `rotate()`    |                                                       | `rotation` in degrees, added              |
| `tap()`       | `count`, `maxDuration`, `maxDistance`                 |                                           |
| `longPress()` | `after` (500 ms), `maxDistance`                       |                                           |
| `fling()`     | `direction`: `'left'`, … or a list (right by default) |                                           |

Every gesture also takes `disabled` and `hitArea`, the view props' names
(sent as RNGH's `enabled` and `hitSlop`, see [the native
contract](#native-contract)), moves `active` (1 while it is active), and takes
the callbacks that need JavaScript: `onStart` (it activated), `onChange` (it
moved, with `changeX`/`changeY`, `scaleChange` or `rotationChange`) and
`onEnd(event, success)`. Each runs where the compiler can place it. `axis` makes a pan start after 10 points along it and fail after
10 across. An invalid option is an error.

- **Following**: a motion value following a field starts from where it is when
  the gesture activates; `pan` and `rotate` add their translation or rotation,
  `pinch` multiplies by its scale, `touches` sets the position.
- **Release**: `gesture.release(animation)` says how its followers let go. Each
  runs the animation with the gesture's velocity, toward its own home (its
  first value) unless the animation has a target: `drag.release(spring())`
  springs home, `drag.release(decay({ clamp: [0, 400] }))` coasts,
  `drag.release(spring().to([0, 400]))` snaps to the point nearest where the
  throw would land.
- **Composing**: several gestures on a view race (the first to activate wins).
  `race(a, b)`, `together(a, b)` (both at once: pinch and rotate) and
  `orElse(a, b)` (b waits for a to fail: a double tap, or else a tap) compose
  them as values, and nest. (Not `then`: a module exporting `then` is a
  thenable, which `import()` calls.) Across views, the innermost view's
  gesture gets the touch first, as in RNGH.

```tsx
import {
  Box,
  Image,
  clamp,
  longPress,
  motion,
  orElse,
  pinch,
  race,
  rotate,
  spring,
  tap,
  together,
} from 'kuito';

export function Photo({ src }: { src: string }) {
  const zoom = pinch().release(spring());
  const turn = rotate().release(spring());
  const scale = motion(1).follows(zoom.scale);
  const angle = motion(0).follows(turn.rotation);

  return (
    <Image src={src} scale={clamp(scale, 1, 3)} rotate={angle} gestures={[together(zoom, turn)]} />
  );
}

export function Post(props: { like(): void; open(): void; showMenu(): void }) {
  return (
    <Box
      gestures={[
        race(
          orElse(tap({ count: 2, onEnd: props.like }), tap({ onEnd: props.open })),
          longPress({ onStart: props.showMenu }),
        ),
      ]}
    />
  );
}
```

Pull to refresh is the scroll view's own: `<Scroll refreshing={loading}
onRefresh={reload}>`, whose pull the platform runs; `reload` is the data work
that needs JavaScript.

## Motion sources

Some native views move on their own, and say where they are every frame
into motion values an app reads like a gesture's: a Scroll or a List as it
scrolls. Make the source while the component sets up, give it to the view's
`motion` prop, and bind props to its values:

```tsx
import { Box, Scroll, interpolate, scrollMotion } from 'kuito';

export function Feed() {
  const feed = scrollMotion();

  return (
    <Scroll motion={feed}>
      <Box
        translateY={feed.offset.map((offset) => offset / 2)}
        opacity={interpolate(feed.offset, [0, 120], [1, 0])}
        scale={feed.overscroll.map((pulled) => 1 + Math.max(-pulled, 0) / 200)}
      />
    </Scroll>
  );
}
```

| Source                   | On                  | Moves                                                                                                                                                                            |
| ------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyboard.height`        | the app             | the keyboard's height over the window's bottom, every frame it moves ([keyboard](keyboard.md#keyboard))                                                                          |
| `sheetMotion()`          | Sheet               | `height`: points the sheet stands over the screen's bottom; `progress`: between its lowest snap point (0) and its highest (1), below 0 while dragged toward closing              |
| `back` (a screen's prop) | the Router's stacks | how far a back swipe has taken the top screen away, 0 to 1 ([navigation](navigation.md#motion))                                                                                  |
| `scrollMotion()`         | Scroll, List        | `offset`: points along the view's axis within its scroll range; `velocity`: points per second toward the end; `overscroll`: points pulled past an end, negative before the start |

The view sends its source's values every frame it moves, as one typed event
with no JSON; the UI thread writes them and the event goes no further, so a
view bound to one moves in the frame the scroll does, with no handler and no
JavaScript. Nothing reaches the JS thread unless a prop there reads one: it
then hears of each frame's move as of any other UI-thread move, and a read
anywhere returns the mirrored number. Once it has been still for 1/30 s (two
frames at 60 Hz), the view sends its values once more with `velocity` 0, a
finger held still included; a first move from rest has no speed yet.

Only the view writes them: assigning one is an error; follow one or map it.
A source moves with one view at a time: a plan that gives it to a second
view fails, wherever that view is. A view takes only its own kind's source
(`motion` on a Box is an error), and `motion={undefined}` stops it sending.
Its values go when its component unmounts.

Limits:

- Android: `overscroll` stays 0. Its overscroll stretches what the view
  draws; the content does not move past its range, as iOS's bounce moves it.
- On an inverted List, `offset` counts from the list's first item.
- Android: a List's `offset` adds up its own scrolling exactly; after a jump
  to an item (`scrollToIndex`, `initialIndex`) it starts again from the
  list's estimate, which counts rows not measured yet at their average size.

## Animations

Builders describe how a value moves; `.to(target)` says where, for a prop or a
motion value given the animation directly:

```tsx
import { Box, Pressable, delay, keyframes, motion, repeat, sequence, spring, timing } from 'kuito';

export function Badge() {
  const pulse = motion(1);

  return (
    <Pressable
      onPress={() => (pulse.value = sequence(timing(120).to(1.2), spring().to(1)))}
      onLongPress={() => (pulse.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600)))}
    >
      <Box opacity={timing(200).to(0)} translateY={delay(80, spring().to(12))} />
      <Box scale={pulse} />
    </Pressable>
  );
}
```

| Builder                                                                   | Defaults                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| `timing(duration)`, `timing({ duration, easing, delay, onEnd })`          | 300 ms, `easing.inOut`                              |
| `spring({ damping, stiffness, mass, velocity, overshoot, delay, onEnd })` | damping 10, stiffness 100, mass 1, `overshoot` true |
| `spring({ duration, dampingRatio, clamp, ... })`                          | 1333 ms, damping ratio 0.5                          |
| `decay({ velocity, deceleration, clamp, rubberBand, onEnd })`             | velocity 0, deceleration 0.998                      |
| `keyframes({ 0: a, 50: b, 100: c }, duration or timing config)`           | a timing through each stop                          |
| `delay(ms, animation)`                                                    | adds a delay to any animation                       |
| `sequence(a, b, ...)`, `repeat(animation, { count, reverse, onEnd })`     | count Infinity                                      |
| `easing.linear`, `ease`, `in`, `out`, `inOut`, `bezier(x1, y1, x2, y2)`   | cubic-bezier curves, as in CSS                      |

An animation starts on the next frame, from wherever the value is then.
Assigning a value or another animation interrupts it, and its `onEnd` runs
with `false`. A spring keeps the velocity of what it interrupts, when that
carries it toward its target, and keeps a velocity it is given (a release's)
either way. Numbers and hex colors (`#rrggbb`, `#rrggbbaa`) animate; a color
runs any animation channel by channel. Several targets are snap points.
`onEnd` needs a motion value the app holds: a prop given one is an error, as
is a timing or spring without a target. Until the UI thread starts an
animation, a JS-thread read returns where the value is, not where it is going.

The math (timing along a cubic bezier, springs by physics or by duration,
rigid and rubber-band decay, sequence, repeat and delay) is a port of
Reanimated's, with its config names and defaults (Reanimated 3's for springs;
`overshoot: false` is its overshoot clamping): a delay lets the animation it
interrupts keep running until it starts.

## Animated props: `animate` and `transition`

A view says what changes and how it moves:

```tsx
import { Box, Pressable, signal, spring, timing } from 'kuito';

export function Card() {
  const open = signal(false);

  return (
    <Pressable onPress={() => (open.value = !open.value)}>
      <Box
        animate={{ opacity: open.value ? 1 : 0.6, scale: open.value ? 1 : 0.96 }}
        transition={{ opacity: timing(200), transform: spring({ damping: 14 }) }}
      />
    </Pressable>
  );
}
```

`animate` takes values for animatable props (`opacity`, `backgroundColor`,
`translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`,
`borderRadius`, `borderColor`, `shadowColor`, `shadowRadius`, `shadowOffsetX`,
`shadowOffsetY`, `width`, `height`). Its first values apply at once; every
change after moves as `transition` says. A prop set both directly and in
`animate` is an error, as is an animation in `animate`. Only numbers and hex
colors move: a `width` changing to or from `'50%'` or `'auto'` applies at once.

`transition` names an animation per group: `opacity`, `backgroundColor`,
`transform` (the translations, scales and rotation), `borderRadius`,
`borderColor`, `shadow` (the four shadow props), `width`, `height` or `all`.
It applies to `animate`, to `enter` and `exit`, and to plain changes of the
props it names. Without one, `animate`, `enter` and `exit` spring transforms
and run 300 ms timings for the rest; a plain prop change applies at once.

An animated `width` or `height` lays out each frame, but only the part of the
screen it can move ([Layout](styles.md#layout)): give the box around it a set
size to keep that part small. A CSS `transition`
in a `.css` module or `styles()` compiles to the same prop
([Native styles](styles.md#transitions)):

```css
.card {
  transition:
    transform 400ms spring(14, 180),
    opacity 250ms ease-out;
}
```

A prop given an animation, or changed under a transition, binds to a motion
value of its own, so each animation continues from where the last one was.

## Entering, leaving and moving: `enter`, `exit`, `layout`

An effect names the props a view enters from and leaves to:

| Effect                                                            | Enters from, leaves to                             |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `fade`                                                            | transparent                                        |
| `slide.up(d)`, `slide.down(d)`, `slide.left(d)`, `slide.right(d)` | `d` (24 by default) away, moving in that direction |
| `zoom(scale)`                                                     | `scale`, 0.85 by default                           |
| `keyframes({ 0: { ... }, 100: { ... } }, duration)`               | its own stops, the same both ways                  |

```tsx
import { Box, fade, slide, spring } from 'kuito';

export function Toast() {
  return <Box enter={fade.and(slide.up(12))} exit={fade} layout={spring()} />;
}
```

`a.and(b)` and `parallel(a, b, ...)` play effects at once; `sequence` one
after another, each starting when the last one's slowest prop ends;
`stagger(ms, a, b, ...)` each `ms` after the one before; `delay(ms, effect)`
later. Each prop moves as `transition` says and ends at the view's own value.

`enter` plays when the view is created. When a view with `exit` is removed it
leaves JavaScript's tree at once, but the renderer keeps it on screen, taking
no touches, while the UI thread animates it out from wherever it is.

`layout={spring()}` (or `timing(...)`) animates the view to each new frame the
layout gives it, on the platform's own animator. Its first frame applies at
once.

Two things stay on the platform's animators rather than the UI thread's
motion path, both on the main thread with no JavaScript in them. `layout`
moves a view to a frame the layout pass computes as it applies, after the UI
thread's frame has run; the UI thread drives props, not frames, so the
renderer interpolates the frame itself (a UIKit property animator; a
`ValueAnimator` or `SpringAnimation` on Android). A Pressable's
`pressedOpacity` and `pressedScale` feedback follows the native view's own
touch tracking, a fixed quick ease in and gentle ease out; sending it through
the UI kernel would add a hop to every touch for no change in what the user
sees.

A view with a `sharedId` flies to the view with the same `sharedId` on the
screen a stack pushes or pops to, alongside the stack's own transition
([Shared elements](navigation.md#shared-elements)).

## Reduced motion

With the user's reduced-motion setting on, every animation, transition and
effect jumps to where it ends, and `layout` applies frames at once (the
system's reduce-motion setting on iOS, the animator duration scale on
Android). Gestures still follow the finger: that is direct manipulation, not
animation. The kernel tells the UI thread the setting when it starts and on
every change.

## Where it runs

Motion runs on the UI thread by construction; app code never names a thread.
What the compiler and the kernel place where, why, and how to read `kuito
dev`'s placement report is in [Placement](placement.md).

## How the threads stay in step

- Motion values belong to the UI thread. A JS-thread read never waits. It
  returns the copy the UI runtime writes after each change, unless the JS thread
  has written a newer value since; that write is numbered, and the copy shows
  when the UI thread applied it. A number's copy is a number
  (`native/shared/MotionMirror.h`); another value's copy is plain data, read
  whole, never JSON.
- Operations for the UI thread queue during a JS task and travel inside the
  native mutation batch after the view mutations they refer to. Calls back to
  the JS thread travel as `__kuito.ui` events (`docs/events.md`).
- A prop or label that reads a motion value but runs on the JS thread
  (docs/placement.md) watches it. When UI-thread code moves watched values,
  the UI thread holds them to its next frame and sends one `__kuito.ui`
  message listing the latest of each: one JS job a frame however many events
  moved them, applied as one transaction.
- Values cross as plain data with a few tags (`src/runtime/thread-wire.ts`),
  which C++ carries between the runtimes without JSON
  (docs/native-scheduling.md#structured-props).
- The UI runtime starts with the first message. An app that never moves
  anything pays nothing, and a host without a UI runtime runs everything on the
  JS thread: gestures and their followers too, while an assigned animation
  jumps to where it ends (a decay stays where it is) and calls `onEnd` with
  `true`, and effects do nothing.

## Platforms

On iOS and Android, the UI runtime is a second Hermes runtime on the main
thread (`native/shared/UIRuntime.cpp`), next to the renderer. It applies the
props it computes before returning, so they land in the frame being built.
Animations advance on display frames, the same ones that apply the JS thread's
batches (docs/native-scheduling.md), which the UI runtime asks for only while
something animates or batches wait.

A motion value given to a layout prop (`width`, `height`, `padding`, ...) lays
out in the same frame, and only the part of the screen the change can move
([Layout](styles.md#layout)).

Gestures work inside a `Sheet` on both platforms: on Android the sheet's
content is a root of touches of its own, since it lives in its own window.

Limits:

- Android: a vertical `Scroll` does not cancel a gesture on an ancestor when it
  starts scrolling (its refresh wrapper swallows the request).
- A tap on an ancestor of a `Pressable` wins over the press, as in RNGH;
  `Pressable`'s `onLongPress` is its own press event.

## Native contract

Structured values cross the native boundary as plain data, checked against
their schema once in C++ (docs/native-scheduling.md#structured-props). An animated prop
reaches the renderer as the values the UI thread sets on each frame; the kernel
keeps `transition`, `animate`, `enter`, the app's `gestures` and `motion`
values and never sends them as given.

- `emitsMotion`: `true` while the app gives the view a motion source. The
  view then sends `motion` with its kind's payload (`ScrollMotionPayload`:
  `offset`, `velocity`, `overscroll`) on every move, on the first display
  frame after it turns on, and once at rest on a display frame that finds it
  still for 1/30 s (`KuitoScrollMotion` on both renderers). The kernel registers a UI-thread handler for it that names the
  motion value of each field (`{ op: 'handler', key, motion: { offset: id,
  ... } }`).
- `exit`: `true` while the view has an exit effect. A removed view with it
  stays in its superview, held by the renderer, which applies the props the UI
  thread sets on it until the UI thread sets `exited`; then it goes.
- `layout`: `{ type: 'timing', duration, easing: [x1, y1, x2, y2], delay }` or
  `{ type: 'spring', damping, stiffness, mass, delay }`, the animation frame
  changes run with (a UIKit property animator; a `ValueAnimator` or
  `SpringAnimation` on the view's bounds on Android).
- `gestures`: one entry per recognizer attached to the view (a composed gesture
  contributes all of its gestures), owned by `properties/KuitoGestureProperties`
  on both renderers, which keep RNGH's ported recognizers in `gestures/`:

```json
[
  {
    "tag": 7,
    "type": "pan",
    "config": { "activeOffsetXStart": -10, "activeOffsetXEnd": 10, "minDist": 4 },
    "waitFor": [],
    "simultaneousHandlers": [8],
    "blocksHandlers": []
  }
]
```

- `type`: `pan`, `tap`, `longPress`, `pinch`, `rotation` or `fling`.
- `config`: RNGH's native config keys, only those set: `enabled`,
  `shouldCancelWhenOutside`, `hitSlop` (`{ left, top, right, bottom, width,
  height, horizontal, vertical }`), pan's `activeOffsetXStart/End`,
  `activeOffsetYStart/End`, `failOffsetXStart/End`, `failOffsetYStart/End`,
  `minDist`, `minPointers`, `maxPointers`, `minVelocity`, `minVelocityX/Y`,
  `avgTouches`, `activateAfterLongPress`; tap's `numberOfTaps`,
  `maxDurationMs`, `maxDelayMs`, `maxDist`, `maxDeltaX/Y`, `minPointers`; long
  press's `minDurationMs`, `maxDist`, `numberOfPointers`; fling's `direction`
  (a bit mask: RIGHT 1, LEFT 2, UP 4, DOWN 8) and `numberOfPointers`.
- Relations name other gestures by `tag`, which are unique in the app. A
  gesture waits for another to fail when its `waitFor` names the other or the
  other's `blocksHandlers` names it; two run together when either's
  `simultaneousHandlers` names the other.
- A new value replaces the view's gestures: recognizers whose tag is gone are
  removed, others are reconfigured. `null` removes them all.

Arbitration is shared C++ (`native/shared/gestures`), credited to RNGH:
`GestureRelations` answers which gesture waits for or runs alongside which,
`GestureArbiter` decides which one activates, waits for another to fail or is
cancelled, and `GestureEvents` which state changes the app hears. Android runs
the arbiter for each root of touches: the orchestrator finds the gestures under
each pointer and delivers the stream in the arbiter's order. On iOS UIKit's
recognizers wait for and cancel each other themselves, asking the delegate,
which answers from the relations; the changes they make reach the app through
`GestureEvents`. Where the platforms used to differ, both now follow one rule:

- A gesture that waits for one the app already heard activate does not
  begin: it fails and the app hears nothing. iOS's delegate always refused it; Android let it
  begin, wait and be cancelled when the other ended, or activate late if the
  other failed, long after the touch.
- A gesture that never began sends nothing when it fails or is cancelled (no
  `onFinalize` without `onBegin`). iOS sent CANCELLED and Android FAILED from
  UNDETERMINED.
- `blocksHandlers` counts as the other gesture's `waitFor` everywhere,
  including iOS's check before a gesture begins.

The view emits `gesture` events (its number, `gesture`, a `GesturePayload` in
its typed record, docs/events.md#typed-events) with
`handlerTag`, `state`, `numberOfPointers`, `pointerType` (0 touch) and the
gesture's fields: `x`, `y`, `absoluteX/Y`; pan's `translationX/Y` and
`velocityX/Y`; pinch's `scale`, `focalX/Y` and `velocity`; rotation's
`rotation` (radians on the wire, degrees to the app), `anchorX/Y` and
`velocity`; long press's `duration`; plus `oldState` on a state change. A state
change and an update are separate events: an update has no `oldState`. A
field a gesture does not report is absent. States
are RNGH's: UNDETERMINED 0, FAILED 1, BEGAN 2, CANCELLED 3, ACTIVE 4, END 5.
Distances are in points (iOS) or density-independent pixels (Android).

The kernel turns gesture values into this contract (`src/runtime/gestures.ts`,
composing with RNGH's rules in `src/runtime/gesture-specs.ts`), and the
dispatcher both threads share (`src/runtime/gesture-events.ts`) turns events
into callbacks and follower moves, the mapping of RNGH's `useAnimatedGesture`.

## Credits

- The model of props computed on the UI thread from shared values, the
  animation math and `interpolate` come from
  [Reanimated](https://github.com/software-mansion/react-native-reanimated)
  (MIT, Software Mansion). Kuito tracks dependencies per run, as its signals
  do, rather than through everything a function captured.
- The native recognizers are ports of React Native Gesture Handler's, and the
  composition rules and event mapping follow its `Gesture` API: MIT License,
  Copyright (c) 2016 Software Mansion.
- Compiling thread functions into a second bundle, with lazily evaluated
  captures, follows [Octane](https://github.com/octanejs/octane)'s compiler
  (MIT, Dominic Gannaway).
