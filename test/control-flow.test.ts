import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { installKernel, type HostView, type Signal } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function make() {
  const views = new Map<string, HostView>();
  const removed: string[] = [];
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
        removed.push(id);
      },
    }),
  );

  const jsx = host.__kuitoJSX;
  const texts = () =>
    [...views.values()].filter((view) => view.kind === 'Text').map((view) => view.props.text);

  return { host, jsx, views, removed, texts, kuito: host.__kuito };
}

test('Show renders its children while `when` is truthy and its fallback otherwise', async () => {
  const { jsx, kuito, texts } = make();
  let open!: Signal<boolean>;

  kuito.patch('show', (api) => {
    open = api.state('open', false);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Show',
          { when: () => open.value, fallback: jsx('Text', { id: 'closed', text: 'closed' }) },
          jsx('Text', { id: 'open', text: 'open' }),
        ),
      ),
    );
  });

  assert.deepEqual(texts(), ['closed']);

  open.value = true;
  await settle();
  assert.deepEqual(texts(), ['open']);

  open.value = false;
  await settle();
  assert.deepEqual(texts(), ['closed']);
});

test('a Show callback child receives the truthy value', async () => {
  const { jsx, kuito, texts } = make();
  let user!: Signal<{ name: string } | null>;

  kuito.patch('show-value', (api) => {
    user = api.state<{ name: string } | null>('user', null);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Show', { when: () => user.value }, (value: { name: string }) =>
          jsx('Text', { id: 'name', text: 'Hi ' + value.name }),
        ),
      ),
    );
  });

  assert.deepEqual(texts(), []);

  user.value = { name: 'Ada' };
  await settle();
  assert.deepEqual(texts(), ['Hi Ada']);
});

test('flow Switch renders the first Match whose `when` is truthy, else its fallback', async () => {
  const { jsx, kuito, texts } = make();
  let tab!: Signal<string>;

  kuito.patch('switch', (api) => {
    tab = api.state('tab', 'home');

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Switch',
          { fallback: jsx('Text', { text: 'not found' }) },
          jsx('Match', { when: () => tab.value === 'home' }, jsx('Text', { text: 'home' })),
          jsx('Match', { when: () => tab.value === 'search' }, jsx('Text', { text: 'search' })),
          jsx('Match', { when: () => tab.value.length > 0 }, jsx('Text', { text: 'any tab' })),
        ),
      ),
    );
  });

  assert.deepEqual(texts(), ['home']);

  tab.value = 'search';
  await settle();
  assert.deepEqual(texts(), ['search']);

  tab.value = 'profile';
  await settle();
  assert.deepEqual(texts(), ['any tab']);

  tab.value = '';
  await settle();
  assert.deepEqual(texts(), ['not found']);
});

test('a reactive child expression switches structure like Show', async () => {
  const { jsx, kuito, texts } = make();
  let count!: Signal<number>;

  kuito.patch('expr', (api) => {
    count = api.state('count', 0);

    api.render(
      jsx('VStack', { id: 'root' }, () =>
        count.value > 0 ? jsx('Text', { text: 'positive' }) : null,
      ),
    );
  });

  assert.deepEqual(texts(), []);

  count.value = 2;
  await settle();
  assert.deepEqual(texts(), ['positive']);
});

test('structural changes keep sibling views and state, and batch within a tick', async () => {
  const { jsx, kuito, views, removed } = make();
  let open!: Signal<boolean>;
  let label!: Signal<string>;

  kuito.patch('batch', (api) => {
    open = api.state('open', false);
    label = api.state('label', 'first');

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Text', { id: 'label', text: () => label.value }),
        jsx('Show', { when: () => open.value }, jsx('Text', { id: 'extra', text: 'extra' })),
      ),
    );
  });

  const before = kuito.revision('batch');

  open.value = true;
  open.value = false;
  open.value = true;
  label.value = 'second';
  await settle();

  assert.equal(kuito.revision('batch'), before + 1, 'one re-plan for several changes');
  assert.equal(views.get('label')?.props.text, 'second');
  assert.ok(views.has('extra'));
  assert.ok(!removed.includes('label'), 'unchanged siblings are kept');
});

test('the native Toggle keeps working next to flow control', () => {
  const { jsx, kuito, views } = make();

  kuito.patch('toggle', (api) =>
    api.render(jsx('VStack', {}, jsx('Toggle', { id: 'toggle', value: true }))),
  );

  assert.equal(views.get('toggle')?.kind, 'Toggle');
  assert.equal(views.get('toggle')?.props.value, true);
});

test('Match outside Switch is a clear error', () => {
  const { jsx, kuito } = make();

  assert.throws(
    () =>
      kuito.patch('bad', (api) =>
        api.render(jsx('VStack', {}, jsx('Match', { when: true }, jsx('Text', { text: 'x' })))),
      ),
    /Match must be a direct child of Switch/,
  );
});

