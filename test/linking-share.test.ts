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

// linking and share() as an app calls them, against a fake platform that
// answers like the iOS and Android modules.

interface Apis {
  linking: {
    open(url: string): Promise<void>;
    canOpen(url: string): Promise<boolean>;
    readonly url: { readonly value: string | null };
  };
  share(content: object, options?: object): Promise<{ action: string; activityType?: unknown }>;
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-apis-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/native-apis-app.tsx');

async function apis(modules: Record<string, FakeModule>) {
  const native = fakeModules(modules);
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  /** Settles the queued native calls, then lets the promises run. */
  const flush = async () => {
    native.flush();
    await new Promise<void>((done) => setTimeout(done, 0));
  };

  const scope: Apis = kernel as never;

  return {
    ...native,
    linking: scope.linking,
    share: (content: object, options?: object) => scope.share(content, options),
    flush,
  };
}

function linking(
  opened: string[] = [],
  latest: () => string | null = () => null,
): Record<string, FakeModule> {
  return {
    Linking: {
      functions: {
        openURL: {
          thread: 'main',
          run(url) {
            if (url === 'nope://x') throw { code: 'ERR_URL', message: 'No app opens nope://x' };

            opened.push(String(url));
          },
        },
        canOpenURL: { thread: 'main', run: (url) => String(url).startsWith('https:') },
        url: { thread: 'js', run: latest },
      },
    },
  };
}

test('linking opens URLs, and says which it can open', async () => {
  const opened: string[] = [];
  const app = await apis(linking(opened));

  const open = app.linking.open('https://www.tvmaze.com');
  const can = app.linking.canOpen('https://www.tvmaze.com');
  const cannot = app.linking.canOpen('nope://x');

  await app.flush();

  await open;
  assert.equal(await can, true);
  assert.equal(await cannot, false);
  assert.deepEqual(opened, ['https://www.tvmaze.com']);
});

test('a URL no app opens rejects with the platform’s code', async () => {
  const app = await apis(linking());
  const rejected = assert.rejects(
    app.linking.open('nope://x'),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, 'ERR_URL');
      assert.match(error.message, /Linking\.openURL.*No app opens nope:\/\/x/);

      return true;
    },
  );

  await app.flush();
  await rejected;
});

test('linking.url is the link that last opened the app, read synchronously', async () => {
  let latest: string | null = 'kuito://show/42';
  const launched = await apis(linking([], () => latest));
  const plain = await apis(linking());

  assert.equal(launched.linking.url.value, 'kuito://show/42');
  latest = 'kuito://library';
  assert.equal(launched.linking.url.value, 'kuito://library');
  assert.equal(plain.linking.url.value, null);
  assert.deepEqual(launched.observed, []);
});

function share(action: object): Record<string, FakeModule> {
  return { Share: { functions: { share: { thread: 'main', run: () => action } } } };
}

test('share() sends the content and options as one request', async () => {
  const app = await apis(share({ action: 'shared', activityType: 'com.apple.mail' }));
  const shared = app.share(
    { message: 'Severance', url: 'https://www.tvmaze.com/shows/44933', title: 'Watch this' },
    { dialogTitle: 'Share a show', subject: 'A show', excludedActivityTypes: ['airDrop'] },
  );

  await app.flush();

  assert.deepEqual(data(await shared), { action: 'shared', activityType: 'com.apple.mail' });

  assert.deepEqual(data(app.calls), [
    {
      module: 'Share',
      method: 'share',
      args: [
        {
          message: 'Severance',
          url: 'https://www.tvmaze.com/shows/44933',
          title: 'Watch this',
          dialogTitle: 'Share a show',
          subject: 'A show',
          excludedActivityTypes: ['airDrop'],
        },
      ],
    },
  ]);
});

test('a dismissed share sheet resolves with dismissed', async () => {
  const app = await apis(share({ action: 'dismissed' }));
  const shared = app.share({ message: 'Severance' });

  await app.flush();

  assert.deepEqual(data(await shared), { action: 'dismissed' });
});

test('share() needs a message or a url, before anything crosses', async () => {
  const app = await apis(share({ action: 'shared' }));

  await assert.rejects(app.share({ title: 'Nothing' }), {
    name: 'TypeError',
    message: /share\(\) needs a message or a url/,
  });

  assert.deepEqual(app.calls, []);
});
