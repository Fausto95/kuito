import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// Background tasks as the OS runs them: the platform launches the runtime,
// headless or beside the app's UI, then emits `run` and waits for `finish`.
// The fake platform answers like the iOS and Android BackgroundTasks modules.

type Options = { minimumInterval?: number; requiresNetwork?: boolean; requiresCharging?: boolean };

interface Api {
  backgroundTasks: {
    define(name: unknown, task: unknown): void;
    schedule(name: string, options?: Options): Promise<void>;
    cancel(name: string): Promise<void>;
    status(): Promise<string>;
  };
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-background-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/background-tasks-app.tsx');

function platform(): Record<string, FakeModule> {
  const table = new Map<string, string>();

  return {
    Storage: {
      functions: {
        setItem: {
          thread: 'background',
          run(key, value) {
            table.set(String(key), String(value));
          },
        },
      },
    },
    BackgroundTasks: {
      functions: {
        register: { thread: 'background', run() {} },
        unregister: { thread: 'background', run() {} },
        status: { thread: 'main', run: () => 'available' },
        finish: { thread: 'main', run() {} },
      },
    },
  };
}

/** The app, started the way a shell starts it: headless for a background launch. */
async function launch({ headless }: { headless: boolean }) {
  const native = fakeModules(platform());
  const created: string[] = [];
  const logs: { level: string; message: string }[] = [];
  const kernel = installKernel(
    hosting({
      ...(headless && { __kuitoHostHeadless: true }),
      createView(_id: string, kind: string) {
        created.push(kind);
      },
      setProp() {},
      removeView() {},
      __kuitoHostLog(level: string, message: string) {
        logs.push({ level, message });
      },
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  /** Settles native calls and lets the promises they resolve run, until nothing new is called. */
  async function settle() {
    for (let round = 0; round < 20; round++) {
      await new Promise<void>((done) => setTimeout(done, 0));

      const before = native.calls.length;

      native.flush();

      if (native.calls.length === before) return;
    }

    throw new Error('native calls kept coming');
  }

  const calls = (method: string) =>
    data(native.calls.filter((call) => call.method === method).map((call) => call.args));

  const { backgroundTasks } = kernel as unknown as Api;

  return { ...native, created, logs, settle, calls, backgroundTasks };
}

test('a headless launch runs the app’s module scope but mounts no UI', async () => {
  const app = await launch({ headless: true });

  assert.deepEqual(app.created, [], 'no view is created');
  assert.deepEqual(app.observed, ['start BackgroundTasks.run'], 'defining a task listens for runs');
});

test('a run executes the task by name with its deadline, then reports success', async () => {
  const app = await launch({ headless: true });

  app.emit('BackgroundTasks', 'run', { id: 'run-1', name: 'sync', deadline: 1700000030000 });
  await app.settle();

  assert.deepEqual(app.calls('setItem'), [['lastRun', 'sync@1700000030000']]);
  assert.deepEqual(app.calls('finish'), [['run-1', true]], 'finished after the task resolved');
});

test('a run passes on what the platform sent with it, and only that', async () => {
  const app = await launch({ headless: true });

  app.emit('BackgroundTasks', 'run', { id: 'run-6', name: 'echo', deadline: 5 });

  app.emit('BackgroundTasks', 'run', {
    id: 'run-7',
    name: 'echo',
    deadline: 5,
    data: { locations: [] },
  });

  await app.settle();

  assert.deepEqual(app.calls('setItem'), [
    ['echo', '{"name":"echo","deadline":5}'],
    ['echo', '{"name":"echo","deadline":5,"data":{"locations":[]}}'],
  ]);
});

test('a task that throws reports its error and finishes as failed', async () => {
  const app = await launch({ headless: true });

  app.emit('BackgroundTasks', 'run', { id: 'run-2', name: 'broken', deadline: 1 });
  await app.settle();

  assert.deepEqual(app.calls('finish'), [['run-2', false]]);

  assert.ok(
    app.logs.some(
      ({ level, message }) =>
        level === 'error' &&
        message.includes("Background task 'broken' failed") &&
        message.includes('the server is down'),
    ),
    JSON.stringify(app.logs),
  );
});

test('a run for a task the app never defined fails and says how to define it', async () => {
  const app = await launch({ headless: true });

  app.emit('BackgroundTasks', 'run', { id: 'run-3', name: 'cleanup', deadline: 1 });
  await app.settle();

  assert.deepEqual(app.calls('finish'), [['run-3', false]]);

  assert.ok(
    app.logs.some(
      ({ message }) =>
        message.includes("No background task named 'cleanup'") &&
        message.includes('backgroundTasks.define'),
    ),
    JSON.stringify(app.logs),
  );
});

test('with its UI up, the app mounts and runs tasks in the same runtime', async () => {
  const app = await launch({ headless: false });

  assert.ok(app.created.length > 0, 'the app rendered');

  app.emit('BackgroundTasks', 'run', { id: 'run-4', name: 'sync', deadline: 7 });
  await app.settle();

  assert.deepEqual(app.calls('finish'), [['run-4', true]]);
});

test('defining a name again replaces its task; the runtime listens once', async () => {
  const app = await launch({ headless: true });
  const ran: string[] = [];

  app.backgroundTasks.define('sync', () => {
    ran.push('replacement');
  });

  app.emit('BackgroundTasks', 'run', { id: 'run-5', name: 'sync', deadline: 1 });
  await app.settle();

  assert.deepEqual(ran, ['replacement']);
  assert.deepEqual(app.calls('setItem'), [], 'the first definition is gone');
  assert.deepEqual(app.calls('finish'), [['run-5', true]]);
  assert.deepEqual(app.observed, ['start BackgroundTasks.run']);
});

test('define takes a name and a function', async () => {
  const app = await launch({ headless: true });

  assert.throws(() => app.backgroundTasks.define('', () => {}), /needs a name/);
  assert.throws(() => app.backgroundTasks.define('sync', 'not a function'), /function/);
});

test('a malformed run from the platform is reported, not run', async () => {
  const app = await launch({ headless: true });

  app.emit('BackgroundTasks', 'run', { name: 'sync' });
  await app.settle();

  assert.deepEqual(app.calls('setItem'), []);
  assert.ok(app.logs.some(({ message }) => message.includes('Invalid background task run')));
});

test('schedule sends the options with their defaults; a short interval is an error', async () => {
  const app = await launch({ headless: false });

  await Promise.all([
    app.backgroundTasks.schedule('sync', { minimumInterval: 60, requiresNetwork: true }),
    app.backgroundTasks.schedule('cleanup'),
    app.backgroundTasks.cancel('cleanup'),
    app.settle(),
  ]);

  assert.deepEqual(app.calls('register'), [
    ['sync', { minimumInterval: 60, requiresNetwork: true, requiresCharging: false }],
    ['cleanup', { minimumInterval: 15, requiresNetwork: false, requiresCharging: false }],
  ]);

  assert.deepEqual(app.calls('unregister'), [['cleanup']]);

  await assert.rejects(
    app.backgroundTasks.schedule('sync', { minimumInterval: 5 }),
    /backgroundTasks\.schedule\('sync'\): minimumInterval must be at least 15 minutes/,
  );
});

test('status says whether the OS lets the app run in the background', async () => {
  const app = await launch({ headless: false });
  const [status] = await Promise.all([app.backgroundTasks.status(), app.settle()]);

  assert.equal(status, 'available');
});
