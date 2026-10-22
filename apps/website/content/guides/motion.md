# Motion

Animations, gestures and scroll-linked effects are declarations the UI thread runs next to the views, so nothing that moves waits for JavaScript or re-renders a component.

**Use it for**

- A card the finger drags, that springs back or snaps when let go.
- A prop that moves when state changes, and views that animate in, out and to new positions.
- A header that follows a scroll, content that follows a sheet or the keyboard.

## What you can animate, in one example

```tsx
import {
  Box,
  Button,
  Text,
  VStack,
  fade,
  interpolate,
  motion,
  pan,
  signal,
  slide,
  spring,
  timing,
} from 'kuito';

export function Card() {
  const open = signal(false);
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  return (
    <VStack gap={12} padding={20}>
      <Box
        gestures={[drag]}
        translateX={x}
        rotate={x.map((v) => v / 20)}
        opacity={interpolate(x, [0, 200], [1, 0.5])}
        animate={{ height: open.value ? 240 : 120, borderRadius: open.value ? 8 : 24 }}
        transition={{ height: spring({ overshoot: false }), borderRadius: timing(200) }}
        enter={fade.and(slide.up(12))}
        exit={fade}
        backgroundColor="#1e293b"
        padding={20}
      >
        <Text color="#ffffff">Drag me</Text>
      </Box>
      <Button onPress={() => (open.value = !open.value)}>Expand</Button>
    </VStack>
  );
}
```

- **A gesture** (`pan`) moves a **motion value** (`x`) that props follow; `release(spring())` springs it home with the finger's velocity.
- **Derived values** (`x.map`, `interpolate`, `clamp`) compute on the UI thread whenever `x` moves.
- **`animate`** says what a prop changes to; **`transition`** says how it moves there.
- **`enter` and `exit`** play as the view appears and goes.

None of this crosses to the JavaScript thread while it moves.

## Move a value with an animation

`motion(initial)` works like `signal()`: call it while a component sets up, and read or write `.value` anywhere. Assign a number to move it now, or an animation to move it there.

```tsx
import { Box, Button, VStack, keyframes, motion, repeat, sequence, spring, timing } from 'kuito';

export function Pulse() {
  const scale = motion(1);

  return (
    <VStack gap={12}>
      <Box scale={scale} width={80} height={80} backgroundColor="#f97316" />
      <Button onPress={() => (scale.value = sequence(timing(120).to(1.2), spring().to(1)))}>
        Bump
      </Button>
      <Button onPress={() => (scale.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600)))}>
        Breathe
      </Button>
    </VStack>
  );
}
```

| Builder                                                               | Defaults                                            |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| `timing(duration)`, `timing({ duration, easing, delay, onEnd })`      | 300 ms, `easing.inOut`                              |
| `spring({ damping, stiffness, mass, velocity, overshoot })`           | damping 10, stiffness 100, mass 1, `overshoot` true |
| `spring({ duration, dampingRatio, clamp })`                           | 1333 ms, damping ratio 0.5                          |
| `decay({ velocity, deceleration, clamp, rubberBand })`                | deceleration 0.998                                  |
| `keyframes`, `delay(ms, a)`, `sequence(a, b)`, `repeat(a, { count })` | `repeat` runs forever                               |

`spring({ overshoot: false })` stops at the target instead of passing it. An animation starts on the next frame, from wherever the value is then; assigning anything else interrupts it, and its `onEnd` runs with `false`. Numbers and hex colors animate.

Use `signal()` for values components react to, and `motion()` for values the screen moves with.

## Animate a prop when state changes

```tsx
import { Box, Pressable, signal, spring, timing } from 'kuito';

export function Selectable() {
  const on = signal(false);

  return (
    <Pressable onPress={() => (on.value = !on.value)}>
      <Box
        width={120}
        height={120}
        animate={{
          scale: on.value ? 1 : 0.96,
          backgroundColor: on.value ? '#22c55e' : '#334155',
          borderColor: on.value ? '#bbf7d0' : '#475569',
          shadowRadius: on.value ? 16 : 0,
          width: on.value ? 160 : 120,
        }}
        transition={{ transform: spring({ damping: 14 }), all: timing(250) }}
        borderWidth={2}
      />
    </Pressable>
  );
}
```

