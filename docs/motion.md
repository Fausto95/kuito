# Animate views and handle gestures

Use motion values for continuously changing UI properties, and signals for application state. Native gestures and animations can update views on the UI thread without waiting for JavaScript.

## Move a value to a target

Assign a timing or spring animation to a motion value. The value begins from its current position. Assigning a new value or animation interrupts the old one; an interrupted completion callback receives false.

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

## Animate a state change

The animate prop defines target values; transition chooses how they move. Use per-property transitions or all. Numeric width and height animate, while changes involving auto or percentages apply immediately. CSS transitions compile to the same behavior.

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

## Drag and release

Create a gesture, attach it to the view, then bind a motion value to its source. A release spring returns home; decay coasts; spring().to([...]) snaps to points. pan, pinch, rotate, tap, longPress, fling and touches cover different interactions. Compose with race, together or orElse.

```tsx
import { Box, decay, motion, pan } from 'kuito';

export function Drawer() {
  const drag = pan({ axis: 'y' }).release(decay({ clamp: [0, 400] }));
  const y = motion(0).follows(drag.y);

  return <Box gestures={[drag]} translateY={y} height={120} backgroundColor="#0f172a" />;
}
```

## Animate entry, removal and layout

Use fade, slide, zoom or keyframes for entry and exit. Combine effects with and, sequence, delay and stagger. A removed view remains visible for its exit effect but no longer takes touches. layout animates changes to its computed frame.

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

## Follow scrolling

Attach one scrollMotion source to one Scroll or List. offset, velocity and overscroll update as it moves. map, interpolate and clamp derive visual properties. Android overscroll remains zero because its effect stretches drawing instead of moving content.

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

## Follow a sheet or keyboard

sheetMotion exposes height and progress between the lowest and highest snap points. keyboard.height follows interactive keyboard motion. Avoid combining a custom keyboard offset with automatic avoidance on the same content.

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

## Respect reduced motion

When reduced motion is enabled, animations and effects jump to their final values and layout changes apply immediately. Gestures still follow direct manipulation. Keep per-frame calculations short; inspect the placement report when a binding falls back to JavaScript.

## Continue

See [placement](placement.md) for thread decisions and the [motion API reference](https://kuito.dev/docs/apis/motion) for options and composition helpers.
