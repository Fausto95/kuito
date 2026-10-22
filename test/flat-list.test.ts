import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { present } from './support/present.ts';
import { installKernel, type HostView } from './support/kuito-host.ts';
import { hosting, nativeEvent, type HostRecord, type KeyEdit } from './support/host-wire.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Compiles the fixture with the real compiler and runs it in a fresh kernel
 * whose host records views like a native renderer. The test plays the native
 * list: it decides which cell shows which key and asks JavaScript to bind it.
 */
async function run(fixture = 'test/fixtures/flat-list-app.tsx') {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-flat-list-'));
  const views = new Map<string, HostView>();
  const calls: string[][] = [];
  const structuredProps = new Set<string>();
  /** Each key diff a list received, by list. */
  const diffs = new Map<string, KeyEdit[][]>();
  const host = installKernel(
    hosting({
      commit(records: HostRecord[]) {
        records.forEach((record) => {
          if (record.op === 'prop' && record.structured)
            structuredProps.add(record.id + '.' + record.name);

          if (record.op === 'keys')
            diffs.set(record.id, [...(diffs.get(record.id) ?? []), record.edits]);
        });
      },
      createView(id: string, kind: string, parent: string) {
        assert.equal(views.has(id), false, `duplicate view ${id}`);
        if (parent) assert(views.has(parent), `parent ${parent} must exist before ${id}`);
        views.set(id, { kind, parent, props: {} });
        calls.push(['create', id]);
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
        calls.push(['prop', id, name]);
      },
      moveView(id: string) {
        calls.push(['move', id]);
      },
      removeView(id: string) {
        assert(
          ![...views.values()].some((view) => view.parent === id),
          `${id} is removed after its children`,
        );

        views.delete(id);
        calls.push(['remove', id]);
      },
    }),
  );

  try {
    const output = await createSourceCompiler({ platform: 'ios', outputDir: temp })(
      resolve(fixture),
    );

    runInNewContext(output.code, host);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }

  const view = (id: string) => present(views.get(id), id);
  const within = (ancestor: string, id: string): boolean => {
    const parent = views.get(id)?.parent;

    return !!parent && (parent === ancestor || within(ancestor, parent));
  };
  /** The labels a cell shows, in tree order. */
  const texts = (cell: string) =>
    [...views.entries()]
      .filter(([id, entry]) => entry.kind === 'Text' && within(cell, id))
      .map(([, entry]) => entry.props.text);
  const bind = (list: string, cell: string, key: string) =>
    nativeEvent(host.__kuito, `${list}.bind\u001f${JSON.stringify({ cell, key })}`);
  const press = async (id: string) => {
    nativeEvent(host.__kuito, id + '.press');
    await settle();
  };
  /** Host calls made by `action`. */
  const during = async (action: () => unknown) => {
    const start = calls.length;

    await action();
    await settle();

    return calls.slice(start);
  };
  const json = (id: string, prop: string): unknown => {
    const value = view(id).props[prop];

    assert.equal(typeof value, 'object', `${id}.${prop} crosses as plain data`);

    return value;
  };
  /** The keys a list shows, with every diff it received applied. */
  const keys = (id: string): string[] => {
    const value = view(id).props.keys;

    assert(Array.isArray(value), `${id} has keys`);

    return value.map(String);
  };
  /** The key diff a list received last. */
  const lastDiff = (id: string): KeyEdit[] => {
    const received = diffs.get(id) ?? [];

    assert(received.length > 0, `${id} received keys as a diff`);

    return received[received.length - 1];
  };

  return {
    host,
    views,
    calls,
    structuredProps,
    view,
    texts,
    bind,
    press,
    during,
    json,
    keys,
    lastDiff,
    within,
  };
}

