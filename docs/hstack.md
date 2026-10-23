# HStack

Arrange children horizontally. Use it for toolbars, settings rows and compact summaries.

## Place a duration beside a track title

```tsx
import { HStack, Text } from 'kuito';

export default function Track() {
  return (
    <HStack gap={8} alignItems="center" padding={16}>
      <Text fontWeight="bold">Night Drive</Text>
      <Text color="#8a8a96">3:42</Text>
    </HStack>
  );
}
```

## Behavior

`gap` separates siblings. `alignItems="center"` vertically aligns differently sized children. Add `Spacer` to push trailing content to the far edge. Rows follow the inherited layout direction.

## Continue

Read [Primitives](primitives.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/HStack#members) for types and documented defaults.
