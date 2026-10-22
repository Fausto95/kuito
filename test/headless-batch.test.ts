import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeBatch, replayBatches } from '../src/tests/batch.ts';
import { Native } from '../src/tests/wasm.ts';
import { installKernel } from './support/kuito-host.ts';

// The kernel's batches as the shells decode and check them: native/shared's
// Wire.h and ViewTable, in the headless host's WebAssembly module.

const noMeasure = () => {
  throw new Error('nothing is measured here');
};

/** The batches a kernel commits while `render` runs, as `__kuitoHostCommit` receives them. */
function batchesOf(render: (host: ReturnType<typeof installKernel>) => void) {
  const batches: { buffer: ArrayBuffer; length: number; strings: string[] }[] = [];
  const host = installKernel({
    // Registers a module view's kind.
    __kuitoHostCall: () => null,
    __kuitoHostCommit(buffer: ArrayBuffer, length: number, strings: string[]) {
      batches.push({ buffer: buffer.slice(0, length), length, strings: [...strings] });
    },
  });

  render(host);

  return batches;
}

test('a batch decodes to typed mutations, as a shell receives them', () => {
  const [batch] = batchesOf((host) =>
    host.__kuito.patch('card', (api) =>
      api.render(
        host.__kuitoJSX(
          'VStack',
          { id: 'card', padding: 12, backgroundColor: '#ff000080', alignItems: 'center' },
          host.__kuitoJSX('Text', { id: 'title', text: 'Hello' }),
        ),
      ),
    ),
  );
  const native = new Native(noMeasure);
  const mutations = decodeBatch(native, batch.buffer, batch.length, batch.strings);
  const card = mutations.find((m) => m.op === 'create' && m.label === 'card');

  assert.ok(card && card.op === 'create');

  assert.deepEqual(card, {
    op: 'create',
    id: card.id,
    parent: 0,
    kind: 'VStack',
    label: 'card',
    flattened: false,
  });

  const props = mutations.filter((m) => m.op === 'prop' && m.id === card.id);

  assert.deepEqual(
    props.map((m) => (m.op === 'prop' ? [m.name, m.type, m.value] : null)),
    [
      ['padding', 'number', 12],
      ['backgroundColor', 'color', 0xff000080],
      ['alignItems', 'enum', 'center'],
    ],
  );

  assert.ok(
    mutations.some(
      (m) => m.op === 'prop' && m.name === 'text' && m.type === 'text' && m.value === 'Hello',
    ),
  );
});

test('a structured prop takes a count or an object, each laid out by its schema', () => {
  const [batch] = batchesOf((host) =>
    host.__kuito.patch('notes', (api) =>
      api.render(
        host.__kuitoJSX(
          'VStack',
          { id: 'notes' },
          host.__kuitoJSX('TextField', { id: 'fixed', lines: 3 }),
          host.__kuitoJSX('TextField', { id: 'growing', lines: { min: 1, max: 4 } }),
        ),
      ),
    ),
  );
  const mutations = decodeBatch(new Native(noMeasure), batch.buffer, batch.length, batch.strings);
  const lines = mutations.flatMap((m) =>
    m.op === 'prop' && m.name === 'lines' ? [[m.type, m.value]] : [],
  );

  assert.deepEqual(lines, [
    ['struct', 3],
    ['struct', { min: 1, max: 4 }],
  ]);
});

test("a module view's own props cross by name, its common ones by key", () => {
  const [batch] = batchesOf((host) => {
    // A module view whose `type` and `disabled` mean what its module says, not a TextField's.
    const Picker = host.__kuito.linkView(1, 'Picker', ['change'], {});

    host.__kuito.patch('picker', (api) =>
      api.render(
        host.__kuitoJSX(Picker, { id: 'picker', type: 'time', disabled: true, height: 44 }),
      ),
    );
  });
  const mutations = decodeBatch(new Native(noMeasure), batch.buffer, batch.length, batch.strings);
  const props = mutations.flatMap((m) => (m.op === 'prop' ? [[m.name, m.type, m.value]] : []));

  assert.deepEqual(props, [
    ['type', 'text', 'time'],
    ['disabled', 'boolean', true],
    ['height', 'number', 44],
  ]);
});

test('a batch a shell would reject throws its message, and the views stay as they were', () => {
  const [batch] = batchesOf((host) =>
    host.__kuito.patch('one', (api) => api.render(host.__kuitoJSX('Box', { id: 'one' }))),
  );
  const native = new Native(noMeasure);

  decodeBatch(native, batch.buffer, batch.length, batch.strings);

  assert.throws(
    () => decodeBatch(native, batch.buffer, batch.length, batch.strings),
    /KUITO_VIEW_DUPLICATE: one \(view 1\) already exists/,
    'the same views again',
  );

  assert.throws(
    () => decodeBatch(native, new Uint8Array([99]).buffer, 1, []),
    /KUITO_WIRE_OP: unknown operation 99/,
  );
});

test('a recording replays as its batches of view mutations, without the UI thread’s', () => {
  const native = new Native(noMeasure);
  const batches = replayBatches(native, readFileSync('test/fixtures/headless/reel-discover.krec'));
  const mutations = batches.flatMap((batch) => batch.mutations);

  assert.ok(batches.length > 10);

  const first = mutations.find((m) => m.op === 'create');

  assert.ok(first?.op === 'create');
  assert.deepEqual([first.id, first.parent, first.kind], [1, 0, 'NavigationStack']);
  assert.ok(mutations.every((m) => m.op !== 'ui' && m.op !== 'uiScript'));

  assert.ok(
    batches.every((batch, index) => index === 0 || batch.ms >= (batches[index - 1]?.ms ?? 0)),
  );

  assert.throws(
    () => replayBatches(native, new TextEncoder().encode('nope')),
    /not a Kuito recording/,
  );
});
