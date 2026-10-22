import { test } from 'vite-plus/test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { flushed, installKernel, type Signal } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

test('two writes in one kernel handler run a dependent effect once, with both values', () => {
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
    }),
  );
  const kuito = kernel.__kuito;
  const runs: number[][] = [];

  function Pair() {
    const a = kuito.useState(0);
    const b = kuito.useState(0);

    kuito.useLifecycle('effect', () => {
      runs.push([a.value, b.value]);
    });

    return kernel.__kuitoJSX('Button', {
      id: 'both',
      onPress: () => {
        a.value = 1;
        b.value = 1;
      },
    });
  }

  kuito.patch('pair', (api) => api.render(kernel.__kuitoJSX(Pair, {})));
  assert.deepEqual(runs, [[0, 0]]);

  nativeEvent(kuito, 'both.press');

  assert.deepEqual(runs, [
    [0, 0],
    [1, 1],
  ]);
});

test('a throwing signal listener is reported and the others still run', async () => {
  const errors: unknown[][] = [];
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      console: { error: (...args: unknown[]) => errors.push(args) },
    }),
  );
  const kuito = kernel.__kuito;
  const seen: number[] = [];

  let count!: Signal<number>;

  kuito.patch('listeners', (api) => {
    count = api.state('count', 0);
    api.render(null);
  });

  count.subscribe(() => {
    throw new Error('listener broke');
  });

  count.subscribe((value) => seen.push(value));
  count.value = 1;
  await flushed();

  assert.deepEqual(seen, [1]);
  assert.match(String(errors[0]?.[0]), /signal listener failed/);
});

function bare() {
  return installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
    }),
  );
}

test('a computed runs on first read and again only after what it read changes', () => {
  const kernel = bare();
  const kuito = kernel.__kuito;
  let count!: Signal<number>;
  let other!: Signal<number>;

  kuito.patch('computed', (api) => {
    count = api.state('count', 1);
    other = api.state('other', 0);
    api.render(null);
  });

  let runs = 0;
  const double = kuito.computed(() => {
    runs++;

    return count.value * 2;
  });

  assert.equal(runs, 0, 'lazy: nothing runs before a read');
  assert.equal(double.value, 2);
  assert.equal(double.value, 2);
  assert.equal(runs, 1, 'memoized while nothing it read changed');

  other.value = 5;
  assert.equal(double.value, 2);
  assert.equal(runs, 1, 'a write to a signal it did not read keeps the value');

  count.value = 3;
  assert.equal(double.value, 6);
  assert.equal(runs, 2);
});

test('an effect reading a signal and a computed of it sees one consistent pair per flush', async () => {
  const kernel = bare();
  const kuito = kernel.__kuito;
  const seen: [number, number][] = [];
  let count!: Signal<number>;

  function Pair() {
    count = kuito.useState(1);

    const double = kuito.computed(() => count.value * 2);

    kuito.useLifecycle('effect', () => {
      seen.push([count.value, double.value]);
    });

    return null;
  }

  kuito.patch('diamond', (api) => api.render(kernel.__kuitoJSX(Pair, {})));
  count.value = 2;
  await flushed();
  count.value = 3;
  count.value = 4;
  await flushed();

  assert.deepEqual(seen, [
    [1, 2],
    [2, 4],
    [4, 8],
  ]);
});

test('a computed tracks the branch it takes and lets go of its sources with its last listener', async () => {
  const kernel = bare();
  const kuito = kernel.__kuito;
  let useLeft!: Signal<boolean>;
  let left!: Signal<string>;
  let right!: Signal<string>;

  kuito.patch('branches', (api) => {
    useLeft = api.state('useLeft', true);
    left = api.state('left', 'a');
    right = api.state('right', 'b');
    api.render(null);
  });

  const picked = kuito.computed(() => (useLeft.value ? left.value : right.value));
  const values: string[] = [];
  const stop = picked.subscribe((value) => values.push(value));

  assert.equal(picked.value, 'a');
  assert.equal(right.listenerCount, 0, 'it reads only the branch it took');

  useLeft.value = false;
  await flushed();
  right.value = 'c';
  await flushed();
  left.value = 'z';
  await flushed();

  assert.deepEqual(values, ['b', 'c']);
  assert.equal(left.listenerCount, 0, 'the branch it left is no longer a source');

  stop();
  assert.equal(useLeft.listenerCount + left.listenerCount + right.listenerCount, 0);
});

test('a computed that reads itself throws instead of looping', () => {
  const kuito = bare().__kuito;
  const loop: { value: unknown } = kuito.computed(() => loop.value);

  assert.throws(() => loop.value, /computed reads itself/);
});

