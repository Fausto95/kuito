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

// image.prefetch as an app calls it, against a fake platform that loads
// every image as the iOS and Android loaders do: one request per call, its
// size in pixels back, or the load's error.

interface Apis {
  image: { prefetch(src: unknown, options?: unknown): Promise<unknown> };
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-image-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/image-app.tsx');

async function apis(load: () => unknown = () => ({ width: 1200, height: 800 })) {
  const native = fakeModules({ Image: { functions: { prefetch: { thread: 'main', run: load } } } });
  const kernel = installKernel(
    hosting({ createView() {}, setProp() {}, removeView() {}, ...native.host }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  /** Settles the queued native calls, then lets the promises run. */
  const flush = async () => {
    native.flush();
    await new Promise<void>((done) => setTimeout(done, 0));
  };

  return { ...native, image: (kernel as never as Apis).image, flush };
}

test('prefetch loads a URL into both caches and resolves its size', async () => {
  const app = await apis();
  const size = app.image.prefetch('https://example.com/a.png');

  await app.flush();

  assert.deepEqual(data(await size), { width: 1200, height: 800 });

  assert.deepEqual(data(app.calls), [
    {
      module: 'Image',
      method: 'prefetch',
      args: [{ uri: 'https://example.com/a.png', headers: {}, cache: 'memory-disk' }],
    },
  ]);
});

test('prefetch sends a source’s headers and the caches it may fill', async () => {
  const app = await apis();
  const size = app.image.prefetch(
    { uri: 'https://example.com/a.png', headers: { Authorization: 'Bearer t' } },
    { cache: 'disk' },
  );

  await app.flush();
  await size;

  assert.deepEqual(data(app.calls[0].args), [
    { uri: 'https://example.com/a.png', headers: { Authorization: 'Bearer t' }, cache: 'disk' },
  ]);
});

test('prefetch rejects with the load’s error', async () => {
  const app = await apis(() => {
    throw { code: 'ERR_LOAD', message: 'HTTP 404' };
  });
  const failed = assert.rejects(app.image.prefetch('https://example.com/missing.png'), /HTTP 404/);

  await app.flush();
  await failed;
});

test('prefetch rejects a bundled image and a cache it cannot fill, without a call', async () => {
  const app = await apis();

  await assert.rejects(
    app.image.prefetch({ asset: 'cover', width: 10, height: 10 }),
    /image\.prefetch: .*bundled/,
  );

  await assert.rejects(
    app.image.prefetch('https://example.com/a.png', { cache: 'none' }),
    /image\.prefetch: cache must be memory-disk, memory or disk, not none/,
  );

  assert.deepEqual(app.calls, []);
});
