import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeHttp } from './support/fake-http.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { standardHost } from './support/standard-host.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// FileSystem and Fonts as an app calls them, against a fake platform that
// answers like the iOS and Android modules. What matters here is what
// crosses: one request per call, every option filled in, and transfers that
// stream on the HTTP host (native/shared/Http.h), to and from the files the
// module's sandbox resolved.

type Progress = { bytes: number; total: number | null };
type Transfer<T> = Promise<T> & { cancel(): Promise<void> };

interface Apis {
  fileSystem: {
    readonly documents: string;
    readonly cache: string;
    readonly bundle: string;
    read(uri: string): Promise<string>;
    readBytes(uri: string, range?: object): Promise<ArrayBuffer>;
    write(uri: string, contents: string | ArrayBuffer, options?: object): Promise<void>;
    info(uri: string): Promise<{ exists: boolean }>;
    exists(uri: string): Promise<boolean>;
    createDirectory(uri: string, options?: object): Promise<void>;
    delete(uri: string, options?: object): Promise<void>;
    move(from: string, to: string): Promise<void>;
    copy(from: string, to: string): Promise<void>;
    list(uri: string): Promise<string[]>;
    download(
      url: string,
      to: string,
      options?: { headers?: Record<string, string>; onProgress?: (progress: Progress) => void },
    ): Transfer<{ uri: string; status: number }>;
    upload(
      url: string,
      from: string,
      options?: Record<string, unknown> & { onProgress?: (progress: Progress) => void },
    ): Transfer<{ status: number; body: string }>;
  };
  fonts: {
    load(fonts: Record<string, unknown>): Promise<void>;
    loaded(family: string): boolean;
  };
}

/** Values from the kernel's realm, comparable with this one's. */
const isBuffer = (value: unknown): value is ArrayBuffer =>
  Object.prototype.toString.call(value) === '[object ArrayBuffer]';

/** `value` as plain data in this realm, an ArrayBuffer as its bytes. */
const data = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, each: unknown) =>
      isBuffer(each) ? { bytes: [...new Uint8Array(each)] } : each,
    ),
  );

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-file-system-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/file-system-app.tsx');

const DOCUMENT = 'file:///data/app/Documents/';

function fileSystem(overrides: FakeModule['functions'] = {}): FakeModule {
  const background = (run: (...args: unknown[]) => unknown) => ({
    thread: 'background' as const,
    run,
  });

  return {
    functions: {
      // The canonical URI of a file the sandbox lets the app read or write.
      sandboxed: {
        thread: 'js',
        run(uri) {
          if (!String(uri).startsWith('file:///data/app/'))
            throw { code: 'ERR_SANDBOX', message: `${String(uri)} is outside the app's sandbox` };

          return String(uri).replace('/./', '/');
        },
      },
      directories: {
        thread: 'js',
        run: () => ({
          document: DOCUMENT,
          cache: 'file:///data/app/Caches/',
          bundle: 'file:///app/Kuito.app/',
        }),
      },
      getInfo: background((uri) => ({ exists: uri === DOCUMENT + 'notes.txt', uri })),
      readText: background(() => 'hello'),
      readBytes: background(() => new Uint8Array([104, 105]).buffer),
      writeText: background(() => null),
      writeBytes: background(() => null),
      makeDirectory: background(() => null),
      delete: background(() => null),
      move: background(() => null),
      copy: background(() => null),
      readDirectory: background(() => ['notes.txt']),
      ...overrides,
    },
  };
}

function fonts(loaded = new Set<string>()): FakeModule {
  return {
    functions: {
      load: {
        thread: 'main',
        run(faces) {
          for (const face of faces as { family: string }[]) loaded.add(face.family);
        },
      },
      isLoaded: { thread: 'js', run: (family) => loaded.has(family as string) },
    },
  };
}

