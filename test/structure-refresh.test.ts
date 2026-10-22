import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import {
  installKernel,
  type HostView,
  type Ref,
  type Signal,
  type KuitoJSX,
} from './support/kuito-host.ts';
import { arrayWork } from './support/array-work.ts';
import { hosting } from './support/host-wire.ts';

// Kernel errors come from the vm realm, so they are matched by shape.
type KernelError = { code?: string; message: string };

function create() {
  const nodes = new Map<string, HostView>(),
    operations: unknown[][] = [];
  /** What a test watches beyond the recorded operations. */
  const hooks: {
    created?: (id: string) => void;
    moved?: (id: string, parent: string, index: number) => void;
  } = {};
  const context = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        assert.ok(!nodes.has(id), 'duplicate native view ' + id);
        assert.ok(!parent || nodes.has(parent), 'parent exists for ' + id);
        nodes.set(id, { kind, parent, props: {} });
        operations.push(['create', id, kind]);
        hooks.created?.(id);
      },
      moveView(id: string, parent: string, index: number) {
        operations.push(['move', id, parent, index]);
        hooks.moved?.(id, parent, index);
      },
      setProp(id: string, key: string, value: unknown) {
        assert.ok(nodes.has(id), 'existing native view for ' + id);
        present(nodes.get(id), id).props[key] = value;
        operations.push(['prop', id, key, value]);
      },
      removeView(id: string) {
        assert.ok(nodes.has(id), 'removed native view must exist');
        assert.ok(![...nodes.values()].some((x) => x.parent === id), 'children removed first');
        nodes.delete(id);
        operations.push(['remove', id]);
      },
    }),
  );

  const jsx = context.__kuitoJSX;
  const render = (children: unknown) =>
    context.__kuito.patch('app', (api) => api.render(jsx('VStack', { id: 'root' }, children)));

  return { context, jsx, nodes, operations, render, hooks };
}

const text = (jsx: KuitoJSX, key: string, value: string) => jsx('Text', { key, text: value });

test('adding a new sibling preserves the previous state and keeps app responsive', () => {
  const s = create();

  s.render([text(s.jsx, 'first', 'One')]);

  const before = [...s.nodes.keys()];

  s.render([text(s.jsx, 'first', 'One'), text(s.jsx, 'second', 'Two')]);
  assert.equal(s.nodes.size, 3);
  assert.ok(before.every((id) => s.nodes.has(id)));
  assert.equal(s.context.__kuito.revision('app'), 2);
});

test('inserting before a sibling moves the new view into place, remounting nothing', () => {
  const s = create();

  s.render([text(s.jsx, 'a', 'A'), text(s.jsx, 'b', 'B')]);

  const original = [...s.nodes.keys()];

  s.render([text(s.jsx, 'new', 'N'), text(s.jsx, 'a', 'A'), text(s.jsx, 'b', 'B')]);
  assert.equal(s.nodes.size, 4);
  assert.ok(original.every((id) => s.nodes.has(id)));
  assert.ok(!s.operations.some((x) => x[0] === 'remove'));
  assert.ok(s.operations.some((x) => x[0] === 'move'));
  assert.equal(s.context.__kuito.revision('app'), 2);
});

test('removing middle child leaves valid native topology', () => {
  const s = create();

  s.render([text(s.jsx, 'a', 'A'), text(s.jsx, 'b', 'B'), text(s.jsx, 'c', 'C')]);
  s.render([text(s.jsx, 'a', 'A'), text(s.jsx, 'c', 'C')]);
  assert.equal(s.nodes.size, 3);
  assert.equal([...s.nodes.values()].filter((x) => x.kind === 'Text').length, 2);
});

test('retyping a native node remounts it instead of rejecting patch', () => {
  const s = create();
  const id = 'same';

  s.render(s.jsx('Text', { id, text: 'A' }));
  s.render(s.jsx('Button', { id, text: 'A' }));
  assert.equal(s.nodes.get(id)?.kind, 'Button');
  assert.equal(s.context.__kuito.revision('app'), 2);
});