test('a text bound to a computed updates when its source changes', async () => {
  const nodes = new Map<string, Record<string, unknown>>();
  const kernel = installKernel(
    hosting({
      createView(id: string) {
        nodes.set(id, {});
      },
      setProp(id: string, key: string, value: unknown) {
        const props = nodes.get(id);

        if (props) props[key] = value;
      },
      removeView() {},
    }),
  );
  const kuito = kernel.__kuito;
  let name!: Signal<string>;

  function Greeting() {
    name = kuito.useState('Ada');

    const greeting = kuito.computed(() => 'Hello, ' + name.value);

    return kernel.__kuitoJSX('Text', { id: 'greeting' }, () => greeting.value);
  }

  kuito.patch('greeting', (api) => api.render(kernel.__kuitoJSX(Greeting, {})));
  name.value = 'Grace';
  await flushed();

  assert.equal(nodes.get('greeting')?.text, 'Hello, Grace');
});

test('a computed that throws for its listener is reported, and later writes still flush', async () => {
  const errors: unknown[][] = [];
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      console: { error: (...args: unknown[]) => errors.push(args) },
    }),
  );
  const kuito = kernel.__kuito;
  let count!: Signal<number>;
  let other!: Signal<number>;

  kuito.patch('failing', (api) => {
    count = api.state('count', 1);
    other = api.state('other', 0);
    api.render(null);
  });

  const failing = kuito.computed(() => {
    if (count.value === 2) throw new Error('computed broke');

    return count.value;
  });
  const heard: number[] = [];

  failing.subscribe(() => {});
  other.subscribe((value) => heard.push(value));
  count.value = 2;
  await flushed();
  other.value = 1;
  await flushed();

  assert.deepEqual(heard, [1]);
  assert.match(String(errors[0]?.[0]), /signal listener failed/);
});

test('a computed whose source throws keeps throwing until the source recovers', async () => {
  const kuito = bare().__kuito;
  let count!: Signal<number>;

  kuito.patch('source-throws', (api) => {
    count = api.state('count', 1);
    api.render(null);
  });

  const source = kuito.computed(() => {
    if (count.value === 2) throw new Error('source broke');

    return count.value;
  });
  const tens = kuito.computed(() => source.value * 10);

  tens.subscribe(() => {});
  count.value = 2;

  assert.throws(() => tens.value, /source broke/);
  assert.throws(() => tens.value, /source broke/);

  count.value = 3;
  await flushed();

  assert.equal(tens.value, 30);
});

test('a binding that reads a signal on both sides of a computed of it follows it once', async () => {
  const kernel = bare();
  const kuito = kernel.__kuito;
  let count!: Signal<number>;

  kuito.patch('around', (api) => {
    count = api.state('count', 1);

    const double = kuito.computed(() => count.value * 2);

    api.render(
      kernel.__kuitoJSX(
        'Text',
        { id: 'sum' },
        kernel.__kuitoExpr('sum', () => String(count.value + double.value + count.value)),
      ),
    );
  });

  const before = count.listenerCount;

  count.value = 2;
  await flushed();
  count.value = 3;
  await flushed();

  assert.equal(count.listenerCount, before, 'the binding and the computed, once each');
});

test('a listener that joins a stale computed hears only a change of its value', async () => {
  const kuito = bare().__kuito;
  let count!: Signal<number>;

  kuito.patch('parity', (api) => {
    count = api.state('count', 0);
    api.render(null);
  });

  const parity = kuito.computed(() => count.value % 2);
  const heard: number[] = [];

  parity.subscribe(() => {});
  count.value = 1;
  parity.subscribe((value) => heard.push(value));
  await flushed();
  count.value = 3;
  await flushed();

  assert.deepEqual(heard, []);
});

/** What `scripts/benchmark-signals.ts` measures for one scenario, in a Node it starts. */
function measureWrites(scenario: string, readers: number): { bytes: number | null } {
  const run = spawnSync(
    process.execPath,
    [
      'scripts/benchmark-signals.ts',
      '--json',
      '--scenario',
      scenario,
      '--readers',
      String(readers),
    ],
    { encoding: 'utf8' },
  );

  assert.equal(run.status, 0, run.stderr);

  const [result] = JSON.parse(run.stdout).results;

  return result;
}

test(
  'a write allocates nothing per listener or computed that reads it',
  { timeout: 120_000 },
  () => {
    ['listeners', 'computeds'].forEach((scenario) => {
      const { bytes } = measureWrites(scenario, 1000);

      assert.notEqual(bytes, null, scenario + ': every round was collected');
      assert.ok((bytes ?? 0) < 1000, `${scenario}: ${bytes} bytes for 1,000 readers`);
    });
  },
);