async function apis(modules: Record<string, FakeModule> = {}) {
  const native = fakeModules({ FileSystem: fileSystem(), Fonts: fonts(), ...modules });
  const http = fakeHttp();
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      ...native.host,
      ...standardHost(),
      ...http.globals,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  /** Re-evaluates the app, as a Live Patch does, while native work runs on. */
  const patch = async () => runInNewContext(await code, kernel);

  /** Settles the queued native calls, then lets the promises run. */
  const flush = async () => {
    native.flush();
    await new Promise<void>((done) => setTimeout(done, 0));
  };

  const scope: Apis = kernel as never;

  /** Starts `call`, settles what it queued, and returns its result. */
  async function run<T>(call: () => Promise<T>): Promise<T> {
    const [result] = await Promise.all([call(), flush()]);

    return result;
  }

  return {
    ...native,
    kernel,
    http: { requests: http.requests, cancelled: http.cancelled, ...http.server(kernel) },
    get allCalls() {
      return native.calls;
    },
    /** The calls that do the work: the app reads the directories once, when it starts. */
    get calls() {
      return native.calls.filter((call) => call.method !== 'directories');
    },
    get fileSystem() {
      return scope.fileSystem;
    },
    get fonts() {
      return scope.fonts;
    },
    run,
    flush,
    patch,
  };
}

const typeError = (pattern: RegExp) => (error: Error) => {
  assert.equal(error.name, 'TypeError');
  assert.match(error.message, pattern);

  return true;
};

test('the directories are file:// URIs, read synchronously once', async () => {
  const app = await apis();

  assert.equal(app.fileSystem.documents, DOCUMENT);
  assert.equal(app.fileSystem.cache, 'file:///data/app/Caches/');
  assert.equal(app.fileSystem.bundle, 'file:///app/Kuito.app/');
  assert.equal(app.fileSystem.documents, DOCUMENT);

  assert.deepEqual(app.allCalls.filter((call) => call.method === 'directories').length, 1);
});

test('text and bytes read and write with one request each, every option filled in', async () => {
  const app = await apis();
  const uri = DOCUMENT + 'notes.txt';
  const chunk = new Uint8Array([33]).buffer;

  await app.run(() => app.fileSystem.write(uri, 'hello'));
  await app.run(() => app.fileSystem.write(uri, chunk, { append: true }));

  assert.equal(await app.run(() => app.fileSystem.read(uri)), 'hello');

  const head = await app.run(() => app.fileSystem.readBytes(uri, { position: 4, length: 2 }));

  assert.ok(isBuffer(head));
  assert.deepEqual([...new Uint8Array(head)], [104, 105]);

  await app.run(() => app.fileSystem.readBytes(uri));

  assert.deepEqual(data(app.calls.map(({ method, args }) => ({ method, args }))), [
    { method: 'writeText', args: [{ uri, contents: 'hello', append: false }] },
    { method: 'writeBytes', args: [{ uri, contents: { bytes: [33] }, append: true }] },
    { method: 'readText', args: [uri] },
    { method: 'readBytes', args: [{ uri, position: 4, length: 2 }] },
    { method: 'readBytes', args: [{ uri, position: null, length: null }] },
  ]);
});

test('a bad byte range, contents or URI fails before anything crosses', async () => {
  const app = await apis();
  const uri = DOCUMENT + 'notes.txt';

  await assert.rejects(
    app.fileSystem.readBytes(uri, { position: -1 }),
    typeError(/fileSystem\.readBytes: position must be a whole number of bytes/),
  );

  await assert.rejects(
    app.fileSystem.write(uri, new Uint8Array([1]) as never),
    typeError(/fileSystem\.write: contents must be a string or an ArrayBuffer/),
  );

  await assert.rejects(
    app.fileSystem.info('/data/app/Documents/notes.txt'),
    typeError(/fileSystem\.info: '\/data\/app\/Documents\/notes\.txt' is not a file:\/\/ URI/),
  );

  assert.deepEqual(app.calls, []);
});

