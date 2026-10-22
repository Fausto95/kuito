# Load a paginated feed

Use a virtualized `List` for growing data, stable item keys for row identity, and a guarded task for page requests. Refresh replaces the first page; reaching the end appends the next page.

## Fetch, append and retry

```tsx
import { Button, List, SafeArea, Text, onMount, signal, task } from 'kuito';

type Item = { id: string; title: string };
const isItem = (value: unknown): value is Item =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'id') === 'string' &&
  typeof Reflect.get(value, 'title') === 'string';

export default function Feed() {
  const items = signal<Item[]>([]);
  const nextPage = signal(1);
  const hasMore = signal(true);
  const refreshing = signal(false);
  const load = task(
    async ({ signal: abort }, page: number) => {
      // Endpoint contract: an Item[] page; an empty page means the end.
      const response = await fetch(`https://example.com/feed?page=${page}`, { signal: abort });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || !rows.every(isItem)) throw new Error('Invalid feed response');
      const combined = page === 1 ? rows : [...items.value, ...rows];
      items.value = [...new Map(combined.map((item) => [item.id, item])).values()];
      nextPage.value = page + 1;
      hasMore.value = rows.length > 0;
    },
    { policy: 'drop' },
  );

  function more() {
    if (!load.running.value && hasMore.value) void load.run(nextPage.value).catch(() => {});
  }
  function refresh() {
    if (load.running.value) return;
    refreshing.value = true;
    void load
      .run(1)
      .catch(() => {})
      .finally(() => {
        refreshing.value = false;
      });
  }
  onMount(more);

  return (
    <SafeArea flex={1}>
      <List
        flex={1}
        data={items.value}
        itemKey={(item) => item.id}
        renderItem={({ item }) => <Text padding={16}>{item.title}</Text>}
        onReachEnd={more}
        refreshing={refreshing}
        onRefresh={refresh}
      />
      <Text>
        {load.running.value ? 'Loading…' : load.error.value ? 'Could not load the feed.' : ''}
      </Text>
      <Button
        disabled={load.running.value}
        onPress={() => void load.run(nextPage.value).catch(() => {})}
      >
        Retry / load more
      </Button>
    </SafeArea>
  );
}
```

Replace the example URL and adapt the pagination contract to your server. The page advances only after a successful response. Repeated reach-end events cannot overlap requests. Existing rows remain visible on failure and stable IDs remove duplicate records across pages.

For cursor APIs, store the server's next cursor instead of a page number. See [lists](lists.md), [async actions](async.md) and [images](image.md) for cached thumbnails and placeholders.
