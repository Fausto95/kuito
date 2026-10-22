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

// network as an app calls it, against a fake platform that answers like the
// iOS and Android modules.

interface NetworkState {
  type: string;
  isConnected: boolean;
  isInternetReachable: boolean;
  details: { isExpensive: boolean; cellularGeneration: string | null };
}

interface Scope {
  network: {
    readonly state: { readonly value: NetworkState };
    refresh(): Promise<NetworkState>;
  };
  showStatus(shown: boolean): void;
}

const wifi: NetworkState = {
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
  details: { isExpensive: false, cellularGeneration: null },
};

const cellular: NetworkState = {
  type: 'cellular',
  isConnected: true,
  isInternetReachable: true,
  details: { isExpensive: true, cellularGeneration: '5g' },
};

const offline: NetworkState = {
  type: 'none',
  isConnected: false,
  isInternetReachable: false,
  details: { isExpensive: false, cellularGeneration: null },
};

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-network-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/** Lets the kernel's scheduled updates reach the host. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0));

const code = compile('test/fixtures/network-app.tsx');

function network(current: () => NetworkState): Record<string, FakeModule> {
  return {
    Network: {
      functions: {
        state: { thread: 'js', run: current },
        refresh: { thread: 'background', run: current },
      },
    },
  };
}

async function app(current: () => NetworkState = () => wifi) {
  const native = fakeModules(network(current));
  const views = new Map<string, Record<string, unknown>>();
  const kernel = installKernel(
    hosting({
      createView(id: string) {
        views.set(id, {});
      },
      setProp(id: string, name: string, value: unknown) {
        const props = views.get(id);

        if (props) props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
      moveView() {},
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  const scope: Scope = kernel as never;

  return { ...native, ...scope, status: () => views.get('status')?.text };
}

test('network.state reads the platform synchronously, and refresh off the JS thread', async () => {
  let current = wifi;
  const net = await app(() => current);
  const refreshed = net.network.refresh();

  assert.deepEqual(data(net.network.state.value), wifi);
  current = cellular;
  assert.deepEqual(data(net.network.state.value), cellular);
  net.flush();
  assert.deepEqual(data(await refreshed), cellular);
  assert.deepEqual(net.observed, []);

  assert.deepEqual(
    net.calls.map((call) => call.method),
    ['state', 'state', 'refresh'],
  );
});

test('network.state follows the network while a component watches it', async () => {
  const net = await app();

  net.showStatus(true);
  await settle();
  assert.equal(net.status(), 'wifi online');
  assert.deepEqual(net.observed, ['start Network.state']);

  net.emit('Network', 'state', offline);
  await settle();
  assert.equal(net.status(), 'none offline');

  net.emit('Network', 'state', cellular);
  await settle();
  assert.equal(net.status(), 'cellular online');

  net.showStatus(false);
  await settle();
  assert.equal(net.status(), undefined);
  assert.deepEqual(net.observed, ['start Network.state', 'stop Network.state']);
});