test('file operations cross with their options, and exists reads getInfo', async () => {
  const app = await apis();
  const dir = DOCUMENT + 'photos/';

  assert.equal(await app.run(() => app.fileSystem.exists(DOCUMENT + 'notes.txt')), true);
  assert.equal(await app.run(() => app.fileSystem.exists(DOCUMENT + 'gone.txt')), false);
  await app.run(() => app.fileSystem.createDirectory(dir));
  await app.run(() => app.fileSystem.createDirectory(dir + 'a/b/', { intermediates: true }));
  await app.run(() => app.fileSystem.delete(dir));
  await app.run(() => app.fileSystem.delete(dir, { idempotent: true }));
  await app.run(() => app.fileSystem.move(DOCUMENT + 'a', DOCUMENT + 'b'));
  await app.run(() => app.fileSystem.copy(DOCUMENT + 'b', DOCUMENT + 'c'));

  assert.deepEqual(data(await app.run(() => app.fileSystem.list(DOCUMENT))), ['notes.txt']);

  assert.deepEqual(data(app.calls.map(({ method, args }) => [method, ...args])), [
    ['getInfo', DOCUMENT + 'notes.txt'],
    ['getInfo', DOCUMENT + 'gone.txt'],
    ['makeDirectory', dir, false],
    ['makeDirectory', dir + 'a/b/', true],
    ['delete', dir, false],
    ['delete', dir, true],
    ['move', DOCUMENT + 'a', DOCUMENT + 'b'],
    ['copy', DOCUMENT + 'b', DOCUMENT + 'c'],
    ['readDirectory', DOCUMENT],
  ]);
});

test("info gives an entry's last change in milliseconds, as File.lastModified", async () => {
  const app = await apis({
    FileSystem: fileSystem({
      getInfo: {
        thread: 'background',
        run: (uri) => ({
          exists: true,
          uri,
          isDirectory: false,
          size: 11,
          modificationTime: 1.5e9,
        }),
      },
    }),
  });

  assert.deepEqual(data(await app.run(() => app.fileSystem.info(DOCUMENT + 'notes.txt'))), {
    exists: true,
    uri: DOCUMENT + 'notes.txt',
    isDirectory: false,
    size: 11,
    lastModified: 1.5e12,
  });
});

/** The kernel's side of transfer progress. */
interface ProgressCallback {
  __kuitoHttpProgress(id: number, bytes: number, total: number): void;
}

const progressOf = (kernel: object) => kernel as ProgressCallback;

test('a download streams to the sandboxed file on the HTTP host, hearing only its own progress', async () => {
  const app = await apis();
  const heard: [string, Progress][] = [];
  const photo = app.fileSystem.download('https://example.com/a.jpg', DOCUMENT + './a.jpg', {
    headers: { Authorization: 'Bearer t' },
    onProgress: (progress) => heard.push(['a', data(progress) as Progress]),
  });
  const other = app.fileSystem.download('https://example.com/b.jpg', DOCUMENT + 'b.jpg', {
    onProgress: (progress) => heard.push(['b', data(progress) as Progress]),
  });
  const [first, second] = app.http.requests;
  const kernel = progressOf(app.kernel);

  assert.deepEqual(data(app.calls.map(({ method, args }) => [method, ...args])), [
    ['sandboxed', DOCUMENT + './a.jpg', 'write'],
    ['sandboxed', DOCUMENT + 'b.jpg', 'write'],
  ]);

  assert.deepEqual(data(first), {
    id: first.id,
    url: 'https://example.com/a.jpg',
    method: 'GET',
    headers: [['authorization', 'Bearer t']],
    saveTo: DOCUMENT + 'a.jpg',
    progress: 'receive',
    streaming: false,
  });

  kernel.__kuitoHttpProgress(first.id, 512, 1024);
  kernel.__kuitoHttpProgress(second.id, 10, -1);
  kernel.__kuitoHttpProgress(first.id, 1024, 1024);
  app.http.respond(first.id, { headers: { 'Content-Type': 'image/jpeg; q=1', ETag: 'x' } });
  app.http.respond(second.id);

  assert.deepEqual(data(await photo), {
    uri: DOCUMENT + './a.jpg',
    status: 200,
    headers: { 'content-type': 'image/jpeg; q=1', etag: 'x' },
    mimeType: 'image/jpeg',
  });

  await other;

  assert.deepEqual(heard, [
    ['a', { bytes: 512, total: 1024 }],
    ['b', { bytes: 10, total: null }],
    ['a', { bytes: 1024, total: 1024 }],
  ]);
});

