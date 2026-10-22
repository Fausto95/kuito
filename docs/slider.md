# Slider

Select a number along a range. Use it for volume, brightness and continuous adjustments.

## Adjust volume and show its percentage

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

## Behavior

Bind `value` to a number signal. Set `min`, `max` and `step` for your domain. The UI can follow changes continuously; defer expensive work until the relevant completion callback when appropriate.

## Continue

Read [Reactivity](reactivity.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Slider#members) for types and documented defaults.
