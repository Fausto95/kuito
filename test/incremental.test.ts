import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { pan } from '../src/runtime/gesture-specs.ts';
import { present } from './support/present.ts';
import { make } from './support/thread-kernel.ts';
import {
  flushed,
  installKernel,
  type Component,
  type HostView,
  type Ref,
  type Signal,
  type KuitoGlobals,
} from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

function runtime() {
  const nodes = new Map<string, HostView>();
  const sets: Array<[string, string, unknown]> = [];
  const context = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        nodes.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, key: string, value: unknown) {
        assert.ok(nodes.has(id));
        present(nodes.get(id), id).props[key] = value;
        sets.push([id, key, value]);
      },
      removeView(id: string) {
        nodes.delete(id);
      },
    }),
  );

  return { context, nodes, sets };
}

function render(ctx: KuitoGlobals, fn: Component) {
  ctx.__kuito.patch('kuito.app', (api) => api.render(ctx.__kuitoJSX(fn, {})));
}

function define(ctx: KuitoGlobals, fn: Component, name: string, hash: string) {
  ctx.__kuito.defineComponent('demo/app#' + name, fn, hash, true);
}

test('unchanged component function is skipped on an unrelated source patch', () => {
  const { context: ctx, nodes } = runtime();
  let appRuns = 0,
    counterRuns = 0;

  function App() {
    appRuns++;
    return ctx.__kuitoJSX(Counter, {});
  }

  function Counter() {
    counterRuns++;

    const count = ctx.__kuito.useState(0);

    return ctx.__kuitoJSX(
      'VStack',
      { id: 'root' },
      ctx.__kuitoJSX(
        'Text',
        { id: 'label' },
        'Hey ',
        ctx.__kuitoExpr('random-source', () => '42'),
      ),
      ctx.__kuitoJSX('Button', { id: 'button', onPress: () => count.value++ }, 'Tap'),
    );
  }

  define(ctx, App, 'App', 'app1');
  define(ctx, Counter, 'Counter', 'counter1');
  render(ctx, App);
  render(ctx, App);
  assert.equal(appRuns, 1);
  assert.equal(counterRuns, 1);
  assert.equal(nodes.get('label')?.props.text, 'Hey 42');
});

test('changed child component updates without reexecuting its unchanged parent', () => {
  const { context: ctx, nodes } = runtime();
  let appRuns = 0,
    childRuns = 0;

  function App() {
    appRuns++;
    return ctx.__kuitoJSX(Child, {});
  }

  function Child() {
    childRuns++;
    return ctx.__kuitoJSX('Text', { id: 'label' }, 'before');
  }

  define(ctx, App, 'App', 'a');
  define(ctx, Child, 'Child', 'v1');
  render(ctx, App);

  function ChildNext() {
    childRuns++;
    return ctx.__kuitoJSX('Text', { id: 'label' }, 'after');
  }

  ctx.__kuito.defineComponent('demo/app#Child', ChildNext, 'v2', true);
  render(ctx, App);
  assert.equal(appRuns, 1);
  assert.equal(childRuns, 2);
  assert.equal(nodes.get('label')?.props.text, 'after');
});

test('onMount is instance-scoped and does not replay for compatible refresh', () => {
  const { context: ctx } = runtime();
  let mounts = 0,
    cleanups = 0;

  function Counter() {
    ctx.__kuito.useLifecycle('mount', () => {
      mounts++;
      return () => cleanups++;
    });

    return ctx.__kuitoJSX('Text', { id: 'label' }, 'ok');
  }

  define(ctx, Counter, 'Counter', 'v1');
  render(ctx, Counter);
  render(ctx, Counter);
  assert.equal(mounts, 1);

  function Changed() {
    ctx.__kuito.useLifecycle('mount', () => {
      mounts++;
      return () => cleanups++;
    });

    return ctx.__kuitoJSX('Text', { id: 'label' }, 'changed');
  }

  ctx.__kuito.defineComponent('demo/app#Counter', Changed, 'v2', true);
  render(ctx, Counter);
  assert.equal(mounts, 1, 'same component instance must not remount when its body changes');
  assert.equal(cleanups, 0);
  ctx.__kuito.dispose('kuito.app');
  assert.equal(cleanups, 1);
});

