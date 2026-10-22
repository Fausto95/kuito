# Build a feed or collection

Use List for content that needs native cell recycling. Use Scroll with For when a small set of children can all stay mounted.

## Render rows and handle an empty collection

Give each item a stable key. The example appends another item when the end is reached; replace that handler with a task that loads your next page. onReachEnd fires once per row count, so append results before expecting another end event.

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

## Update a single item

A store array tracks individual fields. A row can change its own item without rebuilding unrelated rows. Mutate through the store, and preserve object identities when moving items.

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

## Start work only for visible rows

Each row receives index and visible signals. Use visibility to start media or prefetch data and stop it when a row leaves. viewability.threshold is the fraction that must be visible. The callback reports entered and exited rows.

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

## Jump to an item

Use a ListHandle from an event handler to scroll. align runs from 0 at the start to 1 at the end; margin reserves extra room. initialIndex chooses the starting item. Do not depend on a List ref being assigned in the parent’s onMount.

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

## Group sections or make a grid

Keep each section’s items adjacent in data. sectionKey and renderSection add headers; stickySections pins them in a vertical, non-inverted list. columns creates a grid. Rows measure themselves; estimatedItemSize helps size unseen content.

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

## Continue

Use [async tasks](async.md) for pagination and refresh, [keyboard avoidance](keyboard.md) for editable rows, and [scroll motion](motion.md) for effects that follow the feed.
