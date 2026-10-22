import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { flushed, installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';
import { ERRORS } from '../src/protocol/modules.ts';

// The kernel's side of a linked module function (src/runtime/link.ts): a
// stub binds its id, thread and argument schema, arguments are checked and
// cross as values, and nothing is dispatched by name.

type Settle = (call: number, value: unknown) => void;
type Fail = (call: number, code: string, message: string) => void;
type LinkError = (id: number, code: string, message: string) => Error;

interface LinkCallbacks {
  __kuitoLinkEmit: (id: number, value: unknown) => void;
  __kuitoLinkSettle: Settle;
  __kuitoLinkFail: Fail;
  __kuitoLinkError: LinkError;
}

/** A failure the fake platform answers with: code and message, as the native linker sends it. */
class Failure {
  readonly code: string;
  readonly message: string;

  constructor(code: string, message: string) {
    this.code = code;
    this.message = message;
  }
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** A platform whose link table is `functions`, by id. */
function platform(functions: Record<number, (...args: unknown[]) => unknown>) {
  const calls: { id: number; args: unknown[] }[] = [];
  const queued: { id: number; call: number; args: unknown[] }[] = [];
  const observed: string[] = [];
  const logs: string[] = [];
  let kernel: (object & LinkCallbacks) | null = null;

  const run = (id: number, args: unknown[]) => {
    calls.push({ id, args: data(args) as unknown[] });

    try {
      return functions[id](...args);
    } catch (error) {
      return error instanceof Failure ? error : new Failure('ERR_TEST', String(error));
    }
  };

  const host = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      // As C++ does: a failure throws the error the kernel makes of it.
      __kuitoHostCall(id: number, ...args: unknown[]) {
        const result = run(id, args);

        if (result instanceof Failure)
          throw linked().__kuitoLinkError(id, result.code, result.message);

        return result;
      },
      __kuitoHostCallAsync(id: number, call: number, ...args: unknown[]) {
        queued.push({ id, call, args });
      },
      __kuitoHostObserve(id: number, observing: boolean) {
        observed.push(`${observing ? 'start' : 'stop'} ${id}`);
      },
      __kuitoHostLog(level: string, message: string) {
        logs.push(`${level}: ${message}`);
      },
    }),
  );

  function linked() {
    if (!kernel) throw new Error('the kernel is not installed');

    return kernel;
  }

  kernel = host as typeof host & LinkCallbacks;

  return {
    kuito: host.__kuito,
    calls,
    queued,
    observed,
    logs,
    callbacks: kernel,
    /** Runs every queued asynchronous call and settles it. */
    flush() {
      for (const { id, call, args } of queued.splice(0)) {
        const result = run(id, args);

        if (result instanceof Failure) linked().__kuitoLinkFail(call, result.code, result.message);
        else linked().__kuitoLinkSettle(call, result ?? null);
      }
    },
  };
}

type Linked = (...args: unknown[]) => unknown;

test('a synchronous function crosses its arguments as values and returns its result', () => {
  const native = platform({ 7: (a, b) => `${String(a)}:${String(b)}` });
  const level = native.kuito.link(7, 'Battery.label', 'js', ['s', 'n']) as Linked;

  assert.equal(native.calls.length, 0, 'binding crosses nothing');
  assert.equal(level('Ada', 3), 'Ada:3');
  assert.deepEqual(native.calls, [{ id: 7, args: ['Ada', 3] }]);
});

test('an absent optional argument crosses as null, and an absent field not at all', () => {
  const native = platform({ 2: () => null });
  const configure = native.kuito.link(2, 'Battery.configure', 'js', [
    [
      'o',
      [
        ['mode', ['e', 'saver', 'normal']],
        ['note', ['?', 's']],
      ],
    ],
    ['?', 's'],
  ]) as Linked;

  configure({ mode: 'saver', note: undefined });

  assert.deepEqual(native.calls, [{ id: 2, args: [{ mode: 'saver' }, null] }]);
});

test('a main or background function returns a Promise its settlement resolves', async () => {
  const native = platform({ 3: (days) => [Number(days), 1] });
  const history = native.kuito.link(3, 'Battery.history', 'background', ['n']) as Linked;
  const answer = history(2) as Promise<unknown>;

  assert.equal(typeof answer.then, 'function');
  assert.deepEqual(data(native.queued.map(({ id, args }) => [id, args])), [[3, [2]]]);

  native.flush();

  assert.deepEqual(data(await answer), [2, 1]);
});

test('a native failure rejects, or throws at a synchronous call, with its code and the function', async () => {
  const busy = () => {
    throw new Failure('ERR_BUSY', 'the battery is busy');
  };
  const native = platform({ 1: busy, 2: busy });
  const level = native.kuito.link(1, 'Battery.level', 'js', []) as Linked;
  const monitor = native.kuito.link(2, 'Battery.monitor', 'main', []) as Linked;
  const failed = (error: Error & { code?: string }, name: string) => {
    assert.equal(error.name, 'NativeModuleError');
    assert.equal(error.code, 'ERR_BUSY');
    assert.equal(error.message, `${name} failed: the battery is busy`);

    return true;
  };

  assert.throws(
    () => level(),
    (error: Error) => failed(error, 'Battery.level'),
  );

  const monitored = monitor() as Promise<unknown>;

  native.flush();
  await assert.rejects(monitored, (error: Error) => failed(error, 'Battery.monitor'));
});