test('Fragment does not create wrapper native view', () => {
  const s = create();

  s.render(s.jsx('Fragment', {}, text(s.jsx, 'a', 'A'), text(s.jsx, 'b', 'B')));
  assert.equal(s.nodes.size, 3);
  assert.equal([...s.nodes.values()].filter((v) => v.kind === 'Fragment').length, 0);
});

test('duplicate sibling keys are diagnosed before native mutations', () => {
  const s = create();
  const count = s.operations.length;

  assert.throws(
    () => s.render([text(s.jsx, 'same', 'A'), text(s.jsx, 'same', 'B')]),
    (error: KernelError) => error.code === 'DUPLICATE_KEY' && /unique keys/.test(error.message),
  );

  assert.equal(s.operations.length, count);
});

test('indexed native move preserves existing view identities across insertion and reorder', () => {
  const s = create();
  const moves: { id: string; parent: string; index: number }[] = [];
  const order: string[] = [];

  s.hooks.moved = (id, parent, index) => {
    moves.push({ id, parent, index });

    const old = order.indexOf(id);

    if (old !== -1) order.splice(old, 1);
    order.splice(index, 0, id);
  };

  const a = text(s.jsx, 'a', 'A'),
    b = text(s.jsx, 'b', 'B'),
    c = text(s.jsx, 'c', 'C');

  s.render([a, b, c]);

  const ids = [...s.nodes.keys()].filter((x) => x !== 'root');

  order.push(...ids);

  const removedBefore = s.operations.filter((x) => x[0] === 'remove').length;
  const inserted = text(s.jsx, 'new', 'X');
  // A created view lands after its parent's other children.

  s.hooks.created = (id) => order.push(id);

  s.render([c, inserted, b, a]);

  const xID = present(
    [...s.nodes.keys()].find((id) => s.nodes.get(id)?.props.text === 'X'),
    'inserted view',
  );

  assert.ok(
    ids.every((id) => s.nodes.has(id)),
    'original native nodes survive',
  );

  assert.equal(s.operations.filter((x) => x[0] === 'remove').length, removedBefore);
  assert.equal(s.nodes.size, 5);
  assert.deepEqual(order, [ids[2], xID, ids[1], ids[0]]);
  assert.ok(moves.length > 0);
});

test('inserting onMount above a signal() keeps its value', () => {
  const s = create();
  const kuito = s.context.__kuito;
  let count!: Signal<number>;
  // Both versions are the component Counter, as a Live Patch delivers it.
  const version = (withMount: boolean) =>
    function Counter() {
      if (withMount) kuito.useLifecycle('mount', () => {}, undefined, undefined, '#1');

      count = kuito.useState(0, 'count');

      return s.jsx('Text', { id: 'label', text: () => String(count.value) });
    };

  s.render(s.jsx(version(false), {}));

  count.value = 5;

  s.render(s.jsx(version(true), {}));

  assert.equal(count.value, 5, 'an accepted patch keeps the state value');
  assert.equal(s.nodes.get('label')?.props.text, '5');
});

test('a hook of another kind added above a signal() leaves its slot alone', () => {
  const s = create();
  const kuito = s.context.__kuito;
  let count!: Signal<number>;
  let withEffect = false;

  function Counter() {
    if (withEffect) kuito.useLifecycle('effect', () => {});

    count = kuito.useState(0);

    return s.jsx('Text', { id: 'label', text: () => String(count.value) });
  }

  s.render(s.jsx(Counter, {}));
  count.value = 5;
  withEffect = true;
  s.render(s.jsx(Counter, {}));

  assert.equal(count.value, 5);
  assert.equal(s.nodes.get('label')?.props.text, '5');
});