test('removed conditional child releases mount scope and attached ref', () => {
  const { context: ctx } = runtime();
  let removed = 0,
    ref!: Ref;

  function App() {
    return ctx.__kuitoJSX(Child, {});
  }

  function Child() {
    ref = ctx.__kuito.useRef();
    ctx.__kuito.useLifecycle('mount', () => () => removed++);

    return ctx.__kuitoJSX('Text', { id: 'child', ref: ref }, 'Hey');
  }

  define(ctx, App, 'App', 'a1');
  define(ctx, Child, 'Child', 'c1');
  render(ctx, App);
  assert.equal(ref.current?.id, 'child');

  function UpdatedApp() {
    return ctx.__kuitoJSX('VStack', { id: 'root' });
  }

  ctx.__kuito.defineComponent('demo/app#App', UpdatedApp, 'a2', true);
  render(ctx, App);
  assert.equal(removed, 1);
  assert.equal(ref.current, null);
});

test('a Show toggle sends no props to 50 unrelated views', async () => {
  const { context: ctx, sets } = runtime();
  const jsx = ctx.__kuitoJSX;
  const unrelated = Array.from({ length: 50 }, (_, index) => 'card' + index);
  let open!: Signal<boolean>;

  ctx.__kuito.patch('cards', (api) => {
    open = api.state('open', false);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        unrelated.map((id) =>
          jsx('Box', {
            key: id,
            id,
            style: { width: 10 },
            gestures: [pan({ onChange: () => {} })],
          }),
        ),
        jsx('Show', { when: () => open.value }, jsx('Text', { id: 'extra', text: 'extra' })),
      ),
    );
  });

  sets.length = 0;
  open.value = true;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(
    sets.some(([id]) => id === 'extra'),
    'the Show branch mounted',
  );

  assert.deepEqual(
    sets.filter(([id]) => unrelated.includes(id)),
    [],
    'unrelated views receive no setProp',
  );
});

test('a re-render keeps the label of a component it did not run again', async () => {
  const { context: ctx, nodes } = runtime();
  const jsx = ctx.__kuitoJSX;
  let open!: Signal<boolean>;
  let evaluations = 0;

  function Label() {
    return jsx(
      'Text',
      { id: 'label' },
      ctx.__kuitoExpr('label-source', () => 'run ' + ++evaluations),
    );
  }

  define(ctx, Label, 'Label', 'label1');

  ctx.__kuito.patch('kuito.app', (api) => {
    open = api.state('open', false);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(Label, {}),
        jsx('Show', { when: () => open.value }, jsx('Text', { id: 'extra', text: 'extra' })),
      ),
    );
  });

  open.value = true;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(nodes.has('extra'), 'the Show branch mounted');
  assert.equal(nodes.get('label')?.props.text, 'run 1');
  assert.equal(evaluations, 1, 'the cached Label returned the same expression');
});

test('re-patching unchanged gesture handlers keeps the JS-thread remotes flat', async () => {
  const kernel = make();
  const jsx = kernel.host.__kuitoJSX;
  const card = () =>
    jsx('Box', { id: 'card', gestures: [pan({ onChange: () => {}, onEnd: () => {} })] });
  const remotes = () => {
    const ids = JSON.stringify(kernel.ops('handler')).match(/"\$j":\d+/g) ?? [];

    return Math.max(...ids.map((id) => Number(id.slice(5))));
  };

  kernel.render(card);
  await kernel.settle();

  const first = remotes();

  for (let patch = 0; patch < 200; patch++) kernel.render(card);
  await kernel.settle();

  assert.equal(first, 2, 'one remote per callback');
  assert.equal(remotes(), first, 'the highest remote id stays where the first patch left it');
});

test('a reused gesture remote calls the callback of the latest patch', async () => {
  const kernel = make();
  const jsx = kernel.host.__kuitoJSX;
  const calls: string[] = [];
  const card = (version: string) => () =>
    jsx('Box', { id: 'card', gestures: [pan({ onChange: () => calls.push(version) })] });
  const callUI = (id: number) =>
    nativeEvent(kernel.host.__kuito, '__kuito.ui\u001f' + JSON.stringify({ f: id, args: [] }));

  kernel.render(card('first'));
  kernel.render(card('second'));
  await kernel.settle();

  callUI(1);
  assert.deepEqual(calls, ['second']);
});