test('arguments that do not match the schema fail before reaching the host, as the host would', async () => {
  const native = platform({ 4: () => null });
  const set = native.kuito.link(4, 'Battery.set', 'js', [
    ['e', 'saver', 'normal'],
    [
      'o',
      [
        ['levels', ['a', 'n']],
        ['labels', ['r', 's']],
      ],
    ],
  ]) as Linked;
  const fails = (args: unknown[], pattern: RegExp) =>
    assert.throws(
      () => set(...args),
      (error: Error & { code?: string }) =>
        error.name === 'NativeModuleError' &&
        error.code === ERRORS.argument.code &&
        pattern.test(error.message),
      String(pattern),
    );

  fails(
    ['eco', { levels: [], labels: {} }],
    /^Battery\.set argument 1 must be 'saver' or 'normal': eco$/,
  );

  fails(
    ['saver', { levels: [1, NaN], labels: {} }],
    /^Battery\.set argument 2's levels\[1\] must be a finite number: NaN$/,
  );

  fails(['saver', { levels: [], labels: { a: 1 } }], /argument 2's labels\.a must be a string: 1$/);
  fails(['saver', { levels: [] }], /argument 2's labels must be an object of strings: undefined$/);
  fails(['saver', { levels: [], labels: {}, extra: true }], /argument 2 has no field extra/);
  fails(['saver'], /^Battery\.set takes 2 arguments, not 1$/);
  fails(['saver', { levels: [], labels: {} }, 3], /^Battery\.set takes 2 arguments, not 3$/);

  const save = native.kuito.link(5, 'Battery.save', 'main', ['n']) as Linked;

  await assert.rejects(save('full') as Promise<unknown>, {
    name: 'NativeModuleError',
    code: ERRORS.argument.code,
    message: 'Battery.save argument 1 must be a finite number: full',
  });

  assert.equal(native.calls.length, 0);
  assert.equal(native.queued.length, 0);
});

test('an ArrayBuffer crosses as itself, and anything else where one is declared fails', () => {
  const sent: unknown[] = [];
  const native = platform({
    6: (bytes) => {
      sent.push(bytes);

      return null;
    },
  });
  const write = native.kuito.link(6, 'Files.write', 'js', ['x', ['?', 'x']]) as Linked;
  const bytes = new Uint8Array([1, 2]).buffer;

  write(bytes, undefined);

  assert.equal(sent[0], bytes, 'the same buffer, not a copy');

  assert.throws(
    () => write(new Uint8Array([1])),
    (error: Error & { code?: string }) =>
      error.code === ERRORS.argument.code &&
      error.message.startsWith('Files.write argument 1 must be an ArrayBuffer: '),
  );

  assert.throws(() => write('AQI='), /argument 1 must be an ArrayBuffer/);
});

test('a host without linked functions says so at the first call', () => {
  const host = installKernel(hosting({ createView() {}, setProp() {}, removeView() {} }));
  const level = host.__kuito.link(1, 'Battery.level', 'js', []) as Linked;

  assert.throws(
    () => level(),
    /Battery\.level cannot run: native modules are unavailable on this host/,
  );
});

test('a settlement for a call that is not pending is a protocol error', () => {
  const native = platform({});

  assert.throws(
    () => native.callbacks.__kuitoLinkSettle(99, null),
    /Native module call 99 is not pending/,
  );
});

interface EventHandle {
  addListener(listener: (payload: unknown) => void): { remove(): void };
}

test('an event observes the platform from its first listener to its last', () => {
  const native = platform({});
  const change = native.kuito.linkEvent(5, 'Clip.change') as EventHandle;
  const heard: unknown[] = [];

  assert.deepEqual(native.observed, [], 'binding crosses nothing');

  const first = change.addListener((payload) => heard.push(data(payload)));
  const second = change.addListener(() => {
    throw new Error('listener failed');
  });

  native.callbacks.__kuitoLinkEmit(5, { hasText: true });
  first.remove();
  second.remove();
  native.callbacks.__kuitoLinkEmit(5, { hasText: false });

  assert.deepEqual(native.observed, ['start 5', 'stop 5']);
  assert.deepEqual(heard, [{ hasText: true }]);

  assert.ok(
    native.logs.some((line) => /Clip\.change listener threw/.test(line)),
    'a listener that throws is reported, and the others still run',
  );
});

test('a live value reads the platform until watched, then follows what it sends', async () => {
  let level = 0.5;
  const native = platform({ 6: () => level });
  const battery = native.kuito.linkLive(6, 'Battery.level') as {
    value: number;
    subscribe(listener: (value: number) => void): () => void;
  };

  assert.equal(battery.value, 0.5);
  level = 0.4;
  assert.equal(battery.value, 0.4, 'unwatched, every read asks');

  const seen: number[] = [];
  const stop = battery.subscribe((value) => seen.push(value));

  native.callbacks.__kuitoLinkEmit(6, 0.3);
  assert.equal(battery.value, 0.3);
  await flushed();
  stop();
  // A source stops observing once nothing re-subscribes in the same job.
  await flushed();

  assert.deepEqual(native.observed, ['start 6', 'stop 6']);
  assert.deepEqual(seen, [0.3]);
});

test('a live record read again is the same object while its data stays', () => {
  let width = 402;
  const native = platform({ 8: () => ({ width, insets: { top: 62 } }) });
  const metrics = native.kuito.linkLive(8, 'Window.metrics') as { value: object };
  const first = metrics.value;

  assert.equal(metrics.value, first, 'nothing changed');

  width = 874;
  assert.notEqual(metrics.value, first);
  assert.deepEqual(data(metrics.value), { width: 874, insets: { top: 62 } });
});