test('a download without onProgress asks the host for no progress', async () => {
  const app = await apis();
  const download = app.fileSystem.download('https://example.com/a.jpg', DOCUMENT + 'a.jpg');

  assert.equal('progress' in app.http.requests[0], false);
  app.http.respond(app.http.requests[0].id);
  await download;
});

test('a download outside 200–299 rejects with ERR_HTTP', async () => {
  const app = await apis();
  const download = app.fileSystem.download('https://example.com/gone', DOCUMENT + 'a.jpg');

  app.http.respond(app.http.requests[0].id, { status: 404 });

  await assert.rejects(download, (error: Error & { code?: string }) => {
    assert.equal(error.code, 'ERR_HTTP');
    assert.match(error.message, /fileSystem\.download: .*404/);

    return true;
  });
});

test('cancel stops the transfer on the host, which rejects with ERR_CANCELED', async () => {
  const app = await apis();
  const transfer = app.fileSystem.download('https://example.com/a.jpg', DOCUMENT + 'a.jpg');
  const { id } = app.http.requests[0];

  await transfer.cancel();

  await assert.rejects(transfer, (error: Error & { code?: string }) => {
    assert.equal(error.code, 'ERR_CANCELED');
    assert.match(error.message, /fileSystem\.download/);

    return true;
  });

  assert.deepEqual(app.http.cancelled, [id]);
});

test('a transfer that fails on the way rejects with ERR_NETWORK and the platform’s message', async () => {
  const app = await apis();
  const download = app.fileSystem.download('https://example.com/a.jpg', DOCUMENT + 'a.jpg');

  app.http.end(app.http.requests[0].id, '', 'The network connection was lost.');

  await assert.rejects(download, (error: Error & { code?: string }) => {
    assert.equal(error.code, 'ERR_NETWORK');
    assert.match(error.message, /connection was lost/);

    return true;
  });
});

test('a file outside the sandbox rejects with the module’s ERR_SANDBOX before anything is sent', async () => {
  const app = await apis();

  await assert.rejects(
    app.fileSystem.download('https://example.com/a.jpg', 'file:///etc/hosts'),
    (error: Error & { code?: string }) => error.code === 'ERR_SANDBOX',
  );

  await assert.rejects(
    app.fileSystem.upload('https://example.com/up', 'file:///etc/hosts'),
    (error: Error & { code?: string }) => error.code === 'ERR_SANDBOX',
  );

  assert.equal(app.http.requests.length, 0);
});

test('an upload sends the file as the whole body, and resolves with the response whatever its status', async () => {
  const app = await apis();
  const from = DOCUMENT + 'a.jpg';
  const plain = app.fileSystem.upload('https://example.com/up', from);
  const typed = app.fileSystem.upload('https://example.com/up', from, {
    method: 'PUT',
    mimeType: 'image/jpeg',
    onProgress() {},
  });
  const [first, second] = app.http.requests;

  assert.deepEqual(data(app.calls.map(({ method, args }) => [method, ...args])), [
    ['sandboxed', from, 'read'],
    ['sandboxed', from, 'read'],
  ]);

  assert.deepEqual(data([first.method, first.headers, first.body]), ['POST', [], { file: from }]);

  assert.deepEqual(data([second.method, second.headers, second.progress]), [
    'PUT',
    [['content-type', 'image/jpeg']],
    'send',
  ]);

  app.http.respond(first.id, { status: 201, headers: { Location: '/a' }, body: 'ok' });
  app.http.respond(second.id, { status: 500, body: 'nope' });
  assert.deepEqual(data(await plain), { status: 201, headers: { location: '/a' }, body: 'ok' });
  assert.equal((await typed).status, 500);
});

