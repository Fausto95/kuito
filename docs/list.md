# List

Render a large collection with native scrolling and recycled cells. Use it for feeds, catalogs, grids and chat histories.

## Render 500 tracks

```tsx
import { Divider, List, Text } from 'kuito';

const tracks = Array.from({ length: 500 }, (_, index) => ({
  id: String(index),
  title: `Track ${index + 1}`,
}));

export default function Tracks() {
  return (
    <List
      flex={1}
      data={tracks}
      itemKey={(track) => track.id}
      renderItem={({ item }) => <Text padding={16}>{item.title}</Text>}
      separator={Divider}
      empty={<Text>No tracks yet</Text>}
    />
  );
}
```

## Behavior

Provide a stable `itemKey`. `renderItem` receives the item plus reactive `index` and `visible` values. Use `empty`, `separator`, header and footer slots for surrounding content. Avoid putting a vertical list inside another vertical scroll view.

## Continue

Read [Lists](lists.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/List#members) for types and documented defaults.
