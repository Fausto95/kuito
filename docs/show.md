# Show

Mount content while a condition is truthy. Use it for expanded details, signed-in content and optional panels.

## Toggle a details panel

```tsx
import { Button, Show, Text, VStack, signal } from 'kuito';

export default function Details() {
  const open = signal(false);

  return (
    <VStack padding={16} gap={8}>
      <Button onPress={() => (open.value = !open.value)}>Details</Button>
      <Show when={open.value}>
        <Text>Recorded live in 2019.</Text>
      </Show>
    </VStack>
  );
}
```

## Behavior

`fallback` displays when the condition is false. A callback child receives the truthy value. Changing branches disposes the previous branch, including its state and lifecycle work.

## Continue

Read [Control flow](control-flow.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Show#members) for types and documented defaults.
