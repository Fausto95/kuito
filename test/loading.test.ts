import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { installKernel, type HostView, type Signal, type VNode } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

function make() {
  const views = new Map<string, HostView>();
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );
  const visible = (view: HostView | undefined): boolean =>
    !view || (view.props.hidden !== true && visible(views.get(view.parent)));
  // What shows: the texts of views that exist with no hidden view around them, sorted.
  const shown = () =>
    [...views.values()]
      .filter((view) => view.kind === 'Text' && visible(view))
      .map((view) => String(view.props.text))
      .sort();

  return { jsx: host.__kuitoJSX, kuito: host.__kuito, views, shown };
}

/** Wait for what a write scheduled (a re-plan, a resource) until `check` holds. */
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;

  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not reached in time');

    await new Promise((resolve) => setImmediate(resolve));
  }
}

type Jsx = ReturnType<typeof make>['jsx'];
type Kernel = ReturnType<typeof make>['kuito'];

/** A component whose resource waits for `load`, showing what it loaded. */
function feed(jsx: Jsx, kuito: Kernel, id: string, load: Promise<string>) {
  return function Feed(): VNode {
    const data = kuito.useResource(() => load);

    return jsx('Text', { id, text: () => data.data.value ?? id + ' empty' });
  };
}

test('Loading shows its fallback, its children hidden, until their resources load', async () => {
  const { jsx, kuito, views, shown } = make();
  const load = Promise.withResolvers<string>();

  kuito.patch('loading', (api) => {
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Text', { id: 'title', text: 'title' }),
        jsx(
          'Loading',
          { fallback: jsx('Text', { id: 'spinner', text: 'spinner' }) },
          jsx(feed(jsx, kuito, 'feed', load.promise), {}),
        ),
      ),
    );
  });

  assert.deepEqual(shown(), ['spinner', 'title']);
  assert.equal(present(views.get('feed'), 'feed').props.hidden, true);

  load.resolve('posts');
  await until(() => shown().includes('posts'));
  assert.deepEqual(shown(), ['posts', 'title']);
});

test('Loading waits for every resource under it', async () => {
  const { jsx, kuito, views, shown } = make();
  const first = Promise.withResolvers<string>();
  const second = Promise.withResolvers<string>();

  kuito.patch('every', (api) => {
    api.render(
      jsx(
        'Loading',
        { fallback: jsx('Text', { id: 'spinner', text: 'spinner' }) },
        jsx(feed(jsx, kuito, 'first', first.promise), {}),
        jsx('VStack', { id: 'box' }, jsx(feed(jsx, kuito, 'second', second.promise), {})),
      ),
    );
  });

  first.resolve('one');
  await until(() => views.get('first')?.props.text === 'one');
  assert.deepEqual(shown(), ['spinner']);

  second.resolve('two');
  await until(() => shown().includes('two'));
  assert.deepEqual(shown(), ['one', 'two']);
});

test('Loading with nothing to load shows its children at once and keeps their own hidden', async () => {
  const { jsx, kuito, views, shown } = make();
  let closed!: Signal<boolean>;

  kuito.patch('nothing', (api) => {
    closed = api.state('closed', true);

    api.render(
      jsx(
        'Loading',
        { fallback: jsx('Text', { id: 'spinner', text: 'spinner' }) },
        jsx('Text', { id: 'static', text: 'static' }),
        jsx('Text', { id: 'panel', text: 'panel', hidden: () => closed.value }),
      ),
    );
  });

  assert.deepEqual(shown(), ['static']);
  assert.equal(present(views.get('panel'), 'panel').props.hidden, true);

  closed.value = false;
  await until(() => shown().includes('panel'));
  assert.deepEqual(shown(), ['panel', 'static']);
});

test('once Loading shows its children, a refresh does not hide them again', async () => {
  const { jsx, kuito, shown } = make();
  let loads = 0;
  let refresh!: () => Promise<unknown>;

  function Feed(): VNode {
    const data = kuito.useResource(async () => 'load ' + ++loads);

    refresh = () => data.refresh();

    return jsx('Text', { id: 'feed', text: () => data.data.value ?? 'empty' });
  }

  kuito.patch('refresh', (api) => {
    api.render(
      jsx('Loading', { fallback: jsx('Text', { id: 'spinner', text: 'spinner' }) }, jsx(Feed, {})),
    );
  });

  // Showing its children renders them again, which loads once more.
  await until(() => shown().some((text) => text.startsWith('load')));

  const before = shown();
  const refreshed = refresh();

  await Promise.resolve();
  assert.deepEqual(shown(), before);
  await refreshed;
  await until(() => shown().includes('load ' + loads));
  assert.deepEqual(shown(), ['load ' + loads]);
});

