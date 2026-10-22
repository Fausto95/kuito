# Spacer

Consume free space in a stack. Use it to separate a title from trailing actions.

## Push an action to the trailing edge

```tsx
import { HStack, Spacer, Text } from 'kuito';

export default function Header() {
  return (
    <HStack padding={16}>
      <Text>Library</Text>
      <Spacer />
      <Text>Edit</Text>
    </HStack>
  );
}
```

## Behavior

A spacer needs free room in its parent to grow. It follows the parent stack axis. Use `gap` or padding for a fixed amount of spacing.

## Continue

Read [Primitives](primitives.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Spacer#members) for types and documented defaults.
