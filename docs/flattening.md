# Layout without extra native views

Kuito automatically omits native objects for containers used only for layout. Their layout nodes remain, so spacing and flex behavior are preserved. Use this page to understand why a layout wrapper is absent from a native inspector.

## A layout-only wrapper

```tsx
import { Text, VStack } from 'kuito';

export function Summary() {
  return (
    <VStack padding={16} gap={8}>
      <Text>Order ready</Text>
      <Text>Collect at the counter</Text>
    </VStack>
  );
}
```

The stack can be flattened: its labels become children of the nearest native ancestor, offset by the stack's layout position. The wrapper still exists in the logical and layout trees.

## What requires a view

Only plain `VStack`, `HStack`, `Box` and `Spacer` containers are candidates. Every supplied prop must be layout-only, and the node must have no handler, ref, animation or UI-thread motion binding. Paint, accessibility and interaction props require a native object.

Eligibility depends on prop keys, not their current values. A conditional `backgroundColor` keeps a native object even when its current value is null. This avoids creating and destroying views whenever the condition changes.

## Promotion and demotion

The runtime decides flattening during commit and sends a `Flatten` operation when eligibility changes. The renderer reparents descendant views, preserves order and adjusts their frames. The layout node remains stable throughout.

For a renderer change, test a flattened wrapper inside a scroll host, a keyed child move, and promotion caused by adding a visual prop. Hit testing and accessibility must still reach the same logical targets. There is no public `collapsable` switch to maintain.
