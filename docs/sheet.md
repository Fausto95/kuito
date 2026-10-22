# Sheet

Present contextual content over the current screen. Use it for filters, a queue or a lightweight editor.

## Open and close a queue

```tsx
import { Button, Sheet, Text, VStack, signal } from 'kuito';

export default function Player() {
  const queueOpen = signal(false);

  return (
    <VStack flex={1} padding={16}>
      <Button onPress={() => (queueOpen.value = true)}>Up next</Button>
      <Sheet open={queueOpen.value} onClose={() => (queueOpen.value = false)} padding={24}>
        <Text>Up next</Text>
      </Sheet>
    </VStack>
  );
}
```

## Behavior

Keep the open state synchronized with native dismissal through a signal or `onClose`. `snapPoints` defines permitted heights. Use a presented route when the sheet is a navigable screen or must return a typed result.

## Continue

Read [Navigation](navigation.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Sheet#members) for types and documented defaults.