test('disposing a module frees what its views and hooks held', async () => {
  const kernel = make();
  const { __kuitoJSX: jsx, __kuito: kuito } = kernel.host;
  const empty = kuito.stats().held;

  function Cell() {
    const offset = kernel.threads.__kuito.useMotion(0, 'offset');
    const drags = kuito.useState(0, 'drags');

    return jsx(
      'VStack',
      { id: 'cell' },
      jsx('Box', {
        id: 'handle',
        translateY: () => offset,
        gestures: [pan({ onChange: () => drags.value++ })],
      }),
    );
  }

  kuito.patch('cell', (api) => api.render(jsx(Cell, {})));
  // The handle leaves: the module's next plan releases what it held.
  kuito.patch('cell', (api) => api.render(jsx('VStack', { id: 'cell' })));
  kuito.patch('cell', (api) => api.render(jsx(Cell, {})));
  await kernel.settle();

  const held = kuito.stats().held;

  assert.ok(held.remotes > 0 && held.gestureTags > 0 && held.motions > 0, JSON.stringify(held));

  kuito.dispose('cell');
  await kernel.settle();

  assert.deepEqual({ ...kuito.stats().held }, { ...empty }, 'nothing once the module is gone');
});

/** A structural write re-plans in a microtask; awaiting one more lets it run first. */
const replanned = () => Promise.resolve();

function cardsWithShow(ctx: KuitoGlobals, count: number, read: () => unknown) {
  const jsx = ctx.__kuitoJSX;
  const state: { open?: Signal<boolean> } = {};

  function Card(props: Record<string, unknown>) {
    return jsx('Box', { id: 'card' + String(props.index), opacity: read });
  }

  define(ctx, Card, 'Card', 'card1');

  ctx.__kuito.patch('cards', (api) => {
    state.open = api.state('open', false);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        Array.from({ length: count }, (_, index) => jsx(Card, { key: String(index), index })),
        jsx('Show', { when: () => state.open?.value }, jsx('Text', { id: 'extra', text: 'x' })),
      ),
    );
  });

  return present(state.open, 'open');
}

test('a re-plan keeps the bindings of a component it did not run again', async () => {
  const { context: ctx, nodes } = runtime();
  let evaluations = 0;
  let tint!: Signal<number>;

  ctx.__kuito.patch('tint', (api) => {
    tint = api.state('tint', 1);
    api.render(null);
  });

  const open = cardsWithShow(ctx, 1, () => {
    evaluations++;

    return tint.value;
  });

  open.value = true;
  await flushed();
  await replanned();

  assert.ok(nodes.has('extra'), 'the Show branch mounted');
  assert.equal(evaluations, 1, 'the cached Card returned the same thunk');

  tint.value = 0.5;
  await flushed();
  assert.equal(nodes.get('card0')?.props.opacity, 0.5, 'the kept binding still follows');
});

test('a re-plan waits while the host is behind, then runs once', async () => {
  let busy = false;
  const nodes = new Map<string, HostView>();
  const ctx = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        nodes.set(id, { kind, parent, props: {} });
      },
      removeView(id: string) {
        nodes.delete(id);
      },
      __kuitoHostBusy: () => busy,
    }),
  );
  const open = cardsWithShow(ctx, 1, () => 1);
  const replans = ctx.__kuito.stats().replans;

  busy = true;
  open.value = true;
  await flushed();
  await replanned();
  open.value = false;
  await flushed();
  open.value = true;
  await flushed();
  await replanned();

  assert.equal(nodes.has('extra'), false, 'no re-plan while the UI thread has batches left');
  assert.equal(ctx.__kuito.stats().replans, replans);

  busy = false;
  ctx.__kuito.dispatch(0, 'host.idle');

  assert.ok(nodes.has('extra'), 'the host catching up runs the re-plan');
  assert.equal(ctx.__kuito.stats().replans, replans + 1, 'once, for every write it waited on');
});

test('a re-plan keeps the subscriptions of the bindings it kept', async () => {
  const { context: ctx } = runtime();
  let tint!: Signal<number>;

  ctx.__kuito.patch('tint', (api) => {
    tint = api.state('tint', 1);
    api.render(null);
  });

  const open = cardsWithShow(ctx, 50, () => tint.value);

  open.value = true;
  await flushed();
  await replanned();

  const { lastReplan } = ctx.__kuito.stats();

  assert.equal(lastReplan.subscriptionsDestroyed, 0);
  assert.equal(lastReplan.subscriptionsCreated, 0);
  assert.equal(tint.listenerCount, 50);
  assert.equal(open.listenerCount, 1, 'the structural signal kept its one subscription');
});

