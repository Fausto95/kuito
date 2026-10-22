# VStack

`VStack` lays its children out in a column, top to bottom, with CSS flexbox's props. Most screens are a VStack of rows.

Use it for:

- a screen or a card's content, stacked top to bottom;
- a form: labels, fields and a button with even spacing;
- centering something in the space it has.

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

## Patterns

### Center content on the screen

`flex={1}` takes the parent's height; `justifyContent` places the children along the column and `alignItems` across it.

```tsx
import { Spinner, VStack } from 'kuito';

export default function Loading() {
  return (
    <VStack flex={1} justifyContent="center" alignItems="center">
      <Spinner />
    </VStack>
  );
}
```

### Space a form evenly

`gap` spaces the children and `padding` keeps them off the edges. Neither needs a view of its own between the rows.

```tsx
import { Button, TextField, VStack, signal } from 'kuito';

export default function SignIn() {
  const email = signal('');

  return (
    <VStack padding={24} gap={12}>
      <TextField label="Email" type="email" placeholder="you@example.com" value={email} />
      <Button onPress={() => console.log(email.value)}>Continue</Button>
    </VStack>
  );
}
```

### Style it from a stylesheet

Layout and decoration also come from a `.css` import through `class`, compiled at build time ([styles](../language/styles.md)).

```tsx
import { Text, VStack } from 'kuito';
import css from './card.module.css';

export default function Card() {
  return (
    <VStack class={css.card}>
      <Text>Low Tide</Text>
    </VStack>
  );
}
```

## Platform differences

None: both platforms lay a stack out with the same flexbox engine. A stack with only layout props gets no native view of its own ([flattening](../../../../docs/flattening.md)).

## Accessibility

A VStack is not an element of its own to a screen reader, which reads its children one by one. `accessible` makes it one element, read as its `label` or its children's text ([accessibility](../guides/accessibility.md)).

## Related

- [HStack](./hstack.md), the same in a row
- [Box](./box.md), for a surface rather than a stack
- [SafeArea](./safe-area.md), a VStack clear of the system's bars
- [Primitives](../../../../docs/primitives.md)
