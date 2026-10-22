import {
  Button,
  Image,
  List,
  Match,
  SafeArea,
  Spinner,
  Switch,
  Text,
  VStack,
  image,
  onMount,
  signal,
  store,
  task,
} from 'kuito';

/**
 * An endless photo feed over Picsum's list API: a page at a time as the
 * list nears its end, pull to refresh, a ThumbHash preview while each photo
 * loads, the next page's first photos prefetched, and impressions counted
 * once a row is mostly on screen.
 */
export type Photo = { id: string; author: string };

export const PAGE_SIZE = 20;

const API = 'https://picsum.photos/v2/list';
// A private CDN wants the API's credentials on image requests too; Picsum ignores them.
const HEADERS = { Authorization: 'Bearer recipe-token' };
// Your server sends each photo's own ThumbHash; Picsum sends none, so two stand in.
const THUMBHASHES = ['4AcKNZqAh4dwd3d4eHh3h3CAB/eI', 'IAiGG4ongoqAeoiCgCj4dwd4h3iFiHc='];
const PREFETCHED = 4;

export const photoSource = (photo: Photo) => ({
  uri: `https://picsum.photos/id/${photo.id}/600/400`,
  headers: HEADERS,
});

const isPhoto = (value: unknown): value is Photo =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'id') === 'string' &&
  typeof Reflect.get(value, 'author') === 'string';

async function fetchPage(page: number, signal: AbortSignal): Promise<Photo[]> {
  const response = await fetch(`${API}?page=${page}&limit=${PAGE_SIZE}`, {
    headers: HEADERS,
    signal,
  });

  if (!response.ok) throw new Error(`The feed answered ${response.status}`);

  const body: unknown = await response.json();

  if (!Array.isArray(body) || !body.every(isPhoto)) throw new Error('The feed sent no photos');

  return body;
}

export default function Feed() {
  const feed = store({ photos: [] as Photo[] });
  const nextPage = signal(1);
  const ended = signal(false);
  const refreshing = signal(false);
  const seen = new Set<string>();
  const impressions = signal(0);

  const load = task(async ({ signal }, page: number) => {
    const photos = await fetchPage(page, signal);

    if (page === 1) feed.photos = photos;
    else feed.photos.push(...photos);

    nextPage.value = page + 1;
    ended.value = photos.length < PAGE_SIZE;

    // Cached before the user scrolls to them; a failed prefetch only means a slower photo.
    photos
      .slice(0, PREFETCHED)
      .forEach((photo) => void image.prefetch(photoSource(photo)).catch(() => {}));
  });

  // The task's `error` signal shows a failure; the caught promise only keeps it handled.
  const loadPage = (page: number) => load.run(page).catch(() => {});

  const loadMore = () => {
    if (!load.running.value && !ended.value) void loadPage(nextPage.value);
  };

  onMount(() => void loadPage(1));

  const Footer = () => (
    <VStack padding={24} alignItems="center" gap={8}>
      <Switch>
        <Match when={load.running.value}>
          <Spinner />
        </Match>
        <Match when={load.error.value}>
          <Text color="#c4302b">{`Could not load photos: ${String(load.error.value)}`}</Text>
          <Button onPress={loadMore}>Try again</Button>
        </Match>
        <Match when={ended.value}>
          <Text color="#8e8e93">That's every photo</Text>
        </Match>
      </Switch>
    </VStack>
  );

  return (
    <SafeArea flex={1} backgroundColor="#ffffff">
      <Text padding={16} fontSize={13} color="#8e8e93">{`${impressions.value} photos seen`}</Text>
      <List
        flex={1}
        data={feed.photos}
        itemKey={(photo) => photo.id}
        renderItem={({ item }) => (
          <VStack gap={6} padding={16}>
            <Image
              src={photoSource(item)}
              thumbhash={THUMBHASHES[Number(item.id) % THUMBHASHES.length]}
              label={`Photo by ${item.author}`}
              aspectRatio={3 / 2}
              borderRadius={12}
              objectFit="cover"
              fadeDuration={200}
            />
            <Text fontSize={15}>{item.author}</Text>
          </VStack>
        )}
        footer={Footer}
        onReachEnd={loadMore}
        refreshing={refreshing}
        onRefresh={() => {
          refreshing.value = true;
          void loadPage(1).finally(() => (refreshing.value = false));
        }}
        // A row counts as seen once 60% of it has been on screen.
        viewability={{ threshold: 0.6 }}
        onViewableChange={({ changed }) => {
          changed
            .filter(({ visible, key }) => visible && !seen.has(key))
            .forEach(({ key }) => seen.add(key));

          impressions.value = seen.size;
        }}
      />
    </SafeArea>
  );
}