test('List is a native List that receives row keys and renders no rows itself', async () => {
  const { views, view, json, keys } = await run();

  assert.equal(view('list').kind, 'List');
  assert.deepEqual(keys('list'), ['#header', 'a', 'b', '#footer']);
  assert.deepEqual(json('list', 'spanningKeys'), ['#header', '#footer']);
  assert.equal(view('list').props.initialScrollKey, 'b');
  assert.equal(view('list').props.automaticallyAdjustKeyboardInsets, false);

  assert.equal(
    [...views.values()].some((entry) => entry.parent === 'list'),
    false,
    'no row exists until the native list asks for one',
  );
});

test('a bind request renders that row into the cell the native list names', async () => {
  const { view, texts, bind } = await run();

  bind('list', 'list:cell-0', 'a');
  bind('list', 'list:cell-1', '#header');
  bind('list', 'list:cell-2', 'b');
  bind('list', 'list:cell-3', '#footer');
  await settle();

  assert.equal(view('list:cell-0').kind, 'ListCell');
  assert.equal(view('list:cell-0').parent, 'list');
  assert.equal(view('list:cell-0').props.cellKey, 'a');
  assert.deepEqual(texts('list:cell-0'), ['1. Alpha v1 ×0', '—']);
  assert.deepEqual(texts('list:cell-1'), ['Tracks']);
  assert.deepEqual(texts('list:cell-2'), ['2. Beta v1 ×0'], 'no separator after the last item');
  assert.deepEqual(texts('list:cell-3'), ['Ended 0']);
});

test('a bind for a key the data no longer has renders nothing', async () => {
  const { views, bind } = await run();

  bind('list', 'list:cell-0', 'gone');
  await settle();

  assert.equal(views.has('list:cell-0'), false);
});

test('rebinding a cell to another key updates its views in place', async () => {
  const { view, texts, bind, press, during } = await run();

  await press('add');
  bind('list', 'list:cell-0', 'a');

  const calls = await during(() => bind('list', 'list:cell-0', 'b'));

  assert.deepEqual(
    calls.filter(([op]) => op === 'create' || op === 'remove'),
    [],
    'the recycled cell keeps its native views',
  );

  assert.equal(view('list:cell-0').props.cellKey, 'b');
  assert.deepEqual(texts('list:cell-0'), ['2. Beta v1 ×0', '—']);
});

test("a row's component state belongs to its item, not to the recycled cell", async () => {
  const { views, texts, bind, press, within } = await run();

  bind('list', 'list:cell-0', 'a');

  const pressable = present(
    [...views.entries()].find(
      ([id, entry]) => entry.kind === 'Pressable' && within('list:cell-0', id),
    ),
    'row pressable',
  )[0];

  await press(pressable);
  assert.deepEqual(texts('list:cell-0'), ['1. Alpha v1 ×1', '—']);

  await press('edition');
  assert.deepEqual(texts('list:cell-0'), ['1. Alpha v2 ×1', '—'], 'kept while the item stays');

  bind('list', 'list:cell-0', 'b');
  await settle();
  assert.deepEqual(texts('list:cell-0'), ['2. Beta v2 ×0'], 'fresh for another item');
});

test('new data updates the keys and re-renders only the rows that changed', async () => {
  const { texts, bind, press, during, keys, lastDiff, within } = await run();

  bind('list', 'list:cell-0', 'a');
  bind('list', 'list:cell-1', 'b');

  const added = await during(() => press('add'));

  assert.deepEqual(keys('list'), ['#header', 'a', 'b', 'c', '#footer']);

  assert.deepEqual(
    lastDiff('list'),
    [{ op: 'insert', index: 3, key: 'c' }],
    'the list receives the new key, not every key',
  );

  assert.deepEqual(texts('list:cell-1'), ['2. Beta v1 ×0', '—'], 'no longer last');

  assert.equal(
    added.some(([, id]) => within('list:cell-0', id) || id === 'list:cell-0'),
    false,
    'an unchanged row is not touched',
  );

  const renamed = await during(() => press('rename'));

  assert.deepEqual(texts('list:cell-1'), ['2. Bravo v1 ×0', '—']);

  assert.equal(
    renamed.some(([, id]) => within('list:cell-0', id) || id === 'list:cell-0'),
    false,
  );
});

