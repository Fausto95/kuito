# Slider

Picks a number in a range by dragging a thumb along a track: UISlider on
iOS, SeekBar on Android. It suits a value the user tunes by feel and sees
the effect of as they go (a volume, a brightness, a playback speed); a
number the user must enter exactly belongs in a `TextField`.

Use it for:

- a level the app applies while the finger moves (volume, opacity, zoom);
- a setting saved once the user lets go (a playback rate, a font size);
- a choice among evenly spaced values (a rating from 1 to 5, a step of 5%).

```tsx
import { HStack, signal, Slider, Text, VStack } from 'kuito';

function Volume() {
  const volume = signal(0.5);

  return (
    <VStack gap={8}>
      <HStack gap={12}>
        <Text width={64}>Volume</Text>
        <Slider label="Volume" value={volume} flex={1} height={40} />
      </HStack>
      <Text>{Math.round(volume.value * 100) + '%'}</Text>
    </VStack>
  );
}
```

A `Slider` is a [native view](native-modules.md#views): it takes style,
layout and accessibility props, and like any module's view it has no size of
its own. Give it a `height` (and a `width`, or let it stretch). Its module is
linked only into apps that use it.

## Props

| Prop          | Default  | Notes                                                                             |
| ------------- | -------- | --------------------------------------------------------------------------------- |
| `value`       | `0`      | The thumb's position; a signal is written as the user drags                       |
| `min`         | `0`      | The value at the start of the track                                               |
| `max`         | `1`      | The value at the end of the track                                                 |
| `step`        | `0`      | The user's values snap to `min` plus multiples of `step`; 0 slides freely         |
| `disabled`    | `false`  | Shows the value and takes no touch                                                |
| `fillColor`   | platform | The track before the thumb, a hex color (`#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa`) |
| `trackColor`  | platform | The track after the thumb, a hex color                                            |
| `onChange`    | none     | `(value) => …`: the value, each time it moves under the finger                    |
| `onChangeEnd` | none     | `(event) => …`: when the user lets go, the value as `event.value`                 |

A `value` outside `min`…`max` shows the thumb at the nearer end and leaves
the value as it is until the user drags. New `min`, `max` or `step` keep
the value chosen last, by the app or by the user, and place the thumb for
it on the new track. A color that is not CSS hex fails as the prop's
`unsupportedValue` error. Both events come from the
user only: the app's own `value` sends none, and a signal the slider wrote
is not sent back to it ([events](events.md#two-way-props)). The props come
from `SliderProps` (`src/native/slider.ts`); the events are the module's
`change` and `changeEnd` (`native/modules/slider/slider.ts`).

## Patterns

### Bound to a signal

A signal passed as `value` is two-way: the slider writes it as the thumb
moves, and a write from the app moves the thumb. Everything that reads the
signal follows the drag; nothing else re-renders.

```tsx
import { Box, Button, signal, Slider, VStack } from 'kuito';

function Dimmer() {
  const level = signal(0.8);

  return (
    <VStack gap={12}>
      <Box height={80} backgroundColor="#f5c518" opacity={level.value} />
      <Slider label="Brightness" value={level} height={40} />
      <Button
        onPress={() => {
          level.value = 1;
        }}
      >
        Full brightness
      </Button>
    </VStack>
  );
}
```

### Stepped values

`step` snaps the values the user picks to `min` plus multiples of `step`.
Choose a `step` that divides `max - min`: Android divides the track into
`round((max - min) / step)` equal steps, so another `step` lands on values
iOS does not.

```tsx
import { signal, Slider, Text, VStack } from 'kuito';

function Rating() {
  const stars = signal(3);

  return (
    <VStack gap={8}>
      <Slider label="Rating" value={stars} min={1} max={5} step={1} height={40} />
      <Text>{stars.value + ' of 5 stars'}</Text>
    </VStack>
  );
}
```

### Live or on release

`onChange` fires while the finger moves, which suits what the user watches
change. `onChangeEnd` fires once when the finger lifts, which suits work too
costly for every move: saving a setting, a network request, seeking a video.
It follows the touch, so it fires on a lift even when the value did not
move, and a change a screen reader makes, with no touch, sends `onChange`
alone. Work that must not miss those reads the bound signal instead.

```tsx
import { signal, Slider, storage, Text, VStack } from 'kuito';

function Speed() {
  const speed = signal(Number(storage.peek('speed') ?? '1'));

  return (
    <VStack gap={8}>
      <Text>{speed.value.toFixed(2) + '×'}</Text>
      <Slider
        label="Playback speed"
        value={speed}
        min={0.5}
        max={2}
        step={0.25}
        height={40}
        onChangeEnd={(event) => void storage.set('speed', String(event.value))}
      />
    </VStack>
  );
}
```

## Platforms

|                    | iOS                                                    | Android                                     |
| ------------------ | ------------------------------------------------------ | ------------------------------------------- |
| View               | `UISlider`                                             | `SeekBar`                                   |
| Free sliding       | Continuous, at `Float` precision                       | Thousandths of the range                    |
| `step` and `value` | The app's `value` shows where it is, between steps too | The app's `value` shows at the nearest step |
| `onChange`         | On every move; with a `step` it can repeat a value     | Once per position the thumb reaches         |
| `fillColor`        | The track before the thumb                             | The track before the thumb, and the thumb   |

On iOS every value crosses as a `Float`, stepped ones too: `0.3` arrives as
`0.30000001192…`. Round it for display, as the examples do.

## Accessibility

Each platform's control keeps its own screen reader behavior: VoiceOver
treats a UISlider as adjustable (swipe up or down to change it), and
TalkBack reads a SeekBar's position and changes it with its scroll actions.
Give the slider a `label`, as the examples do: the thumb has no text of its
own to read. The [accessibility](accessibility.md) props apply as on any
view.

## Tests

The [headless host](testing.md) has no interaction that drives a Slider
yet, and gives it no role of its own (unlike a [Select](select.md#tests)):
test the code its handlers call. A Slider given `role="slider"` is found by
`getByRole('slider', { name })`.
