// Warm the image cache.
import { Image, List, image } from 'kuito';

type Show = { id: number; poster: string };

// Warm the cache for the first screen of posters before the feed shows them.
async function warm(shows: Show[]) {
  await Promise.all(shows.slice(0, 6).map((show) => image.prefetch(show.poster)));
}

function Feed(props: { shows: Show[] }) {
  return (
    <List
      data={props.shows}
      renderItem={({ item }) => <Image src={item.poster} width={120} height={180} />}
    />
  );
}