test('a multipart upload wraps the file in a form, its fields first', async () => {
  const app = await apis();
  const upload = app.fileSystem.upload('https://example.com/up', DOCUMENT + 'photos/a.jpg', {
    headers: { 'X-Key': '1' },
    uploadType: 'multipart',
    fieldName: 'photo',
    mimeType: 'image/jpeg',
    parameters: { album: 'trips' },
  });
  const [sent] = app.http.requests;
  const type = sent.headers.find(([name]) => name === 'content-type')?.[1] ?? '';
  const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(type)?.[1];
  const body = sent.body as { file: string; prefix: ArrayBuffer; suffix: ArrayBuffer };
  const text = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

  assert.ok(boundary, type);
  assert.equal(body.file, DOCUMENT + 'photos/a.jpg');

  assert.equal(
    text(body.prefix),
    `--${boundary}\r\nContent-Disposition: form-data; name="album"\r\n\r\ntrips\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\n` +
      'Content-Type: image/jpeg\r\n\r\n',
  );

  assert.equal(text(body.suffix), `\r\n--${boundary}--\r\n`);

  assert.deepEqual(
    sent.headers.find(([name]) => name === 'x-key'),
    ['x-key', '1'],
  );

  app.http.respond(sent.id, { status: 200, body: '{}' });
  await upload;
});

test('fonts.load sends every face of every family, 400 normal unless declared', async () => {
  const app = await apis();

  await app.run(() =>
    app.fonts.load({
      Lato: [
        DOCUMENT + 'Lato-Regular.ttf',
        { uri: DOCUMENT + 'Lato-Bold.ttf', weight: 'bold' },
        { uri: DOCUMENT + 'Lato-LightItalic.ttf', weight: 300, style: 'italic' },
      ],
      Pacifico: DOCUMENT + 'Pacifico.ttf',
    }),
  );

  assert.deepEqual(data(app.calls), [
    {
      module: 'Fonts',
      method: 'load',
      args: [
        [
          { family: 'Lato', uri: DOCUMENT + 'Lato-Regular.ttf', weight: 400, style: 'normal' },
          { family: 'Lato', uri: DOCUMENT + 'Lato-Bold.ttf', weight: 700, style: 'normal' },
          {
            family: 'Lato',
            uri: DOCUMENT + 'Lato-LightItalic.ttf',
            weight: 300,
            style: 'italic',
          },
          { family: 'Pacifico', uri: DOCUMENT + 'Pacifico.ttf', weight: 400, style: 'normal' },
        ],
      ],
    },
  ]);

  assert.equal(app.fonts.loaded('Lato'), true);
  assert.equal(app.fonts.loaded('Inter'), false);
});

test('fonts.load rejects a bad family, URI, weight or style before anything crosses', async () => {
  const app = await apis();
  const uri = DOCUMENT + 'Lato.ttf';

  await assert.rejects(
    app.fonts.load({ '': uri }),
    typeError(/fonts\.load: a family needs a name/),
  );

  await assert.rejects(
    app.fonts.load({ Lato: 'https://example.com/Lato.ttf' }),
    typeError(
      /fonts\.load: Lato's 'https:\/\/example\.com\/Lato\.ttf' is not a file:\/\/ URI; download it with fileSystem\.download first/,
    ),
  );

  await assert.rejects(
    app.fonts.load({ Lato: { uri, weight: 450 } }),
    typeError(/fonts\.load: Lato's weight must be normal, bold or 100 to 900 in hundreds, not 450/),
  );

  await assert.rejects(
    app.fonts.load({ Lato: { uri, style: 'oblique' } }),
    typeError(/fonts\.load: Lato's style must be normal or italic, not oblique/),
  );

  await assert.rejects(app.fonts.load({ Lato: [] }), typeError(/fonts\.load: Lato has no files/));

  assert.deepEqual(app.calls, []);
});