test('each branch of a conditional gets its own component state', async () => {
  const { jsx, kuito, texts } = make();
  let flag!: Signal<boolean>;

  function Counter() {
    const count = kuito.useState(10);

    return jsx('Text', { id: 'counter', text: () => 'counter ' + count.value });
  }

  function Timer() {
    const seconds = kuito.useState(0);

    return jsx('Text', { id: 'timer', text: () => 'timer ' + seconds.value });
  }

  kuito.patch('branches', (api) => {
    flag = api.state('flag', true);

    api.render(
      jsx('VStack', { id: 'root' }, () => (flag.value ? jsx(Counter, {}) : jsx(Timer, {}))),
    );
  });

  assert.deepEqual(texts(), ['counter 10']);

  flag.value = false;
  await settle();
  assert.deepEqual(texts(), ['timer 0'], 'Timer starts from its own initial state');
});

test('a changed key remounts a single component child', async () => {
  const { jsx, kuito, texts } = make();
  let user!: Signal<string>;
  let visits!: Signal<number>;
  let mounts = 0;

  function Profile(props: { id?: unknown }) {
    visits = kuito.useState(0);

    kuito.useLifecycle('mount', () => {
      mounts++;
    });

    return jsx('Text', { id: 'profile', text: () => String(props.id) + ' ' + visits.value });
  }

  kuito.patch('keyed', (api) => {
    user = api.state('user', 'ada');

    api.render(
      jsx('VStack', { id: 'root' }, () => jsx(Profile, { key: user.value, id: user.value })),
    );
  });

  visits.value = 3;
  await settle();
  assert.deepEqual(texts(), ['ada 3']);

  user.value = 'grace';
  await settle();
  assert.equal(mounts, 2, 'the new key mounts a new instance');
  assert.deepEqual(texts(), ['grace 0'], 'the new instance starts from initial state');
});

test('a Show branch hidden then shown mounts again with fresh state', async () => {
  const { jsx, kuito, texts } = make();
  let open!: Signal<boolean>;
  let count!: Signal<number>;
  let mounts = 0;

  function Panel() {
    count = kuito.useState(0);

    kuito.useLifecycle('mount', () => {
      mounts++;
    });

    return jsx('Text', { id: 'panel', text: () => 'count ' + count.value });
  }

  kuito.patch('show-state', (api) => {
    open = api.state('open', true);

    api.render(
      jsx('VStack', { id: 'root' }, jsx('Show', { when: () => open.value }, jsx(Panel, {}))),
    );
  });

  count.value = 4;
  await settle();
  assert.deepEqual(texts(), ['count 4']);

  open.value = false;
  await settle();
  assert.deepEqual(texts(), []);

  open.value = true;
  await settle();
  assert.equal(mounts, 2, 'showing the branch again runs onMount again');
  assert.deepEqual(texts(), ['count 0'], 'the remounted branch starts from initial state');
});

test('a child expression whose component changes mounts new views, not reused ones', async () => {
  const { jsx, kuito, views, removed } = make();
  let flag!: Signal<boolean>;

  function Counter() {
    return jsx('Text', { text: 'counter' });
  }

  function Timer() {
    return jsx('Text', { text: 'timer' });
  }

  kuito.patch('swap', (api) => {
    flag = api.state('flag', true);

    api.render(
      jsx('VStack', { id: 'root' }, () => (flag.value ? jsx(Counter, {}) : jsx(Timer, {}))),
    );
  });

  const [counter] = [...views.keys()].filter((id) => views.get(id)?.kind === 'Text');

  flag.value = false;
  await settle();

  const [timer] = [...views.keys()].filter((id) => views.get(id)?.kind === 'Text');

  assert.notEqual(timer, counter, 'the Timer instance has a path of its own');
  assert.deepEqual(removed, [counter]);
});

test('a changed key gives a single component child a new path', async () => {
  const { jsx, kuito, views, removed } = make();
  let user!: Signal<string>;

  function Profile(props: { name?: unknown }) {
    return jsx('Text', { text: () => String(props.name) });
  }

  kuito.patch('keyed-path', (api) => {
    user = api.state('user', 'ada');

    api.render(
      jsx('VStack', { id: 'root' }, () => jsx(Profile, { key: user.value, name: user.value })),
    );
  });

  const [ada] = [...views.keys()].filter((id) => views.get(id)?.kind === 'Text');

  user.value = 'grace';
  await settle();

  assert.deepEqual(removed, [ada]);
  assert.equal([...views.values()].filter((view) => view.kind === 'Text').length, 1);
});