test('adding a signal() above another keeps its value across a patch', () => {
  const s = create();
  const kuito = s.context.__kuito;
  let count!: Signal<number>;
  let label = null as Signal<string> | null;
  let withLabel = false;

  function Counter() {
    label = withLabel ? kuito.useState('fresh', 'label') : null;
    count = kuito.useState(0, 'count');

    return s.jsx('Text', { id: 'label', text: () => String(count.value) });
  }

  s.render(s.jsx(Counter, {}));
  count.value = 5;
  withLabel = true;
  s.render(s.jsx(Counter, {}));

  assert.equal(count.value, 5);
  assert.equal(present(label, 'label').value, 'fresh');
  assert.equal(s.nodes.get('label')?.props.text, '5');
});

test('reordering signal() calls keeps each value with its name', () => {
  const s = create();
  const kuito = s.context.__kuito;
  const values: Record<string, Signal<number>> = {};
  let swapped = false;

  function Pair() {
    const names = swapped ? ['b', 'a'] : ['a', 'b'];

    names.forEach((name) => (values[name] = kuito.useState(0, name)));

    return s.jsx('Text', { id: 'pair', text: 'pair' });
  }

  s.render(s.jsx(Pair, {}));
  present(values.a, 'a').value = 1;
  present(values.b, 'b').value = 2;
  swapped = true;
  s.render(s.jsx(Pair, {}));

  assert.equal(present(values.a, 'a').value, 1);
  assert.equal(present(values.b, 'b').value, 2);
});

test('a signal() inside an if gets its own key and starts over when it returns', () => {
  const s = create();
  const kuito = s.context.__kuito;
  let count!: Signal<number>;
  let extra = null as Signal<number> | null;
  let show = true;

  function Counter() {
    if (show) extra = kuito.useState(1, 'extra');

    count = kuito.useState(0, 'count');

    return s.jsx('Text', { id: 'label', text: 'counter' });
  }

  s.render(s.jsx(Counter, {}));

  const first = present(extra, 'extra');

  first.value = 9;
  count.value = 5;
  show = false;
  s.render(s.jsx(Counter, {}));
  assert.equal(count.value, 5, 'the other state keeps its value');

  show = true;
  s.render(s.jsx(Counter, {}));

  const second = present(extra, 'extra');

  assert.notStrictEqual(second, first, 'a removed slot is released');
  assert.equal(second.value, 1);
  assert.equal(count.value, 5);
});

test('unnamed hooks of one kind take ordinals, and a repeated name its own slot', () => {
  const s = create();
  const kuito = s.context.__kuito;
  const signals: Signal<number>[] = [];

  function Twice() {
    signals.length = 0;
    signals.push(kuito.useState(1, 'n'), kuito.useState(2, 'n'), kuito.useState(3));

    return s.jsx('Text', { id: 'twice', text: 'twice' });
  }

  s.render(s.jsx(Twice, {}));
  signals.forEach((signal) => (signal.value *= 10));
  s.render(s.jsx(Twice, {}));

  assert.deepEqual(
    signals.map((signal) => signal.value),
    [10, 20, 30],
  );
});

test('a removed lifecycle hook is disposed by the next patch', () => {
  const s = create();
  const kuito = s.context.__kuito;
  const cleaned: string[] = [];
  let hooks = true;

  function Watcher() {
    if (hooks) {
      kuito.useLifecycle('mount', () => () => cleaned.push('mount'), undefined, undefined, '#1');
      kuito.useLifecycle('effect', () => () => cleaned.push('effect'), undefined, undefined, '#1');
    }

    return s.jsx('Text', { id: 'watcher', text: 'watcher' });
  }

  s.render(s.jsx(Watcher, {}));
  hooks = false;
  s.render(s.jsx(Watcher, {}));

  assert.deepEqual(cleaned.sort(), ['effect', 'mount']);
});

