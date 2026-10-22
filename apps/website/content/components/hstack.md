# HStack

`HStack` lays its children out in a row, with CSS flexbox's props. In a right-to-left language the row runs right to left.

Use it for:

- a row of a list: an image, a title, a value;
- a toolbar of buttons;
- a label beside its control.

```tsx
import { HStack, Text } from 'kuito';

export default function Row() {
  return (
    <HStack gap={8} alignItems="center" padding={16}>
      <Text fontWeight="bold">Night Drive</Text>
      <Text color="#8a8a96">3:42</Text>
    </HStack>
  );
}
```

## Patterns

### Push items to both ends

A `Spacer` between children takes the free space, so what follows it sits at the end of the row.

```tsx
import { Button, HStack, Spacer, Text } from 'kuito';

export default function Header() {
  return (
    <HStack padding={16} alignItems="center">
      <Text fontSize={20} fontWeight="bold">
        Library
      </Text>
      <Spacer />
      <Button onPress={() => console.log('edit')}>Edit</Button>
    </HStack>
  );
}
```

### Wrap into lines

`flexWrap="wrap"` starts a new line when the row is full; `gap` spaces both ways.

```tsx
import { HStack, Text } from 'kuito';

const tags = ['jazz', 'late night', 'piano', 'live', 'trio'];

export default function Tags() {
  return (
    <HStack flexWrap="wrap" gap={8}>
      {tags.map((tag) => (
        <Text key={tag} padding={4} borderRadius={8} backgroundColor="#eeeeff">
          {tag}
        </Text>
      ))}
    </HStack>
  );
}
```

### Keep a side's spacing in right to left

Logical sides (`paddingInlineStart`, `marginInlineEnd`) follow the row's direction, so the space stays on the reading side ([right to left](../../../../docs/styles.md#right-to-left)).

```tsx
import { HStack, Symbol, Text } from 'kuito';

export default function Back() {
  return (
    <HStack alignItems="center" paddingInlineStart={8}>
      <Symbol name={{ ios: 'chevron.left', android: 'arrow_back' }} size={17} />
      <Text marginInlineStart={4}>Back</Text>
    </HStack>
  );
}
```

## Platform differences

None: both platforms lay a stack out with the same flexbox engine, and both mirror a row in a right-to-left language.

## Accessibility

A screen reader reads an HStack's children one by one, in reading order. For a row that is one thing to the user (a title and its value), `accessible` makes it one element, read as its `label` or its children's text ([accessibility](../guides/accessibility.md)).

## Related

- [VStack](./vstack.md), the same in a column
- [Spacer](./spacer.md)
- [Styles](../language/styles.md)
