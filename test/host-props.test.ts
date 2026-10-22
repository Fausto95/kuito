import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { runInContext } from 'node:vm';
import { flushed, installKernel, type Signal } from './support/kuito-host.ts';
import { hosting, type HostRecord } from './support/host-wire.ts';

/**
 * A kernel whose host keeps every prop record it receives, and counts the
 * JSON work the kernel does in its own realm.
 */
function make() {
  const records: HostRecord[] = [];
  const host = installKernel(
    hosting({
      commit(batch: HostRecord[]) {
        records.push(...batch.filter((record) => record.op === 'prop' || record.op === 'keys'));
      },
    }),
  );

  runInContext(
    `globalThis.__json = { parse: 0, stringify: 0 };
    const { parse, stringify } = JSON;
    JSON.parse = function (...args) { __json.parse++; return parse.apply(JSON, args); };
    JSON.stringify = function (...args) { __json.stringify++; return stringify.apply(JSON, args); };`,
    host,
  );

  /** What `action` sent, and the JSON calls it made. */
  const during = async (action: () => unknown) => {
    const start = records.length;
    const json = { ...(runInContext('__json', host) as { parse: number; stringify: number }) };

    action();
    await flushed();

    const now = runInContext('__json', host) as { parse: number; stringify: number };

    return {
      sent: records.slice(start),
      parses: now.parse - json.parse,
      stringifies: now.stringify - json.stringify,
    };
  };

  return { jsx: host.__kuitoJSX, kuito: host.__kuito, during };
}

test('an object prop rebuilt equal to the one sent sends nothing; a changed one crosses as data', async () => {
  const { jsx, kuito, during } = make();
  let label: Signal<string> | undefined;

  kuito.patch('player', (api) => {
    const signal = api.state('label', 'Skip intro');

    label = signal;

    api.render(
      jsx('Pressable', {
        id: 'play',
        actions: () => [{ name: 'activate' }, { name: 'skip', label: signal.value.trim() }],
      }),
    );
  });

  assert(label);

  const state = label;
  const same = await during(() => (state.value = 'Skip intro '));

  assert.deepEqual(same, { sent: [], parses: 0, stringifies: 0 });

  const edited = await during(() => (state.value = 'Skip'));

  assert.deepEqual(
    edited.sent.map((record) => record.op === 'prop' && record.value),
    [[{ name: 'activate' }, { name: 'skip', label: 'Skip' }]],
  );

  assert.equal(edited.stringifies, 0, 'a changed object crosses as plain data, never as JSON');
});

test('one key edited in 10k sends one edit, with no JSON either way', async () => {
  const { jsx, kuito, during } = make();
  const keys = Array.from({ length: 10_000 }, (_, index) => 'row-' + index);
  let rows: Signal<string[]> | undefined;

  kuito.patch('feed', (api) => {
    const signal = api.state('rows', keys);

    rows = signal;
    api.render(jsx('List', { id: 'list', keys: () => signal.value }));
  });

  assert(rows);

  const state = rows;
  const same = await during(() => (state.value = keys.slice()));

  assert.deepEqual(same, { sent: [], parses: 0, stringifies: 0 });

  const renamed = keys.slice();

  renamed[5_000] = 'row-new';

  const edited = await during(() => (state.value = renamed));

  assert.deepEqual(
    edited.sent.map((record) => record.op === 'keys' && record.edits),
    [
      [
        { op: 'remove', index: 5_000, key: 'row-5000' },
        { op: 'insert', index: 5_000, key: 'row-new' },
      ],
    ],
  );

  assert.equal(edited.parses, 0, 'the previous keys are not parsed back');
  assert.equal(edited.stringifies, 0, 'keys cross as edits, not JSON');
});

test('a rejected commit of 50 props leaves the props sent before it', async () => {
  const records: HostRecord[] = [];
  let reject = false;
  const host = installKernel(
    hosting({
      commit(batch: HostRecord[]) {
        if (reject) throw new Error('rejected');

        records.push(...batch.filter((record) => record.op === 'prop'));
      },
    }),
  );
  const render = (value: string) => {
    const props: Record<string, unknown> = { id: 'card' };

    for (let index = 0; index < 50; index++) props['p' + index] = { value };

    host.__kuito.patch('card', (api) => api.render(host.__kuitoJSX('VStack', props)));
  };

  render('sent');
  reject = true;
  assert.throws(() => render('rejected'), /rejected/);
  reject = false;
  records.length = 0;

  render('sent');
  await flushed();

  assert.deepEqual(
    records,
    [],
    'the props sent before the rejected commit are still the last sent',
  );

  render('rejected');
  await flushed();
  assert.equal(records.length, 50);
});