test('a Live Patch that adds or removes hooks names them in a warning', () => {
  const warnings: string[] = [];
  const s = create();

  Object.assign(s.context, {
    __kuitoHostLog: (level: string, message: string) => {
      if (level === 'warn') warnings.push(message);
    },
  });

  const kuito = s.context.__kuito;
  const patch = (withLabel: boolean) =>
    kuito.patch('app', (api) => {
      function Counter() {
        if (withLabel) kuito.useState('', 'label');
        else kuito.useLifecycle('effect', () => {}, undefined, undefined, '#1');

        kuito.useState(0, 'count');

        return s.jsx('Text', { id: 'label', text: 'counter' });
      }

      api.render(s.jsx('VStack', { id: 'root' }, s.jsx(Counter, {})));
    });

  patch(false);
  patch(true);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Counter/);
  assert.match(warnings[0], /added state label/);
  assert.match(warnings[0], /removed effect #1/);
});

test('a reorder moves only the views outside the longest run kept in order', () => {
  const s = create();
  const moved: string[] = [];

  s.hooks.moved = (id) => moved.push(id);

  const views = ['a', 'b', 'c', 'd', 'e'].map((key) => text(s.jsx, key, key.toUpperCase()));

  s.render(views);

  const ids = new Map([...s.nodes].map(([id, view]) => [view.props.text, id]));

  // Rotating left keeps B..E in order: only A moves.
  s.render([...views.slice(1), views[0]]);

  assert.deepEqual(moved, [ids.get('A')]);
});

test('an element lists its children in their sibling order after a reorder', () => {
  const s = create();
  const kuito = s.context.__kuito;
  let root!: Ref;

  const render = (keys: string[]) =>
    kuito.patch('app', (api) => {
      function App() {
        root = kuito.useRef('root');

        return s.jsx(
          'VStack',
          { id: 'root', ref: root },
          keys.map((key) => s.jsx('Text', { key, id: 'text-' + key, text: key })),
        );
      }

      api.render(s.jsx(App, {}));
    });

  render(['a', 'b', 'c']);
  render(['c', 'a', 'b']);

  const element = present(root.current, 'root element');

  assert.deepEqual(
    Array.from(element.children, (child) => child.id),
    ['text-c', 'text-a', 'text-b'],
  );
});

/** A list of `size` keyed rows, on a host that only counts what it is asked to do. */
function rows(size: number) {
  const counts = { create: 0, move: 0, remove: 0 };
  const context = installKernel(
    hosting({
      createView: () => counts.create++,
      moveView: () => counts.move++,
      setProp() {},
      removeView: () => counts.remove++,
    }),
  );
  const jsx = context.__kuitoJSX;
  const keys = Array.from({ length: size }, (_, index) => 'row' + index);
  const render = (shown: string[]) =>
    context.__kuito.patch('app', (api) =>
      api.render(
        jsx(
          'VStack',
          { id: 'root' },
          shown.map((key) => text(jsx, key, key)),
        ),
      ),
    );

  render(keys);
  Object.assign(counts, { create: 0, move: 0, remove: 0 });

  return {
    counts,
    keys,
    /** Render `shown` and return the array work it took the kernel. */
    render: (shown: string[]) => arrayWork(() => render(shown), context),
  };
}

test('reversing 10k rows moves all but one, with array work linear in their count', () => {
  const reverse = (size: number) => {
    const list = rows(size);
    const work = list.render(list.keys.slice().reverse());

    return { counts: list.counts, work };
  };
  const large = reverse(10_000);

  assert.deepEqual(large.counts, { create: 0, move: 9_999, remove: 0 });

  const growth = large.work / reverse(2_500).work;

  assert.ok(growth < 6, `4x the rows took ${growth.toFixed(1)}x the array work`);
});

test('removing every other of 10k rows removes each once, with array work linear in their count', () => {
  const everyOther = (size: number) => {
    const list = rows(size);
    const work = list.render(list.keys.filter((_, index) => index % 2 === 0));

    return { counts: list.counts, work };
  };
  const large = everyOther(10_000);

  assert.deepEqual(large.counts, { create: 0, move: 0, remove: 5_000 });

  const growth = large.work / everyOther(2_500).work;

  assert.ok(growth < 6, `4x the rows took ${growth.toFixed(1)}x the array work`);
});
