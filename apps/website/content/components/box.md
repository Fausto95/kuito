# Box

`Box` is a container laid out like a VStack, for a view that is a surface or a shape more than a stack of children.

Use it for:

- a card with a background, a border and rounded corners;
- a progress bar's track and fill;
- a color swatch or a placeholder of a fixed size.

```tsx
import { Box } from 'kuito';

export default function Progress() {
  return (
    <Box width={280} height={4} borderRadius={2} backgroundColor="#e5e7eb">
      <Box width="40%" height={4} borderRadius={2} backgroundColor="#e5484d" />
    </Box>
  );
}
```

## Patterns

### Draw a card

```tsx
import { Box, Text } from 'kuito';

export default function Card() {
  return (
    <Box
      padding={16}
      borderRadius={12}
      backgroundColor="#ffffff"
      borderWidth={1}
      borderColor="#e5e7eb"
    >
      <Text fontWeight="bold">Low Tide</Text>
      <Text>The Shoals</Text>
    </Box>
  );
}
```

### Lay a badge over an image

`position="absolute"` takes a Box out of the flow; `top`, `right`, `bottom` and `left` place it in its parent.

```tsx
import { Box, Image, Text } from 'kuito';

export default function Cover() {
  return (
    <Box width={160} height={160}>
      <Image src="https://example.com/cover.jpg" width={160} height={160} borderRadius={8} />
      <Box
        position="absolute"
        top={8}
        right={8}
        padding={4}
        borderRadius={4}
        backgroundColor="#e5484d"
      >
        <Text color="#ffffff" fontSize={12}>
          New
        </Text>
      </Box>
    </Box>
  );
}
```

### Fill a bar from a signal

A prop that reads a signal follows it: only that prop changes when the signal does.

```tsx
import { Box, Button, VStack, signal } from 'kuito';

export default function Meter() {
  const level = signal(0.4);

  return (
    <VStack gap={12}>
      <Box height={8} backgroundColor="#e5e7eb">
        <Box height={8} width={`${level.value * 100}%`} backgroundColor="#34c759" />
      </Box>
      <Button onPress={() => (level.value = Math.min(1, level.value + 0.1))}>More</Button>
    </VStack>
  );
}
```

## Platform differences

None. A Box with only layout props gets no native view of its own, as a stack does ([flattening](../../../../docs/flattening.md)).

## Accessibility

A Box is not an element of its own to a screen reader. A Box that shows a value with no text, such as a progress bar, needs `accessible`, `role`, `label` and `aria-valuenow` to be read at all ([accessibility](../guides/accessibility.md)).

## Related

- [VStack](./vstack.md) and [HStack](./hstack.md)
- [Styles](../language/styles.md)
- [Primitives](../../../../docs/primitives.md)
