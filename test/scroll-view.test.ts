import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import {
  flushed,
  installKernel,
  type Props,
  type Ref,
  type Signal,
  type KuitoElement,
} from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function make() {
  const views = new Map<string, { kind: string; props: Props }>();
  const removed: string[] = [];
  const sent: { id: string; name: string; value: unknown }[] = [];
  const logs: [string, string][] = [];
  const host = installKernel(
    hosting({
      __kuitoHostLog(level: string, message: string) {
        logs.push([level, message]);
      },
      createView(id: string, kind: string) {
        views.set(id, { kind, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
        sent.push({ id, name, value });
      },
      removeView(id: string) {
        views.delete(id);
        removed.push(id);
      },
    }),
  );

  return { views, removed, sent, logs, jsx: host.__kuitoJSX, kuito: host.__kuito };
}

test('a horizontal Scroll is its own native kind, and switching axis remounts it', async () => {
  const { jsx, kuito, views, removed } = make();
  let horizontal!: Signal<boolean>;

  kuito.patch('rail', (api) => {
    horizontal = api.state('horizontal', true);

    api.render(
      jsx('Scroll', { id: 'rail', horizontal: () => horizontal.value }, jsx('Text', { text: 'a' })),
    );
  });

  const rail = present(views.get('rail'), 'rail');

  assert.equal(rail.kind, 'HorizontalScroll');
  assert.equal('horizontal' in rail.props, false);

  horizontal.value = false;
  await settle();

  assert.ok(removed.includes('rail'));
  assert.equal(present(views.get('rail'), 'rail').kind, 'Scroll');
});

test('Scroll reports scrolling, reaching the end and pull-to-refresh', () => {
  const { jsx, kuito, views } = make();
  const seen: string[] = [];

  kuito.patch('feed', (api) =>
    api.render(
      jsx('Scroll', {
        id: 'feed',
        refreshing: false,
        reachEndThreshold: 0.25,
        scrollInterval: 32,
        scrollbar: false,
        onScroll: (event: { y?: unknown }) => seen.push('scroll ' + String(event.y)),
        onReachEnd: () => seen.push('end'),
        onRefresh: () => seen.push('refresh'),
        onScrollEnd: (event: { y?: unknown }) => seen.push('rest ' + String(event.y)),
      }),
    ),
  );

  nativeEvent(kuito, 'feed.scroll\u001f{"x":0,"y":120,"contentHeight":900,"layoutHeight":600}');
  nativeEvent(kuito, 'feed.reachend');
  nativeEvent(kuito, 'feed.refresh');

  nativeEvent(
    kuito,
    'feed.scrollend\u001f{"x":0,"y":140,"contentWidth":320,"contentHeight":900,"layoutWidth":320,"layoutHeight":600}',
  );

  assert.deepEqual(seen, ['scroll 120', 'end', 'refresh', 'rest 140']);

  const props = present(views.get('feed'), 'feed').props;

  assert.equal(props.refreshing, false);
  assert.equal(props.reachEndThreshold, 0.25);
  assert.equal(props.scrollInterval, 32);
  assert.equal(props.scrollbar, false);
});

test('native scroll work is opt-in: events and pull-to-refresh are announced only when listened to', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('feed', (api) =>
    api.render(
      jsx(
        'VStack',
        {},
        jsx('Scroll', { id: 'quiet' }),
        jsx('Scroll', { id: 'busy', onScroll: () => undefined, onRefresh: () => undefined }),
      ),
    ),
  );

  assert.equal(present(views.get('quiet'), 'quiet').props.emitsScroll, undefined);
  assert.equal(present(views.get('quiet'), 'quiet').props.refreshable, undefined);
  assert.equal(present(views.get('busy'), 'busy').props.emitsScroll, true);
  assert.equal(present(views.get('busy'), 'busy').props.refreshable, true);
});

test('pull-to-refresh sets a signal-bound refreshing, which the app clears', async () => {
  const { jsx, kuito, views } = make();
  let refreshing!: Signal<boolean>;

  kuito.patch('feed', (api) => {
    function Feed() {
      refreshing = kuito.useState(false);

      return jsx('Scroll', { id: 'feed', refreshing });
    }

    api.render(jsx(Feed, {}));
  });

  nativeEvent(kuito, 'feed.refresh');
  await flushed();

  assert.equal(refreshing.value, true);

  assert.equal(
    present(views.get('feed'), 'feed').props.refreshable,
    true,
    'a bound refreshing listens',
  );

  refreshing.value = false;
  await flushed();

  assert.equal(present(views.get('feed'), 'feed').props.refreshing, false);
});

interface ScrollElement extends KuitoElement {
  scrollTo(
    params: { offset: number; animated?: boolean } | { page: number; animated?: boolean },
  ): void;
  scrollToEnd(params?: { animated?: boolean }): void;
}

test('a Scroll ref scrolls to an offset or to the end, and the same call scrolls again', async () => {
  const { jsx, kuito, sent } = make();
  let feed!: Ref<ScrollElement>;

  kuito.patch('feed', (api) => {
    function Feed() {
      feed = kuito.useRef();

      return jsx('Scroll', { id: 'feed', ref: feed }, jsx('Text', { text: 'a' }));
    }

    api.render(jsx(Feed, {}));
  });

  const scroll = present(feed.current, 'feed');

  scroll.scrollTo({ offset: 120 });
  scroll.scrollToEnd({ animated: false });
  scroll.scrollToEnd({ animated: false });
  scroll.scrollTo({ page: 2, animated: false });
  assert.throws(() => scroll.scrollTo({ page: 1.5 }), /scrollTo takes a page from 0, not 1.5/);
  assert.throws(() => scroll.scrollTo({ page: -1 }), /scrollTo takes a page from 0, not -1/);
  await flushed();

  const requests = sent
    .filter((prop) => prop.id === 'feed' && prop.name === 'scrollTo')
    .map((prop) => prop.value);

  assert.deepEqual(requests, [
    { offset: 120, animated: true, request: 1 },
    { end: true, animated: false, request: 2 },
    { end: true, animated: false, request: 3 },
    { page: 2, animated: false, request: 4 },
  ]);
});

test('only scrolling views take scroll requests', () => {
  const { jsx, kuito } = make();
  let box!: Ref;

  kuito.patch('page', (api) => {
    function Page() {
      box = kuito.useRef();

      return jsx('VStack', { id: 'page', ref: box });
    }

    api.render(jsx(Page, {}));
  });

  assert.equal('scrollTo' in present(box.current, 'page'), false);
});

test('a scroll request survives the Scroll planning again in the same update', async () => {
  const { jsx, kuito, sent } = make();
  let feed!: Ref<ScrollElement>;
  let items!: Signal<string[]>;

  kuito.patch('chat', (api) => {
    function Chat() {
      feed = kuito.useRef();
      items = kuito.useState(['a']);

      return jsx('VStack', {}, () =>
        jsx(
          'Scroll',
          { id: 'feed', ref: feed },
          ...items.value.map((text) => jsx('Text', { text })),
        ),
      );
    }

    api.render(jsx(Chat, {}));
  });

  present(feed.current, 'feed').scrollToEnd({ animated: false });
  items.value = ['a', 'b'];
  await settle();

  const requests = sent.filter((prop) => prop.id === 'feed' && prop.name === 'scrollTo');

  assert.deepEqual(
    requests.map((prop) => prop.value),
    [{ end: true, animated: false, request: 1 }],
    'a request is not state the next plan unsets',
  );
});

test('a Scroll moves its scroll motion from its motion events, announced only when given one', () => {
  const { jsx, kuito, views } = make();
  let feed!: Record<string, { value: unknown }>;

  kuito.patch('feed', (api) => {
    function Feed() {
      feed = kuito.useMotionSource('Scroll');

      return jsx(
        'VStack',
        {},
        jsx('Scroll', { id: 'quiet' }),
        jsx('Scroll', { id: 'feed', motion: feed }),
      );
    }

    api.render(jsx(Feed, {}));
  });

  assert.equal(present(views.get('quiet'), 'quiet').props.emitsMotion, undefined);
  assert.equal(present(views.get('feed'), 'feed').props.emitsMotion, true);
  assert.deepEqual(Object.keys(feed), ['offset', 'velocity', 'overscroll']);

  nativeEvent(kuito, 'feed.motion\u001f{"offset":40,"velocity":-300,"overscroll":0}');

  assert.deepEqual(
    [feed.offset.value, feed.velocity.value, feed.overscroll.value],
    [40, -300, 0],
    'with no UI thread, this thread moves them',
  );

  assert.throws(() => {
    feed.offset.value = 3;
  }, /the platform's: follow it or map it, never write it/);
});

test('a motion source moves with one view at a time, also across re-plans', async () => {
  const { jsx, kuito, views, logs } = make();
  let shown!: Signal<boolean>;
  let given!: Signal<boolean>;

  kuito.patch('feed', (api) => {
    function Feed() {
      const feed = kuito.useMotionSource('Scroll');

      shown = kuito.useState(false);
      given = kuito.useState(true);

      return jsx(
        'VStack',
        {},
        jsx('Scroll', { id: 'feed', motion: () => (given.value ? feed : undefined) }),
        () => (shown.value ? jsx('Scroll', { id: 'other', motion: feed }) : null),
      );
    }

    api.render(jsx(Feed, {}));
  });

  shown.value = true;
  await settle();

  assert.match(
    logs.map(([, message]) => message).join('\n'),
    /scrollMotion\(\) moves with one view at a time: feed and other/,
  );

  assert.equal(views.has('other'), false, 'the re-plan that gave it to a second view undid itself');

  shown.value = false;
  await settle();
  given.value = false;
  await settle();

  assert.equal(present(views.get('feed'), 'feed').props.emitsMotion, null, 'none given: unset');

  shown.value = true;
  await settle();

  assert.equal(present(views.get('other'), 'other').props.emitsMotion, true, 'free again');
});

test('a motion prop takes the motion source of its own kind, on one view at a time', () => {
  const { jsx, kuito } = make();
  const render = (tree: (feed: Record<string, unknown>) => unknown) =>
    kuito.patch('feed', (api) => {
      function Feed() {
        return tree(kuito.useMotionSource('Scroll'));
      }

      api.render(jsx(Feed, {}));
    });

  assert.throws(
    () => render((feed) => jsx('Box', { motion: feed })),
    /Box has no motion source: motion is a Scroll's or a List's/,
  );

  assert.throws(
    () => render(() => jsx('Scroll', { motion: { offset: 0 } })),
    /Scroll motion takes scrollMotion\(\)/,
  );

  assert.throws(
    () =>
      render((feed) =>
        jsx('VStack', {}, jsx('Scroll', { motion: feed }), jsx('Scroll', { motion: feed })),
      ),
    /scrollMotion\(\) moves with one view at a time/,
  );
});
