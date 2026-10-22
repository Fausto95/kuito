# Lists

`List` is a list virtualized by the platform: a `UICollectionView` on iOS and a `RecyclerView` on Android own scrolling and recycling, and JavaScript renders a row only when the list asks for it.

**Use it for**

- Feeds, catalogs and search results of any length.
- Chats and logs that start at the end.
- Grids and sectioned lists with sticky headers.

```tsx
import { Divider, List, Text, signal } from 'kuito';

type Track = { id: string; title: string };

export default function Tracks() {
  const tracks = signal<Track[]>(
    Array.from({ length: 50 }, (_, i) => ({ id: String(i), title: `Track ${i + 1}` })),
  );

  return (
    <List
      data={tracks}
      itemKey={(track) => track.id}
      renderItem={({ item, index }) => (
        <Text padding={16}>{`${index.value + 1}. ${item.title}`}</Text>
      )}
      separator={Divider}
      empty={<Text>No tracks yet</Text>}
      onReachEnd={() => {
        const next = tracks.value.length;
        tracks.value = [...tracks.value, { id: String(next), title: `Track ${next + 1}` }];
      }}
    />
  );
}
```

- `renderItem` gets `{ item, index, visible }`. `index` and `visible` are signals: read `.value`.
- `itemKey` gives each item a unique key; without it, `item.key`, then `item.id`, then the index.
- When `data` changes, only rows whose item changed render again; the others keep their cells.
- `onReachEnd` fires once per row count, near the end of the content, not again until rows are added.
- Rows measure themselves: there is no `getItemLayout`. `estimatedItemSize` sizes rows not measured yet.

## Update one row with a store

Over a [store](./reactivity.md#share-data-with-a-store) array, a field write reaches the one binding that reads it: one prop on one cell, no row rendered again. After `push`, `splice` or `sort`, rows keep their cells and move with their items.

```tsx
import { List, Pressable, Text, store } from 'kuito';

const shelf = store({
  books: [
    { id: 1, title: 'Dune', liked: false },
    { id: 2, title: 'Solaris', liked: false },
  ],
});

export function Shelf() {
  return (
    <List
      data={shelf.books}
      renderItem={({ item }) => (
        <Pressable onPress={() => (item.liked = !item.liked)} padding={16}>
          <Text>{`${item.liked ? '♥' : '♡'} ${item.title}`}</Text>
        </Pressable>
      )}
    />
  );
}
```

## Know which rows are on screen

`visible` is true while the row is on screen, by `viewability`'s threshold: the fraction of the row that must show, 0 by default. Start a video or a fetch while it is, and stop when it leaves. `onViewableChange` reports the same rows to the list's owner: `viewableItems`, and `changed` with the rows that entered or left.

```tsx
import { HStack, List, Spinner, Text } from 'kuito';

const episodes = Array.from({ length: 30 }, (_, i) => ({ id: i, title: `Episode ${i + 1}` }));

export function Episodes() {
  return (
    <List
      data={episodes}
      viewability={{ threshold: 0.5 }}
      onViewableChange={({ changed }) =>
        changed.forEach((row) => console.log(row.key, row.visible ? 'shown' : 'hidden'))
      }
      renderItem={({ item, visible }) => (
        <HStack padding={16} gap={8}>
          <Text>{item.title}</Text>
          <Spinner animating={visible.value} />
        </HStack>
      )}
    />
  );
}
```

The native list reports visibility only once `onViewableChange` is set or a row reads `visible`.

## Scroll to an item

A `ref` to a List holds a `ListHandle`. `scrollToIndex` and `scrollToItem` take `align` (0 at the start, 0.5 centered, 1 at the end) and `margin`, points kept before the item; both animate by default. `initialIndex` opens the list on an item.

```tsx
import { Button, List, Text, VStack, ref, type ListHandle } from 'kuito';

const days = Array.from({ length: 365 }, (_, i) => ({ id: i, label: `Day ${i + 1}` }));

export function Calendar() {
  const list = ref<ListHandle>();

  return (
    <VStack flex={1}>
      <Button onPress={() => list.current?.scrollToIndex({ index: 180, align: 0.5 })}>
        Jump to day 181
      </Button>
      <List
        ref={list}
        data={days}
        initialIndex={30}
        renderItem={({ item }) => <Text padding={12}>{item.label}</Text>}
      />
    </VStack>
  );
}
```

The handle also has a Scroll's `scrollTo` and `scrollToEnd`.

## Group rows into sections

`sectionKey` names each item's section; each run of items with the same section gets a header row that `renderSection` renders. `stickySections` keeps a section's header at the top while its rows scroll under it.

```tsx
import { List, Text } from 'kuito';

const songs = [
  { id: 1, album: 'Blue', title: 'All I Want' },
  { id: 2, album: 'Blue', title: 'River' },
  { id: 3, album: 'Hejira', title: 'Coyote' },
];

export function Songs() {
  return (
    <List
      data={songs}
      sectionKey={(song) => song.album}
      renderSection={({ section }) => (
        <Text fontWeight="bold" padding={8}>
          {section}
        </Text>
      )}
      stickySections
      renderItem={({ item }) => <Text padding={12}>{item.title}</Text>}
    />
  );
}
```

A section's items must be next to each other in `data`. Sticky headers need a vertical list that is not inverted. `columns` lays rows out in a grid, and section headers span it.

## Short lists: `For`

A few dozen rows inside a `Scroll` need no virtualization: use [`For`](../language/control-flow.md#for). It renders every row, keyed by item, and a reorder moves the rows' views.

## Keyboard

A vertical List insets its content by the part the keyboard covers, and scrolls a focused input in a row above it, with no wrapper. `keyboard={{ dismiss: 'on-drag' }}` hides the keyboard when the user scrolls ([Keyboard](./keyboard.md)).

## Related

- [Motion](./motion.md#follow-a-scroll): effects that follow a List's scroll
- [Control flow](../language/control-flow.md#for): `For` for short lists
- [Lists in depth](../../../../docs/lists.md): how cells are bound, how keys cross as edits, the host protocol
