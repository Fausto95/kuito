# VStack

Arrange children vertically. Use it for forms, cards and screen sections.

## Stack a title and subtitle

```tsx
import { Text, VStack } from 'kuito';

export default function Track() {
  return (
    <VStack padding={16} gap={4}>
      <Text fontWeight="bold">Night Drive</Text>
      <Text>Ada Ray</Text>
    </VStack>
  );
}
```

## Behavior

Use `gap` for space between children and `padding` for space inside the stack. `justifyContent` controls the vertical axis; `alignItems` controls the horizontal axis. Use `flex={1}` when the stack should fill available space.

## Continue

Read [Primitives](primitives.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/VStack#members) for types and documented defaults.
