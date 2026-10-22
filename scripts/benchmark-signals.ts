#!/usr/bin/env node
/**
 * What one signal write costs the kernel with 1, 100 and 1,000 readers, in
 * the kernel host (benchmarks/kernel-signals.md): the kernel bundled as a
 * shell loads it, run in `node:vm` with a host that drops its batches.
 *
 *   node scripts/benchmark-signals.ts [--profile release|dev] [--json]
 *     [--scenario listeners|computeds|bindings|steady] [--readers <n>]
 *
 * Readers are `subscribe` listeners, subscribed computeds, or the opacity
 * bindings of an app's texts: ones each write changes, or `steady` ones that
 * run again and keep their value. Each write lands as app code's does, on
 * the next microtask. Bytes per write are the heap's growth over a round
 * with no collection in it; a round a collection interrupted shows none.
 * Node's JIT, not Hermes: compare builds, not these times with a device's.
 */
import { spawnSync } from 'node:child_process';
import { PerformanceObserver } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { parseArgs } from 'node:util';
import { runInNewContext } from 'node:vm';
import { bundleKernel, type KernelProfile } from '../src/dev/kernel.ts';

/** Room for a round's garbage, so no scavenge runs inside one. */
const NODE_FLAGS = ['--expose-gc', '--max-semi-space-size=256'];

const gc = globalThis.gc;

if (!gc) {
  const run = spawnSync(process.execPath, [...NODE_FLAGS, ...process.argv.slice(1)], {
    stdio: 'inherit',
  });

  process.exit(run.status ?? 1);
}

const collect: () => void = gc;

const { values: options } = parseArgs({
  options: {
    profile: { type: 'string', default: 'release' },
    json: { type: 'boolean', default: false },
    scenario: { type: 'string' },
    readers: { type: 'string' },
  },
});

if (options.profile !== 'release' && options.profile !== 'dev')
  throw new Error('--profile is release or dev');

const profile: KernelProfile = options.profile;
const source = await bundleKernel(profile);

interface Cell {
  value: number;
  subscribe(listener: (value: unknown) => void): () => void;
}

interface Kernel {
  createSignal(initial: number): Cell;
  computed(fn: () => unknown): Cell;
  defineComponent(id: string, fn: unknown, hash: string, cacheable: boolean): void;
  patch(module: string, register: (api: { render(node: unknown): void }) => void): void;
}

interface Sandbox {
  __kuito: Kernel;
  __kuitoJSX: (type: unknown, props: object | null, ...children: unknown[]) => unknown;
  __kuitoExpr: <F>(key: string, evaluate: F) => F;
}

function kernel(): Sandbox {
  const host = { __kuitoHostCommit() {} };

  runInNewContext(source, host);

  return host as never;
}

type Scenario = (kuito: Sandbox, readers: number) => Cell;

/** An app of `readers` texts, each with one prop bound to one signal. */
function bindings(
  kuito: Sandbox,
  readers: number,
  bind: (cell: Cell, reader: number) => object,
): Cell {
  const cell = kuito.__kuito.createSignal(0);
  const rows = Array.from({ length: readers }, (_, reader) => reader);

  kuito.__kuito.patch('bench', (api) =>
    api.render(
      kuito.__kuitoJSX(
        'VStack',
        { id: 'rows' },
        ...rows.map((reader) => kuito.__kuitoJSX('Text', bind(cell, reader))),
      ),
    ),
  );

  return cell;
}

const SCENARIOS: Record<string, Scenario> = {
  listeners(kuito, readers) {
    const cell = kuito.__kuito.createSignal(0);

    for (let reader = 0; reader < readers; reader++) cell.subscribe(() => {});

    return cell;
  },
  computeds(kuito, readers) {
    const cell = kuito.__kuito.createSignal(0);

    for (let reader = 0; reader < readers; reader++)
      kuito.__kuito.computed(() => cell.value + reader).subscribe(() => {});

    return cell;
  },
  // Each write changes every row's opacity: each binding sends its prop.
  bindings: (kuito, readers) =>
    bindings(kuito, readers, (cell, reader) => ({
      id: 'row-' + reader,
      opacity: kuito.__kuitoExpr('o' + reader, () => (cell.value % 2 ? 0.5 : 1)),
    })),
  // Each binding runs again and comes to the opacity it shows: no prop is sent.
  steady: (kuito, readers) =>
    bindings(kuito, readers, (cell, reader) => ({
      id: 'row-' + reader,
      opacity: kuito.__kuitoExpr('o' + reader, () => (cell.value < 0 ? 0.5 : 1)),
    })),
};

interface Round {
  microseconds: number;
  bytes: number | null;
}

async function write(cell: Cell, writes: number): Promise<void> {
  for (let index = 0; index < writes; index++) {
    cell.value++;
    await Promise.resolve();
  }
}

async function round(cell: Cell, writes: number): Promise<Round> {
  let collections = 0;
  const observer = new PerformanceObserver((list) => (collections += list.getEntries().length));

  collect();
  // A full collection drops what V8 keeps about the code that ran, which it
  // then allocates again: a few writes first keep that out of the count.
  await write(cell, 10);
  observer.observe({ entryTypes: ['gc'] });

  const heap = getHeapStatistics().used_heap_size;
  const start = performance.now();

  await write(cell, writes);

  const elapsed = performance.now() - start;
  const grown = getHeapStatistics().used_heap_size - heap;

  // The observer hears of a collection on a later task.
  await new Promise((resolve) => setImmediate(resolve));
  observer.disconnect();

  return {
    microseconds: (elapsed * 1000) / writes,
    bytes: collections ? null : Math.max(0, grown / writes),
  };
}

const median = (values: number[]) => values.slice().sort((a, b) => a - b)[values.length >> 1];

const results: { scenario: string; readers: number; microseconds: number; bytes: number | null }[] =
  [];

// A signal nobody reads: what the write and the harness's await cost alone.
const runs: [string, Scenario, number][] = [['listeners', SCENARIOS.listeners, 0]];

Object.entries(SCENARIOS).forEach(([scenario, make]) =>
  [1, 100, 1000].forEach((readers) => runs.push([scenario, make, readers])),
);

const chosen = runs.filter(
  ([scenario, , readers]) =>
    (options.scenario === undefined || scenario === options.scenario) &&
    (options.readers === undefined || readers === Number(options.readers)),
);

if (!chosen.length) throw new Error('No scenario matches --scenario and --readers');

for (const [scenario, make, readers] of chosen) {
  const cell = make(kernel(), readers);
  const writes = Math.max(50, Math.floor(100_000 / Math.max(1, readers)));

  await round(cell, writes);

  const rounds: Round[] = [];

  for (let index = 0; index < 7; index++) rounds.push(await round(cell, writes));

  const measured = rounds.flatMap((each) => (each.bytes === null ? [] : [each.bytes]));

  results.push({
    scenario,
    readers,
    microseconds: median(rounds.map((each) => each.microseconds)),
    bytes: measured.length ? median(measured) : null,
  });
}

const table = [
  '| readers | scenario  | µs per write | bytes per write |',
  '| ------: | --------- | -----------: | --------------: |',
  ...results.map(
    ({ scenario, readers, microseconds, bytes }) =>
      `| ${readers} | ${scenario} | ${microseconds.toFixed(2)} | ${bytes === null ? 'n/a' : Math.round(bytes)} |`,
  ),
];

console.log(
  options.json
    ? JSON.stringify({ profile, node: process.version, results })
    : [`kernel ${profile}, Node ${process.version}`, '', ...table].join('\n'),
);
