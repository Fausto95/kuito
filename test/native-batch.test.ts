import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  flushed,
  installKernel,
  type PatchApi,
  type Signal,
  type KuitoElement,
} from './support/kuito-host.ts';
import { hosting, nativeEvent, type HostRecord } from './support/host-wire.ts';

test('the native batch decodes typed records, validates them whole and keeps structural order', (t) => {
  const compiler = process.env.CXX || 'c++';
  const check = spawnSync(compiler, ['--version'], { encoding: 'utf8' });

  const probe: NodeJS.ErrnoException | undefined = check.error;

  if (probe?.code === 'ENOENT') return t.skip('C++ toolchain unavailable');

  const folder = mkdtempSync(join(tmpdir(), 'kuito-native-batch-'));

  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const program = join(folder, 'kuito-batch');
    const build = spawnSync(
      compiler,
      [
        '-std=c++17',
        '-Wall',
        '-Wextra',
        '-Werror',
        // CHECK, unlike assert, still checks in a release build.
        '-DNDEBUG',
        '-I',
        join(root, 'native/shared'),
        '-I',
        join(root, 'test/support'),
        join(root, 'test/native-batch.cpp'),
        join(root, 'native/shared/ViewTable.cpp'),
        '-o',
        program,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(build.status, 0, build.stderr || build.error?.message);

    const run = spawnSync(program, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /KUITO_MUTATION_BATCH_PASS/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a host throw mid-commit keeps the previous module and its subscriptions', async () => {
  const props = new Map<string, unknown>();
  let failOn: string | null = null;
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp(id: string, name: string, value: unknown) {
        if (id === failOn) throw new Error('host rejected ' + id + '.' + name);

        props.set(id + '.' + name, value);
      },
      removeView() {},
    }),
  );
  const kuito = kernel.__kuito;
  const jsx = kernel.__kuitoJSX;
  const pressed: string[] = [];
  let count!: Signal<number>;
  const register = (version: string) => (api: PatchApi) => {
    count = api.state('count', 0);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Text', { id: 'label', text: () => String(count.value) }),
        jsx('Button', { id: 'save', text: version, onPress: () => pressed.push(version) }),
      ),
    );
  };

  kuito.patch('form', register('old'));
  failOn = 'save';
  assert.throws(() => kuito.patch('form', register('new')), /host rejected save/);
  failOn = null;

  assert.equal(kuito.revision('form'), 1, 'modules[id] is still the previous record');

  nativeEvent(kuito, 'save.press');
  assert.deepEqual(pressed, ['old'], 'the previous handler still answers');

  count.value = 2;
  await flushed();
  assert.equal(props.get('label.text'), '2', 'the previous binding still updates');

  kuito.dispose('form');
  assert.equal(count.listenerCount, 0, 'disposing the module releases every subscription');
});

test('a commit reaches the host as one batch; a rejected batch is forgotten whole', () => {
  const batches: string[][] = [];
  let failOn: string | null = null;
  const kernel = installKernel(
    hosting({
      commit(records) {
        batches.push(records.map((record) => record.op + ('id' in record ? ' ' + record.id : '')));

        if (records.some((record) => record.op === 'create' && record.id === failOn))
          throw new Error('host rejected ' + failOn);
      },
    }),
  );
  const kuito = kernel.__kuito;
  const jsx = kernel.__kuitoJSX;
  const register = (extra: boolean) => (api: PatchApi) =>
    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Button', { id: 'save', text: 'save' }),
        extra ? jsx('Text', { id: 'extra', text: 'new' }) : null,
      ),
    );

  kuito.patch('form', register(false));
  assert.equal(batches.length, 1, 'one host call for the whole first render');
  assert.deepEqual(batches[0].slice(0, 3), ['create root', 'create save', 'prop save']);

  batches.length = 0;
  failOn = 'extra';
  assert.throws(() => kuito.patch('form', register(true)), /host rejected extra/);

  assert.deepEqual(batches, [['create extra', 'prop extra']]);
  assert.equal(kuito.view('extra'), null, 'the kernel forgets a view the host dropped');
  assert.equal(kuito.view('save')?.kind, 'Button');

  failOn = null;
  batches.length = 0;
  kuito.patch('form', register(true));
  assert.deepEqual(batches, [['create extra', 'prop extra']], 'the next commit sends it again');
});

