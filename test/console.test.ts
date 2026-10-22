import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

interface Entry {
  level: string;
  message: string;
  stack: string;
}

interface Console {
  log(...values: unknown[]): void;
  info(...values: unknown[]): void;
  debug(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

interface RejectionTracker {
  allRejections: boolean;
  onUnhandled(id: number, rejection: unknown): void;
}

function make(extra: object = {}) {
  const logged: Entry[] = [];
  const vm = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      __kuitoHostLog(level: string, message: string, stack: string) {
        logged.push({ level, message, stack });
      },
      ...extra,
    }),
  );

  return { vm, logged, console: (vm as unknown as { console: Console }).console };
}

test('console sends every level to the host log with the call stack', () => {
  const { console, logged } = make();

  console.log('ready');
  console.info('info');
  console.debug('debug');
  console.warn('careful');
  console.error('broken');

  assert.deepEqual(
    logged.map(({ level, message }) => [level, message]),
    [
      ['log', 'ready'],
      ['info', 'info'],
      ['debug', 'debug'],
      ['warn', 'careful'],
      ['error', 'broken'],
    ],
  );

  assert.ok(
    logged.every(({ stack }) => /\n\s+at /.test(stack)),
    'a stack for each entry',
  );
});

test('values print the way people read them, in one line', () => {
  const { console, logged } = make();
  const cyclic: Record<string, unknown> = { name: 'loop' };

  cyclic.self = cyclic;
  console.log('count', 3, true, null, undefined, { a: 1, b: [1, 'two'] });

  console.log(
    cyclic,
    function named() {},
    () => {},
    Symbol('id'),
  );

  console.log({ deep: { deeper: { deepest: { gone: 1 } } } });

  assert.deepEqual(
    logged.map(({ message }) => message),
    [
      "count 3 true null undefined { a: 1, b: [1, 'two'] }",
      "{ name: 'loop', self: [Circular] } [Function named] [Function] Symbol(id)",
      '{ deep: { deeper: { deepest: [Object] } } }',
    ],
  );
});

test('an error logged as a value carries its own stack, not the call site', () => {
  const { console, logged } = make();

  function thrower() {
    throw new TypeError('bad input');
  }

  try {
    thrower();
  } catch (error) {
    console.error('Request failed:', error);
  }

  const [entry] = logged;

  assert.equal(entry?.message, 'Request failed: TypeError: bad input');
  assert.match(entry?.stack ?? '', /thrower/);
});

test('kernel-reported failures reach the host log as errors', () => {
  const { vm, logged } = make();

  vm.__kuito.patch('app', (api) => {
    function App() {
      vm.__kuito.useLifecycle('cleanup', () => {
        throw new Error('cleanup broke');
      });

      return vm.__kuitoJSX('VStack', {});
    }

    api.render(vm.__kuitoJSX(App, {}));
  });

  vm.__kuito.patch('app', (api) => api.render(vm.__kuitoJSX('VStack', {})));

  const [entry] = logged;

  assert.equal(entry?.level, 'error');
  assert.match(entry?.message ?? '', /lifecycle cleanup failed: Error: cleanup broke/);
  assert.match(entry?.stack ?? '', /cleanup broke/);
});

test('unhandled promise rejections are logged as errors', () => {
  let tracker: RejectionTracker | undefined;
  const { logged } = make({
    HermesInternal: {
      enablePromiseRejectionTracker(options: RejectionTracker) {
        tracker = options;
      },
    },
  });

  assert.equal(tracker?.allRejections, true);
  tracker?.onUnhandled(1, new Error('no handler'));

  assert.equal(logged[0]?.level, 'error');
  assert.equal(logged[0]?.message, 'Uncaught (in promise) Error: no handler');
  assert.match(logged[0]?.stack ?? '', /no handler/);
});

test('without a host log the existing console is left alone', () => {
  const calls: unknown[][] = [];
  const existing = { log: (...values: unknown[]) => calls.push(values) };
  const vm = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      console: existing,
    }),
  );

  assert.equal((vm as unknown as { console: unknown }).console, existing);
});

test('with an inspector attached, console methods are its own and still reach the host log', () => {
  const inspected: Array<[string, unknown[]]> = [];
  const methods = new Map<string, unknown>();
  const { console, logged } = make({
    // Native wraps each method in a host function: its caller is the top of the
    // stack DevTools links the entry to, not the kernel's console.
    __kuitoHostConsole(level: string, method: (...values: unknown[]) => void) {
      const wrapped = (...values: unknown[]) => {
        inspected.push([level, values]);
        method(...values);
      };

      methods.set(level, wrapped);

      return wrapped;
    },
  });
  const state = { nested: { deep: { deeper: { deepest: 1 } } } };

  assert.deepEqual([...methods.keys()], ['log', 'info', 'debug', 'warn', 'error']);
  assert.equal(Reflect.get(console, 'warn'), methods.get('warn'));

  console.warn('state', state);

  const [[level, values] = ['', []]] = inspected;

  assert.equal(inspected.length, 1);
  assert.equal(level, 'warn');
  assert.equal(values[1], state, 'DevTools gets the object itself, not its text');

  assert.deepEqual(
    logged.map((entry) => entry.message),
    ['state { nested: { deep: { deeper: [Object] } } }'],
    'the LogBox and the terminal still get the entry',
  );
});