test('a signal the rows read re-renders the bound rows, and only those', async () => {
  const { views, texts, bind, press } = await run();

  bind('list', 'list:cell-0', 'a');
  await press('edition');

  assert.deepEqual(texts('list:cell-0'), ['1. Alpha v2 ×0', '—']);

  assert.equal(
    [...views.values()].filter((entry) => entry.kind === 'ListCell').length,
    1,
    'unbound items are never rendered',
  );
});

test('native end-reached reaches onReachEnd', async () => {
  const { host, texts, bind } = await run();

  bind('list', 'list:cell-0', '#footer');
  nativeEvent(host.__kuito, 'list.reachend');
  await settle();

  assert.deepEqual(texts('list:cell-0'), ['Ended 1']);
});

test('scrollToIndex asks the native list to scroll to the item by key', async () => {
  const { press, json, structuredProps, during } = await run();

  await press('jump');

  assert.ok(structuredProps.has('list.scrollTo'), 'the request crosses as plain data');

  assert.deepEqual(json('list', 'scrollTo'), {
    key: 'b',
    animated: true,
    align: 0.5,
    margin: 0,
    request: 1,
  });

  const again = await during(() => press('jump'));

  assert.ok(
    again.some(([op, id, name]) => op === 'prop' && id === 'list' && name === 'scrollTo'),
    'the same request again scrolls again',
  );
});

test('the native viewable range becomes the viewable items onViewableChange reports', async () => {
  const { host, view } = await run();
  const viewable = (first: string, last: string) =>
    nativeEvent(host.__kuito, `list.viewable\u001f${JSON.stringify({ first, last })}`);

  assert.equal(view('list').props.emitsViewable, true);
  assert.equal(view('list').props.viewableThreshold, 0.5, "viewability's threshold, a fraction");

  viewable('#header', 'b');
  await settle();
  assert.equal(view('seen').props.text, 'a@0,b@1 | a+,b+');

  viewable('b', '#footer');
  await settle();
  assert.equal(view('seen').props.text, 'b@1 | a-');
});

test('removing the list removes its rows and cells before the list', async () => {
  const { views, calls, bind, press } = await run();

  bind('list', 'list:cell-0', 'a');
  bind('list', 'list:cell-1', '#header');
  await press('hide');

  const removed = calls.filter(([op]) => op === 'remove').map(([, id]) => id);

  assert.equal(views.has('list'), false);
  assert.ok(removed.indexOf('list:cell-0') < removed.indexOf('list'));
  assert.ok(removed.indexOf('list:cell-1') < removed.indexOf('list'));

  assert.equal(
    [...views.values()].some((entry) => entry.kind === 'Text' && entry.props.text === 'Tracks'),
    false,
  );
});

test('a grid sends its columns and gap, spans its header and has no separators', async () => {
  const { view, texts, bind, json, keys } = await run('test/fixtures/flat-list-grid-app.tsx');

  assert.equal(view('grid').props.numColumns, 2);
  assert.equal(view('grid').props.gap, 8);
  assert.deepEqual(keys('grid'), ['#header', 'p1', 'p2', 'p3']);
  assert.deepEqual(json('grid', 'spanningKeys'), ['#header']);

  bind('grid', 'grid:cell-0', 'p1');
  bind('grid', 'grid:cell-1', '#header');
  await settle();

  assert.deepEqual(texts('grid:cell-0'), ['p1']);
  assert.deepEqual(texts('grid:cell-1'), ['Photos']);
});

test('a horizontal, inverted, empty list shows its empty component as a row', async () => {
  const { view, texts, bind, keys } = await run('test/fixtures/flat-list-grid-app.tsx');

  assert.equal(view('rail').kind, 'HorizontalList');
  assert.equal(view('rail').props.inverted, true);
  assert.deepEqual(keys('rail'), ['#empty']);

  bind('rail', 'rail:cell-0', '#empty');
  await settle();

  assert.deepEqual(texts('rail:cell-0'), ['Nothing yet']);
});

