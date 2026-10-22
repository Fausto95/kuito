// The infinite feed recipe on the headless host: `npm test` in demo/ runs it.
import {
  assert,
  press,
  render,
  scroll,
  screen,
  test,
  within,
  type FetchRequest,
} from 'kuito/tests';
import Feed, { PAGE_SIZE, photoSource, type Photo } from './infinite-feed';

const CATALOG: Photo[] = Array.from({ length: 45 }, (_, index) => ({
  id: String(index),
  author: `Author ${index}`,
}));

/** Picsum's list API over CATALOG, and the pages the app asked for. */
function picsum(fail: (page: number) => boolean = () => false) {
  const pages: number[] = [];
  const answer = ({ url }: FetchRequest) => {
    const page = Number(new URL(url).searchParams.get('page'));

    pages.push(page);

    if (fail(page)) return { status: 503 };

    const photos = CATALOG.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(photos) };
  };

  return { pages, answer };
}

const modules = { Image: { prefetch: () => ({ width: 600, height: 400 }) } };

test('the first page shows each photo with its preview and credentials', async () => {
  const { pages, answer } = picsum();

  await render(<Feed />, { fetch: answer, modules });

  const photo = screen.getByRole('img', { name: 'Photo by Author 0' });

  assert.deepEqual(pages, [1]);
  assert.deepEqual(photo.props.src, photoSource({ id: '0', author: 'Author 0' }));
  assert.equal(typeof photo.props.thumbhash, 'string');
  assert.ok(within(photo.parent!).getByText('Author 0'));
});

test('the next page loads near the end, and the feed says when it is all there', async () => {
  const { pages, answer } = picsum();
  const app = await render(<Feed />, { fetch: answer, modules });

  await scroll(screen.getByText('Author 0'), { y: 100_000 });
  assert.deepEqual(pages, [1, 2]);

  await scroll(screen.getByText('Author 0'), { y: 200_000 });
  assert.deepEqual(pages, [1, 2, 3]);
  assert.ok(screen.getByText("That's every photo"));

  const prefetched = app.calls
    .filter((call) => call.module === 'Image' && call.name === 'prefetch')
    .map((call) => call.args[0]);

  assert.ok(prefetched.some((source) => JSON.stringify(source).includes('/id/40/')));
});

test('a failed page says why, and Try again loads it', async () => {
  let down = true;
  const { pages, answer } = picsum(() => down);

  await render(<Feed />, { fetch: answer, modules });
  assert.ok(screen.getByText('Could not load photos: Error: The feed answered 503'));

  down = false;
  await press(screen.getByText('Try again'));

  assert.deepEqual(pages, [1, 1]);
  assert.ok(screen.getByText('Author 0'));
  assert.equal(screen.queryByText(/Could not load/), null);
});
