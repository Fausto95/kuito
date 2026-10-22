# Fragment

`Fragment` groups children with no view of its own: they join the Fragment's parent as if written there. `<>…</>` is the same thing; write `Fragment` to give it a `key`.

Use it for:

- returning several views from a component;
- rendering two views per item of a list, with a key;
- a component that adds a SystemBars or a Sheet beside its content.

```tsx
import { Fragment, Text, VStack } from 'kuito';

const albums = [
  { id: 'a1', title: 'Night Drive', artist: 'Ada Ray' },
  { id: 'a2', title: 'Low Tide', artist: 'The Shoals' },
];

export default function Albums() {
  return (
    <VStack gap={4}>
      {albums.map((album) => (
        <Fragment key={album.id}>
          <Text fontWeight="bold">{album.title}</Text>
          <Text>{album.artist}</Text>
        </Fragment>
      ))}
    </VStack>
  );
}
```

## Patterns

### Return several views from a component

```tsx
import { Divider, Text } from 'kuito';

export function Section(props: { title: string }) {
  return (
    <>
      <Text fontWeight="bold" padding={16}>
        {props.title}
      </Text>
      <Divider />
    </>
  );
}
```

### Declare the system bars beside a screen

```tsx
import { SystemBars, Text, VStack } from 'kuito';

export default function Player() {
  return (
    <>
      <SystemBars statusBar={{ content: 'light' }} backgroundColor="#101014" />
      <VStack flex={1} backgroundColor="#101014">
        <Text color="#ffffff">Now playing</Text>
      </VStack>
    </>
  );
}
```

## Platform differences

None: a Fragment never reaches the platform.

## Related

- [For](./for.md), for a row per item with keys of its own
- [Control flow](../language/control-flow.md)