/** A host that keeps each parent's children in order, and counts what the kernel asked of it. */
function makeOrdered() {
  const views = new Map<string, HostView>();
  const children = new Map<string, string[]>();
  const ops = { create: 0, remove: 0, move: 0, prop: 0 };
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
        children.set(parent, [...(children.get(parent) ?? []), id]);
        ops.create++;
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
        ops.prop++;
      },
      moveView(id: string, parent: string, index: number) {
        const siblings = (children.get(parent) ?? []).filter((sibling) => sibling !== id);

        siblings.splice(index, 0, id);
        children.set(parent, siblings);
        ops.move++;
      },
      removeView(id: string) {
        const parent = present(views.get(id), id).parent;

        children.set(
          parent,
          (children.get(parent) ?? []).filter((sibling) => sibling !== id),
        );

        views.delete(id);
        ops.remove++;
      },
    }),
  );
  /** The texts of `parent`'s Text children, in order. */
  const texts = (parent: string) =>
    (children.get(parent) ?? []).map((id) => present(views.get(id), id).props.text);
  const counted = async (action: () => void) => {
    const before = { ...ops };
    const work = host.__kuito.stats().total;

    action();
    await settle();

    const after = host.__kuito.stats().total;

    return {
      create: ops.create - before.create,
      remove: ops.remove - before.remove,
      move: ops.move - before.move,
      prop: ops.prop - before.prop,
      thunks: after.thunkEvaluations - work.thunkEvaluations,
    };
  };

  return { host, jsx: host.__kuitoJSX, kuito: host.__kuito, views, texts, counted };
}

interface Item {
  name: string;
}

test('For renders a row per item, in order, and follows the array', async () => {
  const { jsx, kuito, texts, counted } = makeOrdered();
  let items!: Signal<Item[]>;

  kuito.patch('for', (api) => {
    items = api.state('items', [{ name: 'a' }, { name: 'b' }]);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('For', { each: () => items.value }, (item: Item) =>
          jsx('Text', { text: () => item.name }),
        ),
      ),
    );
  });

  assert.deepEqual(texts('root'), ['a', 'b']);

  const pushed = await counted(() => (items.value = [...items.value, { name: 'c' }]));

  assert.deepEqual(texts('root'), ['a', 'b', 'c']);
  assert.equal(pushed.create, 1, 'only the new row is created');
  assert.equal(pushed.prop, 1, "only the new row's text is sent");

  const removed = await counted(() => (items.value = items.value.slice(1)));

  assert.deepEqual(texts('root'), ['b', 'c']);
  assert.deepEqual([removed.create, removed.remove], [0, 1]);
});

test('For reorders 100 rows with moves only, rendering no row again', async () => {
  const { jsx, kuito, texts, counted } = makeOrdered();
  let items!: Signal<Item[]>;
  let rendered = 0;

  kuito.patch('reorder', (api) => {
    items = api.state(
      'items',
      Array.from({ length: 100 }, (_, index) => ({ name: 'row ' + index })),
    );

    api.render(
      jsx(
        'Scroll',
        { id: 'scroll' },
        jsx('For', { each: () => items.value }, (item: Item) => {
          rendered++;

          return jsx('Text', { text: () => item.name });
        }),
      ),
    );
  });

  const first = texts('scroll');

  rendered = 0;

  const reversed = await counted(() => (items.value = [...items.value].reverse()));

  assert.deepEqual(texts('scroll'), [...first].reverse());
  assert.deepEqual([reversed.create, reversed.remove, reversed.prop], [0, 0, 0]);
  assert.ok(reversed.move > 0 && reversed.move < 100, reversed.move + ' moves');
  assert.equal(rendered, 0, 'every row keeps its tree');
  assert.equal(reversed.thunks, 1, 'only `each` is evaluated again');
});

test("For's index follows each row's position without rendering it again", async () => {
  const { jsx, kuito, texts, counted } = makeOrdered();
  let items!: Signal<Item[]>;

  kuito.patch('index', (api) => {
    items = api.state('items', [{ name: 'a' }, { name: 'b' }]);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('For', { each: () => items.value }, (item: Item, index: { value: number }) =>
          jsx('Text', { text: () => index.value + 1 + '. ' + item.name }),
        ),
      ),
    );
  });

  const inserted = await counted(() => (items.value = [{ name: 'z' }, ...items.value]));

  assert.deepEqual(texts('root'), ['1. z', '2. a', '3. b']);
  assert.equal(inserted.create, 1);
  assert.equal(inserted.prop, 3, 'the new row, and the index of each moved row');
});

test('For shows its fallback while the array is empty', async () => {
  const { jsx, kuito, texts } = makeOrdered();
  let items!: Signal<Item[]>;

  kuito.patch('empty', (api) => {
    items = api.state('items', []);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'For',
          { each: () => items.value, fallback: jsx('Text', { text: 'nothing' }) },
          (item: Item) => jsx('Text', { text: () => item.name }),
        ),
      ),
    );
  });

  assert.deepEqual(texts('root'), ['nothing']);

  items.value = [{ name: 'a' }];
  await settle();

  assert.deepEqual(texts('root'), ['a']);
});