test('a row whose key leaves the data stops rendering, and comes back with it', async () => {
  const { views, texts, bind, press, keys } = await run('test/fixtures/flat-list-filter-app.tsx');

  bind('list', 'list:cell-0', 'all-a');
  bind('list', 'list:cell-1', 'all-b');
  await settle();

  await press('saved');
  assert.deepEqual(keys('list'), ['saved-a']);

  bind('list', 'list:cell-2', 'saved-a');
  await settle();

  assert.deepEqual(texts('list:cell-2'), ['a']);
  assert.equal(views.get('saved-a')?.parent, 'list:cell-2');
  assert.deepEqual(texts('list:cell-0'), [], 'a removed row renders nothing');

  // The native list still holds `all-a` in its cell and shows it without asking again.
  await press('all');

  assert.deepEqual(texts('list:cell-0'), ['a']);
  assert.equal(views.get('all-a')?.parent, 'list:cell-0');
});

test('duplicate item keys fail and name the key', async () => {
  await assert.rejects(run('test/fixtures/flat-list-duplicate-app.tsx'), /"a"/);
});

test('a row re-renders when a signal its renderItem or slot read changes, and no other row', async () => {
  const { texts, bind, press, during, within } = await run(
    'test/fixtures/flat-list-signals-app.tsx',
  );

  bind('list', 'list:cell-0', 'a');
  bind('list', 'list:cell-1', 'b');
  bind('list', 'list:cell-2', 'c');
  bind('list', 'list:cell-3', '#footer');
  await settle();

  assert.deepEqual(texts('list:cell-0'), ['★ a']);
  assert.deepEqual(texts('list:cell-3'), ['Done']);

  const picked = await during(() => press('pick-b'));

  assert.deepEqual(texts('list:cell-0'), ['a']);
  assert.deepEqual(texts('list:cell-1'), ['★ b']);

  assert.equal(
    picked.some(([, id]) => id === 'list:cell-2' || within('list:cell-2', id)),
    false,
    'a row that read the same signal to the same result is untouched',
  );

  await press('busy');
  assert.deepEqual(texts('list:cell-3'), ['Loading…']);
});

/** Binds each key to the cell of its position: `list:cell-<n>`. */
function bindAll(bind: (list: string, cell: string, key: string) => unknown, keys: unknown) {
  assert(Array.isArray(keys), 'the list sends its keys as an array');
  keys.forEach((key, position) => bind('list', 'list:cell-' + position, String(key)));
}

test('a field write on a store item is one prop write on one cell', async () => {
  const { host, texts, bind, press, during, keys, within } = await run(
    'test/fixtures/flat-list-store-app.tsx',
  );

  bindAll(bind, keys('list'));
  await settle();

  assert.deepEqual(texts('list:cell-3'), ['4. Beloved', 'not liked', 'off screen']);

  const before = host.__kuito.stats().total.sendPropCalls;
  const calls = await during(() => press('like'));

  assert.equal(host.__kuito.stats().total.sendPropCalls - before, 1);
  assert.equal(calls.length, 1);
  assert.equal(within('list:cell-3', calls[0][1]), true, 'the write lands in the liked row');
  assert.deepEqual(texts('list:cell-3'), ['4. Beloved', 'liked', 'off screen']);
});