test('a binding that stops reading a signal lets go of it and keeps the others', async () => {
  const { context: ctx, nodes } = runtime();
  let useLeft!: Signal<boolean>;
  let left!: Signal<string>;
  let right!: Signal<string>;

  ctx.__kuito.patch('pick', (api) => {
    useLeft = api.state('useLeft', true);
    left = api.state('left', 'a');
    right = api.state('right', 'b');

    api.render(
      ctx.__kuitoJSX('Text', {
        id: 'picked',
        text: () => (useLeft.value ? left.value : right.value),
      }),
    );
  });

  const before = ctx.__kuito.stats().total;

  useLeft.value = false;
  await flushed();

  const after = ctx.__kuito.stats().total;

  assert.equal(nodes.get('picked')?.props.text, 'b');
  assert.equal(after.subscriptionsDestroyed - before.subscriptionsDestroyed, 1, 'only left goes');
  assert.equal(after.subscriptionsCreated - before.subscriptionsCreated, 1, 'only right comes');
  assert.equal(left.listenerCount, 0);
  assert.equal(useLeft.listenerCount, 1);
});

test('a binding that computes an equal object sends nothing', () => {
  const { context: ctx, sets } = runtime();
  let tick!: Signal<number>;

  ctx.__kuito.patch('style', (api) => {
    tick = api.state('tick', 0);

    api.render(
      ctx.__kuitoJSX('Box', { id: 'box', style: () => ({ width: tick.value >= 0 ? 10 : 0 }) }),
    );
  });

  sets.length = 0;
  tick.value = 1;

  assert.deepEqual(
    sets.filter(([id]) => id === 'box'),
    [],
  );
});

/** A host that keeps each parent's children in order and can move them. */
function orderedRuntime() {
  const children = new Map<string, string[]>();
  const removed: string[] = [];
  const detach = (id: string) =>
    children.forEach((list, parent) =>
      children.set(
        parent,
        list.filter((child) => child !== id),
      ),
    );
  const context = installKernel(
    hosting({
      createView(id: string, _kind: string, parent: string) {
        children.set(parent, [...(children.get(parent) ?? []), id]);
      },
      setProp() {},
      removeView(id: string) {
        detach(id);
        removed.push(id);
      },
      moveView(id: string, parent: string, index: number) {
        detach(id);

        const list = [...(children.get(parent) ?? [])];

        list.splice(index, 0, id);
        children.set(parent, list);
      },
    }),
  );

  return { context, children, removed };
}

test('a Show toggle in a 500-view module re-plans only its branch', async () => {
  const { context: ctx, sets } = runtime();
  const jsx = ctx.__kuitoJSX;
  let open!: Signal<boolean>;
  let tint!: Signal<number>;
  let label!: Signal<string>;

  ctx.__kuito.patch('screen', (api) => {
    open = api.state('open', false);
    tint = api.state('tint', 1);
    label = api.state('label', 'details');

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        Array.from({ length: 500 }, (_, index) =>
          jsx('Box', { key: String(index), id: 'box' + index, opacity: () => tint.value }),
        ),
        jsx(
          'Show',
          { when: () => open.value },
          jsx('VStack', { id: 'sheet' }, jsx('Text', { id: 'title', text: () => label.value })),
        ),
      ),
    );
  });

  sets.length = 0;
  open.value = true;
  await flushed();
  await replanned();

  const shown = ctx.__kuito.stats().lastReplan;

  assert.ok(
    sets.some(([id]) => id === 'title'),
    'the branch mounted',
  );

  assert.deepEqual(
    sets.filter(([id]) => id.startsWith('box')),
    [],
    'no setProp outside the branch',
  );

  assert.ok(shown.thunkEvaluations < 50, 'evaluated ' + shown.thunkEvaluations + ' thunks');
  assert.equal(shown.subscriptionsDestroyed, 0);
  assert.equal(tint.listenerCount, 500);

  open.value = false;
  await flushed();
  await replanned();

  const hidden = ctx.__kuito.stats().lastReplan;

  assert.ok(hidden.thunkEvaluations < 50, 'evaluated ' + hidden.thunkEvaluations + ' thunks');
  assert.equal(hidden.subscriptionsDestroyed, 1, 'only the title lets go of its signal');
  assert.equal(label.listenerCount, 0);
  assert.equal(tint.listenerCount, 500);
});

