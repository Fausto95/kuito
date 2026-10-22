# Slider

`Slider` picks a number in a range by dragging a thumb along a track: `UISlider` on iOS, `SeekBar` on Android. Given a signal as `value`, it writes it as the user drags.

Use it for:

- a level the app applies while the finger moves: a volume, a brightness;
- a setting saved once the user lets go: a playback speed;
- a choice among evenly spaced values: a rating from 1 to 5.

```tsx
import { Slider, Text, VStack, signal } from 'kuito';

export default function Volume() {
  const volume = signal(0.5);

  return (
    <VStack gap={8} padding={16}>
      <Slider label="Volume" value={volume} height={40} />
      <Text>{Math.round(volume.value * 100) + '%'}</Text>
    </VStack>
  );
}
```

A Slider is a [native view](../../../../docs/native-modules.md#views) with no size of its own: give it a `height`, and a `width` or let it stretch. Its module is linked only into apps that use it.

## Patterns

### Snap to steps

`step` snaps the user's values to `min` plus multiples of `step`. Choose a `step` that divides `max - min`, so both platforms land on the same values.

```tsx
import { Slider, Text, VStack, signal } from 'kuito';

export default function Rating() {
  const stars = signal(3);

  return (
    <VStack gap={8}>
      <Slider label="Rating" value={stars} min={1} max={5} step={1} height={40} />
      <Text>{stars.value + ' of 5 stars'}</Text>
    </VStack>
  );
}
```

### Save when the user lets go

`onChange` fires while the finger moves; `onChangeEnd` once when it lifts, for work too costly for every move. It follows the touch: a change a screen reader makes sends `onChange` alone, so work that must not miss it reads a bound signal instead.

```tsx
import { Slider, storage } from 'kuito';

export default function Speed() {
  return (
    <Slider
      label="Playback speed"
      value={Number(storage.peek('speed') ?? '1')}
      min={0.5}
      max={2}
      step={0.25}
      height={40}
      onChangeEnd={(event) => void storage.set('speed', String(event.value))}
    />
  );
}
```

### Color the track

```tsx
import { Slider } from 'kuito';

export default function Brightness() {
  return (
    <Slider label="Brightness" value={0.8} fillColor="#f5b301" trackColor="#e5e7eb" height={40} />
  );
}
```

## Platform differences

|              | iOS                              | Android                                   |
| ------------ | -------------------------------- | ----------------------------------------- |
| Free sliding | Continuous, at `Float` precision | Thousandths of the range                  |
| `fillColor`  | The track before the thumb       | The track before the thumb, and the thumb |

On iOS every value crosses as a `Float`: `0.3` arrives as `0.30000001192…`. Round it for display.

## Accessibility

VoiceOver treats it as adjustable (swipe up or down to change it), and TalkBack reads its position and changes it with its scroll actions. The thumb has no text of its own: give the slider a `label`.

## Related

- [Slider in depth](../../../../docs/slider.md)
- [Two-way props](../../../../docs/events.md#two-way-props)
- [SegmentedControl](./segmented-control.md), for a few named choices
- [Video](./video.md), whose `time` a slider can seek