/** A kernel whose host records each batch it receives, decoded. */
function recording() {
  const batches: HostRecord[][] = [];
  const kernel = installKernel(
    hosting({
      commit(records) {
        batches.push(records);
      },
      __kuitoHostMotionRead: () => '',
    }),
  );

  return { kernel, batches, kuito: kernel.__kuito, jsx: kernel.__kuitoJSX };
}

test('what an event changes reaches the host in one batch', async () => {
  const { batches, kuito, jsx } = recording();
  let first!: Signal<number>;
  let second!: Signal<number>;

  kuito.patch('counter', (api) => {
    first = api.state('first', 0);
    second = api.state('second', 0);

    api.render(
      jsx(
        'VStack',
        { id: 'root' },
        jsx('Text', { id: 'a', text: () => String(first.value) }),
        jsx('Text', { id: 'b', text: () => String(second.value) }),
        jsx('Button', {
          id: 'both',
          text: 'both',
          onPress: () => {
            first.value++;
            second.value++;
          },
        }),
      ),
    );
  });

  batches.length = 0;

  nativeEvent(kuito, 'both.press');

  assert.equal(batches.length, 1, 'one host call for the event');

  assert.deepEqual(
    batches[0].map((record) =>
      record.op === 'prop' ? [record.id, record.name, record.value] : null,
    ),
    [
      ['a', 'text', '1'],
      ['b', 'text', '1'],
    ],
  );

  // Writes outside any event or commit go together on the next microtask.
  first.value = 5;
  second.value = 5;
  assert.equal(batches.length, 1);
  await flushed();
  assert.equal(batches.length, 2);
  assert.equal(batches[1].length, 2);
});

test('values cross typed: numbers as numbers, flags as flags, objects as plain data', () => {
  const { batches, kuito, jsx } = recording();

  kuito.patch('typed', (api) =>
    api.render(
      jsx('Box', {
        id: 'box',
        opacity: 0.5,
        hidden: true,
        hitArea: 4,
        backgroundGradient: { angle: 90, colors: ['#000000', '#ffffff'] },
      }),
    ),
  );

  const props = Object.fromEntries(
    batches.flat().flatMap((record) => (record.op === 'prop' ? [[record.name, record.value]] : [])),
  );

  assert.equal(props.opacity, 0.5);
  assert.equal(props.hidden, true);

  assert.deepEqual(props.backgroundGradient, {
    angle: 90,
    colors: ['#000000', '#ffffff'],
  });
});

test('plain data crosses as JSON would hold it, with no JSON made', () => {
  const { batches, kuito, jsx } = recording();
  let box: { current: KuitoElement | null } = { current: null };

  function Card() {
    box = kuito.useRef();

    return jsx('Box', { id: 'box', ref: box });
  }

  kuito.patch('data', (api) => api.render(jsx(Card, {})));

  const before = kuito.stats().total.bytesStringified;

  // A ref writes past the planner's checks: the batch itself drops an
  // undefined field and writes a number JSON cannot hold as null.
  // A hole is null too, and the list keeps its count.
  const colors: unknown[] = ['#000000', undefined];

  colors[3] = '#ffffff';
  box.current?.setProperty('backgroundGradient', { angle: NaN, colors, extra: undefined });

  const written = batches
    .flat()
    .flatMap((record) =>
      record.op === 'prop' && record.name === 'backgroundGradient' ? [record] : [],
    );

  assert.deepEqual(
    written.map((record) => record.op === 'prop' && [record.value, record.structured]),
    [[{ angle: null, colors: ['#000000', null, null, '#ffffff'] }, true]],
  );

  assert.equal(kuito.stats().total.bytesStringified, before, 'and no JSON made for it');
});

test('UI-thread operations ride the commit batch, after the views they name', () => {
  const { batches, kuito, jsx, kernel } = recording();
  const threads = kernel as unknown as { __kuito: { useMotion(initial: number): unknown } };

  function Card() {
    const offset = threads.__kuito.useMotion(0);

    return jsx('Box', { id: 'card', translateY: () => offset });
  }

  kuito.patch('motion', (api) => api.render(jsx(Card, {})));

  assert.equal(batches.length, 1);

  const ops = batches[0].map((record) => record.op);

  assert.ok(ops.indexOf('create') < ops.indexOf('ui'), ops.join(' '));
  assert.equal(ops[ops.length - 1], 'ui');
});
