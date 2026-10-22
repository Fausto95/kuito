# Fragment

Group siblings without creating another native view. Use it when a component returns several adjacent elements.

## Return a title and artist together

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

## Behavior

The shorthand `<>...</>` works when a key is unnecessary. Use the explicit component to provide a key. A fragment cannot supply layout, padding or a background; use a stack or Box for those.

## Continue

Read [Primitives](primitives.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Fragment#members) for types and documented defaults.