test('a store list keys items by identity and follows pushes and reorders', async () => {
  const { texts, bind, press, during, keys, lastDiff, within } = await run(
    'test/fixtures/flat-list-store-app.tsx',
  );
  const first = keys('list');

  assert.equal(new Set(first).size, 6, 'each item has a key of its own');

  bindAll(bind, first);
  await settle();

  const pushed = await during(() => press('push'));
  const grown = keys('list');

  assert.deepEqual(grown.slice(0, 6), first, 'existing items keep their keys');
  assert.equal(grown.length, 7);
  assert.deepEqual(lastDiff('list'), [{ op: 'insert', index: 6, key: grown[6] }]);

  assert.equal(
    pushed.some(([op, id]) => op !== 'prop' || id !== 'list'),
    false,
    'a push sends the list its keys and touches no row',
  );

  await press('reverse');

  assert.deepEqual(keys('list'), [...grown].reverse(), 'a reorder moves the keys');

  assert.deepEqual(
    lastDiff('list').map(({ op }) => op),
    Array(6).fill('move'),
    'a reorder only moves keys',
  );

  assert.deepEqual(texts('list:cell-0'), ['7. Dune', 'not liked', 'off screen']);

  const replaced = await during(() => press('replace'));
  const now = keys('list');

  assert.notEqual(now[0], grown[6], 'a new object at an index is a new item');

  assert.equal(
    replaced.some(([, id]) => within('list:cell-1', id)),
    false,
    'the other rows are untouched',
  );
});

test('each row has a visible signal fed by the native viewable range', async () => {
  const { host, texts, bind, keys } = await run('test/fixtures/flat-list-store-app.tsx');
  const shown = keys('list');
  const viewable = (first: unknown, last: unknown) =>
    nativeEvent(host.__kuito, `list.viewable\u001f${JSON.stringify({ first, last })}`);

  bindAll(bind, shown);
  viewable(shown[1], shown[2]);
  await settle();

  assert.deepEqual(
    shown.map((_, position) => texts('list:cell-' + position)[2]),
    ['off screen', 'on screen', 'on screen', 'off screen', 'off screen', 'off screen'],
  );

  viewable(shown[2], shown[3]);
  await settle();

  assert.deepEqual(
    shown.map((_, position) => texts('list:cell-' + position)[2]),
    ['off screen', 'off screen', 'on screen', 'on screen', 'off screen', 'off screen'],
  );
});

test('sections add a header row before each run of items, which sticks', async () => {
  const { texts, bind, press, json, keys } = await run('test/fixtures/flat-list-sections-app.tsx');

  assert.deepEqual(keys('list'), ['#section:Abbey Road', 'a1', 'a2', '#section:Blue', 'b1']);

  assert.deepEqual(json('list', 'spanningKeys'), ['#section:Abbey Road', '#section:Blue']);
  assert.deepEqual(json('list', 'stickyKeys'), ['#section:Abbey Road', '#section:Blue']);

  bind('list', 'list:cell-0', '#section:Abbey Road');
  bind('list', 'list:cell-1', 'a1');
  bind('list', 'list:cell-2', 'a2');
  await settle();

  assert.deepEqual(texts('list:cell-0'), ['Abbey Road from a1']);
  assert.deepEqual(texts('list:cell-1'), ['a1', '—']);
  assert.deepEqual(texts('list:cell-2'), ['a2'], 'no separator after the last item of a section');

  await press('move');

  assert.deepEqual(keys('list'), ['#section:Abbey Road', 'a1', '#section:Blue', 'a2', 'b1']);

  assert.deepEqual(texts('list:cell-1'), ['a1'], 'a1 now ends its section');
  assert.deepEqual(texts('list:cell-2'), ['a2', '—']);
});

test('sticky sections need a vertical list that is not inverted', async () => {
  await assert.rejects(
    run('test/fixtures/flat-list-sections-horizontal-app.tsx'),
    /stickySections/,
  );
});

test('a list reports its visible rows only once something reads them', async () => {
  const quiet = await run('test/fixtures/flat-list-signals-app.tsx');

  quiet.bind('list', 'list:cell-0', 'a');
  await settle();
  assert.notEqual(quiet.view('list').props.emitsViewable, true, 'nobody reads visible');

  const watched = await run('test/fixtures/flat-list-store-app.tsx');

  assert.notEqual(watched.view('list').props.emitsViewable, true, 'no row rendered yet');

  watched.bind('list', 'list:cell-0', watched.keys('list')[0]);
  await settle();
  assert.equal(watched.view('list').props.emitsViewable, true, 'a row read visible');
});