`animate` takes `opacity`, `backgroundColor`, `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`, `borderRadius`, `borderColor`, `shadowColor`, `shadowRadius`, `shadowOffsetX`, `shadowOffsetY`, `width` and `height`. Its first values apply at once; each change after moves as `transition` says, per group: `opacity`, `backgroundColor`, `transform`, `borderRadius`, `borderColor`, `shadow`, `width`, `height` or `all`. Without one, transforms spring and the rest run 300 ms timings. A `width` or `height` changing to or from `'50%'` or `'auto'` applies at once. A CSS `transition` compiles to the same prop ([Styles](../language/styles.md#animate-a-change)).

## Drag and let go

Gestures are values, recognized natively and attached with the `gestures` prop: `pan`, `touches`, `pinch`, `rotate`, `tap`, `longPress` and `fling`. Each takes the callbacks that need JavaScript: `onStart`, `onChange` and `onEnd(event, success)`.

```tsx
import { Box, decay, motion, pan } from 'kuito';

export function Drawer() {
  const drag = pan({ axis: 'y' }).release(decay({ clamp: [0, 400] }));
  const y = motion(0).follows(drag.y);

  return <Box gestures={[drag]} translateY={y} height={120} backgroundColor="#0f172a" />;
}
```

`release` says how followers let go: `spring()` springs home, `decay(...)` coasts, `spring().to([0, 400])` snaps to the nearest point. Several gestures on a view race; `race(a, b)`, `together(a, b)` and `orElse(a, b)` compose them.

## Animate views in, out and to new positions

```tsx
import { Box, Show, Text, fade, signal, slide, spring, zoom } from 'kuito';

export function Toast() {
  const shown = signal(true);

  return (
    <Show when={shown.value}>
      <Box enter={fade.and(slide.up(12))} exit={zoom(0.9)} layout={spring()}>
        <Text onPress={() => (shown.value = false)}>Saved</Text>
      </Box>
    </Show>
  );
}
```

Effects are `fade`, `slide.up(d)`, `slide.down(d)`, `slide.left(d)`, `slide.right(d)` (24 by default), `zoom(scale)` (0.85 by default) and `keyframes`. `a.and(b)` plays two at once; `sequence`, `stagger(ms, ...)` and `delay(ms, effect)` order them. A removed view with `exit` stays on screen, taking no touches, while it animates out. `layout={spring()}` animates the view to each new frame the layout gives it.

## Follow a scroll

`scrollMotion()` makes the values a `Scroll` or a `List` moves as it scrolls: `offset`, `velocity` and `overscroll`. Give it to the view's `motion` prop and bind props to it.

```tsx
import { Box, Scroll, Text, interpolate, scrollMotion } from 'kuito';

export function Feed() {
  const feed = scrollMotion();

  return (
    <Scroll motion={feed}>
      <Box
        height={200}
        translateY={feed.offset.map((offset) => offset / 2)}
        opacity={interpolate(feed.offset, [0, 160], [1, 0])}
        scale={feed.overscroll.map((pulled) => 1 + Math.max(-pulled, 0) / 400)}
      >
        <Text>Header</Text>
      </Box>
    </Scroll>
  );
}
```

One source moves with one view at a time; only that view writes it.

## Follow a sheet or the keyboard

`sheetMotion()` gives a `Sheet`'s `height` on screen and its `progress` between its lowest snap point (0) and its highest (1). `keyboard.height` is the keyboard's height over the window's bottom, every frame it moves, including an interactive dismiss.

```tsx
import { Box, Sheet, Text, TextField, interpolate, keyboard, sheetMotion, signal } from 'kuito';

export function Composer() {
  const open = signal(true);
  const sheet = sheetMotion();

  return (
    <Sheet open={open} snapPoints={['40%', '90%']} motion={sheet}>
      <Box opacity={interpolate(sheet.progress, [0, 1], [0.4, 1])}>
        <Text>Details</Text>
      </Box>
      <Box translateY={keyboard.height.map((height) => -height)}>
        <TextField placeholder="Reply" />
      </Box>
    </Sheet>
  );
}
```

A screen of a route gets the same values as props: `sheet` when it is presented as a sheet, and `back` as a back swipe takes it away ([Navigation](./navigation.md#follow-a-back-swipe-or-a-sheet)). A native module declares its own values for the platform to write with `motion<T>()` in its spec ([Native modules](../../../../docs/native-modules.md#motion-values)).

## Reduced motion

With the user's reduced-motion setting on, every animation, transition and effect jumps to where it ends, and `layout` applies frames at once. Gestures still follow the finger.

## Platform differences

- Android: a scroll's `overscroll` stays 0, since its overscroll stretches the drawing rather than moving the content.
- Android: a vertical `Scroll` does not cancel a gesture on an ancestor when it starts scrolling.
- Android: `back` jumps to 1 when the predictive back swipe commits; iOS follows the pop frame by frame.

## Related

- [Placement report](./placement.md): what runs on the UI thread, and why some code does not
- [Styles](../language/styles.md#animate-a-change): CSS `transition`
- [Navigation](./navigation.md#follow-a-back-swipe-or-a-sheet): `back` and `sheet` on screens
- [Motion in depth](../../../../docs/motion.md): every option, how the threads stay in step, credits
