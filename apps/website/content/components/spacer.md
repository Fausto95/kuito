# Spacer

`Spacer` is an empty view that grows to take the free space along its stack (`flexGrow: 1`), pushing what follows it to the end.

Use it for:

- a title on one side of a header and an action on the other;
- a button held at the bottom of a screen;
- even space between items in a row.

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

## Patterns

### Hold a button at the bottom

In a VStack that fills the screen, a Spacer takes the height the content leaves.

```tsx
import { Button, Spacer, Text, VStack } from 'kuito';

export default function Welcome() {
  return (
    <VStack flex={1} padding={24}>
      <Text fontSize={28} fontWeight="bold">
        Welcome
      </Text>
      <Spacer />
      <Button onPress={() => console.log('start')}>Get started</Button>
    </VStack>
  );
}
```

### Spread items evenly

Spacers share the free space equally, so one between each pair spaces them evenly.

```tsx
import { HStack, Spacer, Text } from 'kuito';

export default function Stats() {
  return (
    <HStack padding={16}>
      <Text>12 plays</Text>
      <Spacer />
      <Text>4 likes</Text>
      <Spacer />
      <Text>2 shares</Text>
    </HStack>
  );
}
```

## Platform differences

None. A Spacer has no native view while it has only layout props.

## Accessibility

A screen reader skips it: it has nothing to read.

## Related

- [HStack](./hstack.md) and [VStack](./vstack.md)
- [Divider](./divider.md)