test('a branch mounts in its place among its siblings', async () => {
  const { context: ctx, children } = orderedRuntime();
  const jsx = ctx.__kuitoJSX;
  let open!: Signal<boolean>;

  ctx.__kuito.patch('places', (api) => {
    open = api.state('open', false);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Text', { id: 'first', text: 'first' }),
        jsx('Show', { when: () => open.value }, jsx('Text', { id: 'middle', text: 'middle' })),
        jsx('Text', { id: 'last', text: 'last' }),
      ),
    );
  });

  open.value = true;
  await flushed();
  await replanned();
  assert.deepEqual(children.get('root'), ['first', 'middle', 'last']);

  open.value = false;
  await flushed();
  await replanned();
  assert.deepEqual(children.get('root'), ['first', 'last']);
});

test('the innermost Show re-plans alone, and its owner takes it along', async () => {
  const { context: ctx, removed } = orderedRuntime();
  const jsx = ctx.__kuitoJSX;
  let outer!: Signal<boolean>;
  let inner!: Signal<boolean>;
  let word!: Signal<string>;

  ctx.__kuito.patch('nested', (api) => {
    outer = api.state('outer', true);
    inner = api.state('inner', false);
    word = api.state('word', 'hi');

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(
          'Show',
          { when: () => outer.value },
          jsx(
            'VStack',
            { id: 'panel' },
            jsx('Text', { id: 'heading', text: () => word.value }),
            jsx('Show', { when: () => inner.value }, jsx('Text', { id: 'detail', text: 'detail' })),
          ),
        ),
      ),
    );
  });

  inner.value = true;
  await flushed();
  await replanned();

  const innerOnly = ctx.__kuito.stats().lastReplan;

  assert.deepEqual(removed, [], 'the outer branch keeps its views');
  assert.equal(innerOnly.thunkEvaluations, 1, 'only the inner condition runs');
  assert.ok(ctx.__kuito.view('detail'));

  outer.value = false;
  await flushed();
  await replanned();

  assert.equal(ctx.__kuito.view('detail'), null, 'the inner branch went with its owner');
  assert.equal(inner.listenerCount, 0, 'and so did its condition');
  assert.equal(word.listenerCount, 0);
});

test('a branch that leaves disposes the components in it and keeps the others', async () => {
  const { context: ctx } = runtime();
  const jsx = ctx.__kuitoJSX;
  const cleanups: string[] = [];
  let open!: Signal<boolean>;

  function Panel(props: Record<string, unknown>) {
    const name = String(props.name);

    ctx.__kuito.useLifecycle('cleanup', () => cleanups.push(name));

    return jsx('Text', { id: name, text: name });
  }

  ctx.__kuito.patch('panels', (api) => {
    open = api.state('open', true);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx(Panel, { name: 'kept' }),
        jsx('Show', { when: () => open.value }, jsx(Panel, { name: 'shown' })),
      ),
    );
  });

  open.value = false;
  await flushed();
  await replanned();

  assert.deepEqual(cleanups, ['shown']);
  assert.ok(ctx.__kuito.view('kept'));
});

test('a branch that cannot re-plan alone re-plans its module', async () => {
  const { context: ctx } = runtime();
  const jsx = ctx.__kuitoJSX;
  let open!: Signal<boolean>;
  let registrations = 0;

  ctx.__kuito.patch('fallback', (api) => {
    registrations++;
    open = api.state('open', false);

    const seen = registrations;

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Show', { when: () => open.value }, () => {
          // The branch the first registration built fails; the module's next one works.
          if (seen === 1) throw new Error('stale branch');

          return jsx('Text', { id: 'fresh', text: 'fresh' });
        }),
      ),
    );
  });

  open.value = true;
  await flushed();
  await replanned();

  assert.equal(registrations, 2, 'the module re-planned');
  assert.ok(ctx.__kuito.view('fresh'));
});
