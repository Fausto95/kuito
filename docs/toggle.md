# Toggle

Choose an on/off setting. Use it for preferences that take effect immediately.

## Store a Wi-Fi-only preference in state

```tsx
import { HStack, Text, Toggle, signal } from 'kuito';

export default function Downloads() {
  const wifiOnly = signal(true);

  return (
    <HStack gap={12} alignItems="center" padding={16}>
      <Text>Download on Wi-Fi only</Text>
      <Toggle label="Download on Wi-Fi only" checked={wifiOnly} />
    </HStack>
  );
}
```

## Behavior

Pass the boolean signal through `checked` for two-way updates. Keep the label specific to the setting. Use a Button for an action and SegmentedControl for several mutually exclusive options.

## Continue

Read [Reactivity](reactivity.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Toggle#members) for types and documented defaults.
