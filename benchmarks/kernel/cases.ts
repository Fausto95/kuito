// The kernel microbenchmarks (benchmarks/kernel/README.md): plain ES2022 over
// the kernel's globals and one host clock, so the same bundle runs in Node now
// and on a device's Hermes later. Each case builds its app once, then times
// one operation per iteration; a write lands as app code's does, on the next
// microtask.

interface Cell<T> {
  value: T;
  subscribe(listener: (value: T) => void): () => void;
}

interface Kernel {
  createSignal<T>(initial: T): Cell<T>;
  computed<T>(fn: () => T): Cell<T>;
  patch(module: string, register: (api: { render(node: unknown): void }) => void): void;
  dispose(module: string): boolean;
}

/** The kernel's globals a case uses, as a shell's runtime holds them. */
export interface KernelGlobals {
  __kuito: Kernel;
  __kuitoJSX: (type: unknown, props: object | null, ...children: unknown[]) => unknown;
  __kuitoExpr: <F>(key: string, evaluate: F) => F;
}

interface Case {
  name: string;
  /** What one iteration does, for the results table. */
  does: string;
  /** Builds the case's app as module `module`; returns one iteration. */
  setup(kuito: KernelGlobals, module: string): () => Promise<void> | void;
  iterations: number;
}

export interface CaseResult {
  name: string;
  does: string;
  iterations: number;
  /** Median of the rounds, microseconds per iteration. */
  microseconds: number;
}

const ROWS = 1000;

const tick = () => Promise.resolve();

/** `count` Text views under one VStack, each with props from `row`. */
function texts(kuito: KernelGlobals, module: string, row: (index: number) => object) {
  const children: unknown[] = [];

  for (let index = 0; index < ROWS; index++) children.push(kuito.__kuitoJSX('Text', row(index)));

  kuito.__kuito.patch(module, (api) =>
    api.render(kuito.__kuitoJSX('VStack', { id: 'rows' }, ...children)),
  );
}

/** A keyed list of ROWS items whose order `reorder` changes. */
function keyedList(
  kuito: KernelGlobals,
  module: string,
  reorder: (items: readonly object[]) => object[],
) {
  const start: object[] = [];

  for (let index = 0; index < ROWS; index++) start.push({ title: 'Row ' + index });

  const items = kuito.__kuito.createSignal<readonly object[]>(start);

  kuito.__kuito.patch(module, (api) =>
    api.render(
      kuito.__kuitoJSX(
        'VStack',
        { id: 'list' },
        kuito.__kuitoJSX('For', {
          each: items,
          children: (item: { title: string }) => kuito.__kuitoJSX('Text', { text: item.title }),
        }),
      ),
    ),
  );

  return async () => {
    items.value = reorder(items.value);
    await tick();
  };
}

/** One view whose `count` object props all change with each plan of the module: one commit. */
function propsCase(count: number): Case {
  return {
    name: 'commit-props-' + count,
    does: 'one view with ' + count + ' object props, all changed in one commit',
    iterations: 200,
    setup(kuito, module) {
      let next = 0;

      return () => {
        const props: Record<string, unknown> = { id: 'view' };
        const value = next++;

        for (let index = 0; index < count; index++) props['p' + index] = { value };

        kuito.__kuito.patch(module, (api) => api.render(kuito.__kuitoJSX('VStack', props)));
      };
    },
  };
}

export const CASES: readonly Case[] = [
  {
    name: 'signal-1000-bindings',
    does: 'one signal write that 1,000 Text opacities follow',
    iterations: 200,
    setup(kuito, module) {
      const cell = kuito.__kuito.createSignal(0);

      texts(kuito, module, (index) => ({
        id: 'row-' + index,
        opacity: kuito.__kuitoExpr('o' + index, () => (cell.value % 2 ? 0.5 : 1)),
      }));

      return async () => {
        cell.value++;
        await tick();
      };
    },
  },
  {
    name: 'signal-1000-computeds',
    does: 'one signal write that 1,000 subscribed computeds read',
    iterations: 200,
    setup(kuito) {
      const cell = kuito.__kuito.createSignal(0);

      for (let index = 0; index < ROWS; index++)
        kuito.__kuito.computed(() => cell.value + index).subscribe(() => {});

      return async () => {
        cell.value++;
        await tick();
      };
    },
  },
  {
    name: 'reconcile-reverse-1000',
    does: 'a keyed For of 1,000 rows reversed',
    iterations: 50,
    setup: (kuito, module) => keyedList(kuito, module, (items) => items.slice().reverse()),
  },
  {
    name: 'reconcile-move-1000',
    does: 'the last of 1,000 keyed rows moved to the front',
    iterations: 200,
    setup: (kuito, module) =>
      keyedList(kuito, module, (items) => [items[items.length - 1], ...items.slice(0, -1)]),
  },
  {
    name: 'plan-mount-1000',
    does: 'a module of 1,000 views planned, committed and disposed',
    iterations: 20,
    setup(kuito, module) {
      let next = 0;

      return () => {
        const mounted = module + '-' + next++;

        texts(kuito, mounted, (index) => ({ id: 'row-' + index, text: 'Row ' + index }));
        kuito.__kuito.dispose(mounted);
      };
    },
  },
  {
    name: 'plan-replan-1000',
    does: 'a module of 1,000 views planned again unchanged: the walk, nothing sent',
    iterations: 50,
    setup(kuito, module) {
      const render = () =>
        texts(kuito, module, (index) => ({ id: 'row-' + index, text: 'Row ' + index }));

      render();

      return render;
    },
  },
  propsCase(10),
  propsCase(50),
  propsCase(200),
];

const median = (values: number[]) => values.slice().sort((a, b) => a - b)[values.length >> 1];

/**
 * Runs each case `rounds` times after one warm-up round, timed by `now`
 * (milliseconds), each in a module of its own that goes when it is done.
 * `only` picks a case by name; `scale` multiplies each case's iterations.
 */
export async function runCases(
  kuito: KernelGlobals,
  now: () => number,
  { rounds = 7, only, scale = 1 }: { rounds?: number; only?: string; scale?: number } = {},
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (const each of CASES) {
    if (only !== undefined && each.name !== only) continue;

    const iteration = each.setup(kuito, each.name);
    const iterations = Math.max(1, Math.round(each.iterations * scale));
    const times: number[] = [];

    for (let round = 0; round <= rounds; round++) {
      const start = now();

      for (let index = 0; index < iterations; index++) await iteration();

      // The first round warms the code up and is not kept.
      if (round > 0) times.push(((now() - start) * 1000) / iterations);
    }

    kuito.__kuito.dispose(each.name);
    results.push({ name: each.name, does: each.does, iterations, microseconds: median(times) });
  }

  if (!results.length) throw new Error('No kernel benchmark is named ' + only);

  return results;
}