test('a failed resource lets Loading show its children', async () => {
  const { jsx, kuito, shown } = make();
  const load = Promise.withResolvers<string>();

  function Feed(): VNode {
    const data = kuito.useResource(() => load.promise);

    return jsx('Text', {
      id: 'feed',
      text: () => (data.error.value ? 'failed' : (data.data.value ?? 'empty')),
    });
  }

  kuito.patch('failed', (api) => {
    api.render(
      jsx('Loading', { fallback: jsx('Text', { id: 'spinner', text: 'spinner' }) }, jsx(Feed, {})),
    );
  });

  load.reject(new Error('offline'));
  await until(() => shown().includes('failed'));
  assert.deepEqual(shown(), ['failed']);
});

test('a resource under a nested Loading holds only that one', async () => {
  const { jsx, kuito, shown } = make();
  const outer = Promise.withResolvers<string>();
  const inner = Promise.withResolvers<string>();

  kuito.patch('nested', (api) => {
    api.render(
      jsx(
        'Loading',
        { fallback: jsx('Text', { id: 'outer-spinner', text: 'outer spinner' }) },
        jsx(feed(jsx, kuito, 'outer', outer.promise), {}),
        jsx(
          'Loading',
          { fallback: jsx('Text', { id: 'inner-spinner', text: 'inner spinner' }) },
          jsx(feed(jsx, kuito, 'inner', inner.promise), {}),
        ),
      ),
    );
  });

  assert.deepEqual(shown(), ['outer spinner']);

  outer.resolve('outer data');
  await until(() => shown().includes('outer data'));
  assert.deepEqual(shown(), ['inner spinner', 'outer data']);

  inner.resolve('inner data');
  await until(() => shown().includes('inner data'));
  assert.deepEqual(shown(), ['inner data', 'outer data']);
});

test('a branch re-planned while Loading waits stays hidden, and one that leaves stops the wait', async () => {
  const { jsx, kuito, views, shown } = make();
  const kept = Promise.withResolvers<string>();
  const left = Promise.withResolvers<string>();
  let open!: Signal<boolean>;

  kuito.patch('branches', (api) => {
    open = api.state('open', true);

    api.render(
      jsx(
        'Loading',
        { fallback: jsx('Text', { id: 'spinner', text: 'spinner' }) },
        jsx(feed(jsx, kuito, 'kept', kept.promise), {}),
        jsx(
          'Show',
          { when: () => open.value, fallback: jsx('Text', { id: 'closed', text: 'closed' }) },
          jsx(feed(jsx, kuito, 'left', left.promise), {}),
        ),
      ),
    );
  });

  open.value = false;
  await until(() => views.has('closed'));
  assert.deepEqual(shown(), ['spinner']);

  kept.resolve('kept data');
  await until(() => shown().includes('kept data'));
  assert.deepEqual(shown(), ['closed', 'kept data']);
});

test('resources under a Loading inside, its content or its fallback, never hold the outer one', async () => {
  const { jsx, kuito, views, shown } = make();
  const outer = Promise.withResolvers<string>();
  const later = Promise.withResolvers<string>();
  const skeleton = Promise.withResolvers<string>();
  let open!: Signal<boolean>;

  kuito.patch('claimed', (api) => {
    open = api.state('open', false);

    api.render(
      jsx(
        'Loading',
        { fallback: jsx('Text', { id: 'outer-spinner', text: 'outer spinner' }) },
        jsx(feed(jsx, kuito, 'outer', outer.promise), {}),
        // Nothing to load: it shows its children in the first plan.
        jsx(
          'Loading',
          { fallback: jsx('Text', { id: 'never', text: 'never' }) },
          jsx(
            'Show',
            { when: () => open.value },
            jsx(feed(jsx, kuito, 'later', later.promise), {}),
          ),
        ),
        jsx(
          'Loading',
          { fallback: jsx(feed(jsx, kuito, 'skeleton', skeleton.promise), {}) },
          jsx(feed(jsx, kuito, 'pending', Promise.withResolvers<string>().promise), {}),
        ),
      ),
    );
  });

  open.value = true;
  await until(() => views.has('later'));
  outer.resolve('outer data');
  await until(() => shown().includes('outer data'));
  assert.deepEqual(shown(), ['later empty', 'outer data', 'skeleton empty']);
});
