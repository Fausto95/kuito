import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// notifications as an app calls it, against a fake platform that answers
// like the iOS and Android Notifications modules. A tap is a link the shell
// reports to Linking, so the router's own tests cover where it lands.

interface Api {
  notifications: {
    schedule(notification: object): Promise<string>;
    cancel(id: string): Promise<void>;
    cancelAll(): Promise<void>;
    register(): Promise<{ service: string; token: string }>;
    watch(event: string, listener: (notification: object) => void): { remove(): void };
  };
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-notifications-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/notifications-app.tsx');

async function launch() {
  let next = 0;
  const native = fakeModules({
    Notifications: {
      functions: {
        schedule: {
          thread: 'main',
          run: (request) => (request as { id?: string }).id ?? `generated-${++next}`,
        },
        cancel: { thread: 'main', run() {} },
        cancelAll: { thread: 'main', run() {} },
        register: { thread: 'main', run: () => ({ service: 'apns', token: '00ab' }) },
      },
    },
  });
  const kernel = installKernel(
    hosting({ createView() {}, setProp() {}, removeView() {}, ...native.host }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  /** Settles the queued native calls, then lets the promises run. */
  async function settle<T>(promise: Promise<T>) {
    await new Promise<void>((done) => setTimeout(done, 0));
    native.flush();

    return promise;
  }

  const calls = (method: string) =>
    data(native.calls.filter((call) => call.method === method).map((call) => call.args));

  return { ...native, settle, calls, notifications: (kernel as unknown as Api).notifications };
}

test('schedule sends the time in milliseconds and resolves with the platform’s id', async () => {
  const app = await launch();
  const at = new Date(Date.now() + 60_000);

  const id = await app.settle(
    app.notifications.schedule({
      title: 'Stand-up',
      body: 'In 1 minute',
      url: 'kuito://standup',
      at,
    }),
  );

  assert.equal(id, 'generated-1');

  assert.deepEqual(app.calls('schedule'), [
    [{ title: 'Stand-up', body: 'In 1 minute', url: 'kuito://standup', at: at.getTime() }],
  ]);
});

test('without a time it shows now; an id replaces the notification that has it', async () => {
  const app = await launch();
  const at = Date.now() + 3_600_000;

  assert.equal(await app.settle(app.notifications.schedule({ title: 'Now' })), 'generated-1');

  assert.equal(
    await app.settle(app.notifications.schedule({ id: 'daily', title: 'Later', at })),
    'daily',
  );

  assert.deepEqual(app.calls('schedule'), [
    [{ title: 'Now' }],
    [{ id: 'daily', title: 'Later', at }],
  ]);
});

test('a time in the past or not a time is an error before anything crosses', async () => {
  const app = await launch();

  await assert.rejects(
    app.notifications.schedule({ title: 'Late', at: Date.now() - 1000 }),
    /notifications\.schedule: at is in the past/,
  );

  await assert.rejects(
    app.notifications.schedule({ title: 'Never', at: new Date('soon') }),
    /notifications\.schedule: at must be a Date or milliseconds since the epoch/,
  );

  assert.deepEqual(app.calls('schedule'), []);
});

test('cancel and cancelAll cross as they are', async () => {
  const app = await launch();

  await app.settle(app.notifications.cancel('daily'));
  await app.settle(app.notifications.cancelAll());

  assert.deepEqual(app.calls('cancel'), [['daily']]);
  assert.deepEqual(app.calls('cancelAll'), [[]]);
});

test('register resolves with the push service and the device’s token', async () => {
  const app = await launch();

  assert.deepEqual(data(await app.settle(app.notifications.register())), {
    service: 'apns',
    token: '00ab',
  });
});

test('watching received hears each notification while the app is in front, until removed', async () => {
  const app = await launch();
  const received: unknown[] = [];
  const subscription = app.notifications.watch('received', (notification) =>
    received.push(data(notification)),
  );
  const remote = { id: 'n1', title: 'Hi', remote: true, data: { thread: 7 } };

  assert.deepEqual(app.observed, ['start Notifications.received']);

  app.emit('Notifications', 'received', remote);
  subscription.remove();
  app.emit('Notifications', 'received', { id: 'n2', title: 'Late', remote: false });

  assert.deepEqual(received, [remote]);
  assert.deepEqual(app.observed, ['start Notifications.received', 'stop Notifications.received']);
});

test('watching an event notifications doesn’t send is an error naming the ones it does', async () => {
  const app = await launch();

  assert.throws(
    () => app.notifications.watch('tapped', () => {}),
    /notifications\.watch: no "tapped" event; watch received/,
  );
});
