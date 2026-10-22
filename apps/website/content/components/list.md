# List

`List` is a list virtualized by the platform: a `UICollectionView` on iOS and a `RecyclerView` on Android own scrolling and recycling, and JavaScript renders only the rows near the screen.

Use it for:

- a feed, an inbox, a library of hundreds or thousands of items;
- a grid of photos;
- a list with sections and sticky headers.

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

A row's component state belongs to its item and starts fresh when its cell shows another item. A few dozen rows in a `Scroll` are simpler with [For](./for.md).

## Patterns

### Load more at the end

`onReachEnd` fires once each time the end comes within `reachEndThreshold` visible lengths (0.5 by default), and again once more rows arrive.

```tsx
import { List, Spinner, Text, task, signal } from 'kuito';

type Post = { id: string; title: string };

export default function Feed(props: { page: (after: number) => Promise<Post[]> }) {
  const posts = signal<Post[]>([]);
  const more = task(async () => {
    posts.value = [...posts.value, ...(await props.page(posts.value.length))];
  });

  return (
    <List
      flex={1}
      data={posts}
      renderItem={({ item }) => <Text padding={16}>{item.title}</Text>}
      onReachEnd={() => void more.run()}
      footer={more.running.value ? <Spinner /> : null}
    />
  );
}
```

### Lay items out in a grid

`columns` lays items out in columns; `gap` spaces rows and columns.

```tsx
import { Image, List } from 'kuito';

const photos = Array.from({ length: 120 }, (_, index) => `https://example.com/photos/${index}.jpg`);

export default function Photos() {
  return (
    <List
      flex={1}
      data={photos}
      itemKey={(uri) => uri}
      columns={3}
      gap={2}
      renderItem={({ item }) => <Image src={item} aspectRatio={1} />}
    />
  );
}
```

### Update one row from a store

Over a [store](../guides/reactivity.md) array, a field write is one prop write on that row's cell: no row renders again.

```tsx
import { List, Pressable, Text, store } from 'kuito';

const shelf = store({ books: [{ id: 'b1', title: 'Low Tide', liked: false }] });

export default function Books() {
  return (
    <List
      flex={1}
      data={shelf.books}
      renderItem={({ item }) => (
        <Pressable padding={16} onPress={() => (item.liked = !item.liked)}>
          <Text>{(item.liked ? '♥ ' : '') + item.title}</Text>
        </Pressable>
      )}
    />
  );
}
```

### Scroll to an item

A ref (`ref<ListHandle>()`) has `scrollToIndex`, `scrollToItem`, `scrollTo` and `scrollToEnd`. `align` places the item: 0 at the start, 0.5 in the middle, 1 at the end.

```tsx
import { Button, List, Text, VStack, ref, type ListHandle } from 'kuito';

const days = Array.from({ length: 365 }, (_, index) => ({
  id: String(index),
  label: `Day ${index + 1}`,
}));

export default function Calendar() {
  const list = ref<ListHandle>();

  return (
    <VStack flex={1}>
      <Button onPress={() => list.current?.scrollToIndex({ index: 180, align: 0.5 })}>
        Mid-year
      </Button>
      <List
        ref={list}
        flex={1}
        data={days}
        renderItem={({ item }) => <Text padding={12}>{item.label}</Text>}
      />
    </VStack>
  );
}
```

## Platform differences

None in what it takes: both platforms recycle cells, animate data changes as inserts, removals and moves, and measure rows with the same layout engine.

## Accessibility

Screen readers scroll the list with their own gestures and read its rows as the native list presents them. Each row's views take the accessibility props as anywhere else.

## Related

- [Lists](../guides/lists.md): how rows, keys and sections work
- [For](./for.md), for short lists
- [Scroll](./scroll.md)
