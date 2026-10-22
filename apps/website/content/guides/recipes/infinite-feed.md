# Infinite feed

A list that loads a page when the reader nears the end, pulls to refresh, and shows a ThumbHash while each photo arrives.

**Use it for**

- `onReachEnd` to fetch the next page, and `refreshing` for pull to refresh.
- An image that sends a credential header, with a ThumbHash in its place until the bytes arrive.
- Prefetching the next page's first photos, and counting a row once 60% of it has been on screen.

The whole screen is [demo/recipes/infinite-feed.tsx](../../../../../demo/recipes/infinite-feed.tsx). The test answers `fetch` itself.

## Load a page, then the next

`task` runs the request. A failure is `load.error`, and Try again calls the same load. `image.prefetch` warms the cache for the next page; a failed prefetch only means a slower photo.

```tsx
import { Image, List, SafeArea, image, signal, store, task } from 'kuito';

type Photo = { id: string; author: string };

const isPhoto = (value: unknown): value is Photo =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'id') === 'string' &&
  typeof Reflect.get(value, 'author') === 'string';

const source = (photo: Photo) => ({
  uri: `https://picsum.photos/id/${photo.id}/600/400`,
  headers: { Authorization: 'Bearer recipe-token' },
});

export default function Feed() {
  const feed = store({ photos: [] as Photo[] });
  const refreshing = signal(false);
  const load = task(async ({ signal: abort }, page: number) => {
    const response = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=20`, {
      signal: abort,
    });

    if (!response.ok) throw new Error(`The feed answered ${response.status}`);

    const body: unknown = await response.json();

    if (!Array.isArray(body) || !body.every(isPhoto)) throw new Error('The feed sent no photos');

    feed.photos = page === 1 ? body : [...feed.photos, ...body];
    body.slice(0, 4).forEach((photo) => void image.prefetch(source(photo)).catch(() => {}));
  });

  return (
    <SafeArea flex={1}>
      <List
        flex={1}
        data={feed.photos}
        itemKey={(photo) => photo.id}
        renderItem={({ item }) => (
          <Image
            src={source(item)}
            thumbhash="4AcKNZqAh4dwd3d4eHh3h3CAB/eI"
            label={`Photo by ${item.author}`}
            aspectRatio={3 / 2}
            objectFit="cover"
          />
        )}
        onReachEnd={() => void load.run(1)}
        refreshing={refreshing}
        onRefresh={() => {
          refreshing.value = true;
          void load.run(1).finally(() => (refreshing.value = false));
        }}
        viewability={{ threshold: 0.6 }}
      />
    </SafeArea>
  );
}
```

The screen counts impressions from `onViewableChange` once a row's `visible` flips on.

## Related

- [Lists](../lists.md#know-which-rows-are-on-screen): viewability
- [Testing](../testing.md): a `fetch` fake
