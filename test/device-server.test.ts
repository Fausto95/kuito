import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { DevicePatchHub } from '../src/dev/device-server.ts';

class FakeClient extends EventEmitter {
  readyState = 1;
  messages: unknown[] = [];
  send(value: string) {
    this.messages.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

test('device receives compiled source patch, not native view stream', () => {
  const hub = new DevicePatchHub();
  const first = new FakeClient();

  hub.attach(first);

  // The patch is the compiler's output: its code and revision, not a file to read again.
  assert.deepEqual(
    hub.patch({ path: '/out/patch-1.js', code: 'globalThis.count = 1;', revision: 1 }),
    {
      revision: 1,
      delivered: 1,
    },
  );

  assert.deepEqual(first.messages, [
    { type: 'patch', revision: 1, source: 'globalThis.count = 1;' },
  ]);

  hub.patch({ path: '/out/patch-4.js', code: 'globalThis.count = 2;', revision: 4 });

  const second = new FakeClient();

  hub.attach(second);

  assert.deepEqual(second.messages, [
    { type: 'patch', revision: 4, source: 'globalThis.count = 2;' },
  ]);

  hub.close();
  assert.equal(first.readyState, 3);
  assert.equal(second.readyState, 3);
});

test('a device says who it is, and acks each patch it applies or rejects', () => {
  const hub = new DevicePatchHub();
  const phone = new FakeClient();
  const devices: unknown[] = [];
  const acks: unknown[] = [];
  const say = (message: object) => phone.emit('message', JSON.stringify(message));

  hub.on('device', (event) => devices.push(event));
  hub.on('ack', (ack) => acks.push(ack));
  hub.attach(phone);
  say({ type: 'hello', id: 'A1', name: 'iPhone 18 Pro', platform: 'ios' });

  assert.deepEqual(devices, [
    { connected: true, device: { id: 'A1', name: 'iPhone 18 Pro', platform: 'ios' } },
  ]);

  hub.patch({ path: '/out/patch-1.js', code: 'ok()', revision: 1 });
  say({ type: 'applied', revision: 1, ms: 12.5 });
  hub.patch({ path: '/out/patch-2.js', code: 'boom()', revision: 2 });
  say({ type: 'rejected', revision: 2, code: 'EVALUATION', message: 'boom is not defined' });

  assert.deepEqual(acks, [
    {
      device: { id: 'A1', name: 'iPhone 18 Pro', platform: 'ios' },
      revision: 1,
      ok: true,
      ms: 12.5,
    },
    {
      device: { id: 'A1', name: 'iPhone 18 Pro', platform: 'ios' },
      revision: 2,
      ok: false,
      code: 'EVALUATION',
      message: 'boom is not defined',
    },
  ]);

  phone.close();

  assert.deepEqual(devices[1], {
    connected: false,
    device: { id: 'A1', name: 'iPhone 18 Pro', platform: 'ios' },
  });

  hub.close();
});

test('a malformed device message is rejected with its reason, and changes nothing', () => {
  const hub = new DevicePatchHub();
  const phone = new FakeClient();
  const errors: string[] = [];
  const acks: unknown[] = [];

  hub.on('error', (error) => errors.push(error.message));
  hub.on('ack', (ack) => acks.push(ack));
  hub.attach(phone);
  phone.emit('message', JSON.stringify({ type: 'applied', revision: 'one', ms: 3 }));
  phone.emit('message', JSON.stringify({ type: 'teleport' }));
  phone.emit('message', 'not json');

  assert.deepEqual(acks, []);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Device message rejected: applied\.revision must be an integer/);
  assert.match(errors[1], /Device message rejected: unknown type teleport/);
  hub.close();
});

const TOKEN = 'k'.repeat(43);
const AUTH = { authorization: `Bearer ${TOKEN}` };

test('device patch server refuses non-loopback binding', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');

  await assert.rejects(
    () => startDevicePatchServer({ bind: '0.0.0.0', token: TOKEN }),
    /loopback-only/,
  );
});

test('the dev server refuses a wildcard or LAN address for the phone link', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');

  for (const tunnel of ['::', '0.0.0.0', '192.168.1.10'])
    await assert.rejects(
      () => startDevicePatchServer({ port: 0, token: TOKEN, tunnel }),
      /loopback or a phone's tunnel/,
      tunnel,
    );
});

test('the dev server refuses a token too short to guess at', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');

  await assert.rejects(() => startDevicePatchServer({ port: 0, token: 'short' }), /token/);
});

/** The status a WebSocket upgrade gets: 101 once it opens. */
async function upgrade(url: string, headers: Record<string, string> = {}) {
  const { WebSocket } = await import('ws');

  return new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(url, { headers });

    socket.once('open', () => {
      socket.close();
      resolve(101);
    });

    socket.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
    socket.once('error', reject);
  });
}

test('every socket and route refuses a client without the session token, loopback too', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');
  const server = await startDevicePatchServer({ port: 0, token: TOKEN });
  const base = `127.0.0.1:${(server.address as { port: number }).port}`;
  const sockets = [
    '/',
    '/inspector/device?device=A1&name=Phone&app=demo',
    '/inspector/debug/A1-js',
    '/inspector/components/A1-js',
  ];
  const routes = [
    '/json',
    '/json/list',
    '/json/version',
    '/components/panel.js',
    '/components/A1-js',
  ];

  try {
    for (const path of sockets) {
      assert.equal(await upgrade(`ws://${base}${path}`), 401, path);
      assert.notEqual(await upgrade(`ws://${base}${path}`, AUTH), 401, path);
    }

    for (const path of routes) {
      assert.equal((await fetch(`http://${base}${path}`)).status, 401, path);
      assert.notEqual((await fetch(`http://${base}${path}`, { headers: AUTH })).status, 401, path);
    }

    assert.notEqual(
      await upgrade(`ws://${base}/inspector/debug/A1-js?token=${TOKEN}`),
      401,
      'a DevTools frontend sends it in the URL',
    );
  } finally {
    await server.close();
  }
});

test('a web page or a rebound host name cannot reach the server, even with the token', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');
  const server = await startDevicePatchServer({ port: 0, token: TOKEN });
  const { port } = server.address as { port: number };
  const base = `127.0.0.1:${port}`;

  try {
    assert.equal(await upgrade(`ws://${base}`, { ...AUTH, origin: 'https://evil.example' }), 403);
    assert.equal(await upgrade(`ws://${base}`, { ...AUTH, host: `evil.example:${port}` }), 403);
    assert.equal(await upgrade(`ws://${base}`, { ...AUTH, origin: 'devtools://devtools' }), 101);

    assert.equal(
      (
        await fetch(`http://${base}/json/list`, {
          headers: { ...AUTH, origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
  } finally {
    await server.close();
  }
});

test('a fake device cannot read a project file through the debugger without the token', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');
  const dir = await mkdtemp(join(tmpdir(), 'kuito-steal-'));
  const server = await startDevicePatchServer({ port: 0, root: dir, token: TOKEN });
  const base = `127.0.0.1:${(server.address as { port: number }).port}`;

  try {
    await writeFile(join(dir, '.env'), 'SECRET=1');

    // The chain needs a registered device first: without the token it never registers.
    assert.equal(await upgrade(`ws://${base}/inspector/device?device=X&name=X&app=x`), 401);
    assert.equal(await upgrade(`ws://${base}/inspector/debug/X-js`), 401);
    assert.deepEqual(await (await fetch(`http://${base}/json/list`, { headers: AUTH })).json(), []);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('the phone link takes the session token like loopback does', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');
  // ::1 stands in for the Mac's CoreDevice tunnel address: any listener but loopback's own.
  const server = await startDevicePatchServer({ port: 0, token: TOKEN, tunnel: '::1' });
  const { port } = server.address as { port: number };

  try {
    assert.equal(await upgrade(`ws://[::1]:${port}`), 401);

    assert.equal(
      await upgrade(`ws://[::1]:${port}`, { authorization: `Bearer ${'x'.repeat(43)}` }),
      401,
    );

    assert.equal(await upgrade(`ws://[::1]:${port}`, AUTH), 101);
    assert.equal(await upgrade(`ws://127.0.0.1:${port}`, AUTH), 101);
  } finally {
    await server.close();
  }
});

test('a devtools command reaches every connected device but is not replayed', () => {
  const hub = new DevicePatchHub();
  const phone = new FakeClient();
  const tablet = new FakeClient();

  hub.attach(phone);
  hub.attach(tablet);
  hub.command('devtools');

  assert.deepEqual(phone.messages, [{ type: 'command', name: 'devtools' }]);
  assert.deepEqual(tablet.messages, [{ type: 'command', name: 'devtools' }]);

  const late = new FakeClient();

  hub.attach(late);
  assert.deepEqual(late.messages, [], 'commands are one-shot, unlike the last patch');
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a device log is reported with its source line and answered with symbolicated frames', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-device-'));

  try {
    const { createSourceCompiler } = await import('../src/dev/compiler.ts');
    const output = await createSourceCompiler({ platform: 'ios', outputDir: dir })(
      'test/fixtures/logbox-app.tsx',
    );
    const lines = output.code.split('\n');
    const line = lines.findIndex((text) => text.includes('new Error("boom")'));
    const column = (lines[line] ?? '').indexOf('new Error("boom")') + 1;
    const hub = new DevicePatchHub({ root: process.cwd() });
    const phone = new FakeClient();
    const tablet = new FakeClient();
    const reported: unknown[] = [];

    hub.on('console', (entry) => reported.push(entry));
    hub.patch(output);
    hub.attach(phone);
    hub.attach(tablet);
    phone.messages.length = 0;
    tablet.messages.length = 0;

    const stack = `Error: boom\n    at explode (kuito://patch/1:${line + 1}:${column})`;

    phone.emit('message', JSON.stringify({ type: 'log', level: 'log', message: 'hi', stack }));

    phone.emit(
      'message',
      JSON.stringify({ type: 'log', id: '7', level: 'error', message: 'Error: boom', stack }),
    );

    await settle();

    assert.deepEqual(
      reported.map((entry) => ({ ...(entry as object), column: 0 })),
      [
        { level: 'log', message: 'hi', file: 'test/fixtures/logbox-app.tsx', line: 4, column: 0 },
        {
          level: 'error',
          message: 'Error: boom',
          file: 'test/fixtures/logbox-app.tsx',
          line: 4,
          column: 0,
        },
      ],
    );

    const [answer] = phone.messages as {
      type: string;
      id: string;
      frames: { file?: string }[];
      codeFrame?: { frame: string };
    }[];

    assert.equal(phone.messages.length, 1, 'only entries with an id are answered');
    assert.equal(answer?.type, 'symbolicated');
    assert.equal(answer?.id, '7');
    assert.equal(answer?.frames[0]?.file, 'test/fixtures/logbox-app.tsx');
    assert.match(answer?.codeFrame?.frame ?? '', /throw new Error\('boom'\)/);
    assert.deepEqual(tablet.messages, [], 'the answer goes to the device that asked');
    hub.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a UI-thread frame is reported at its source, as the JS thread's are", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-device-ui-'));

  try {
    const { createSourceCompiler } = await import('../src/dev/compiler.ts');
    const output = await createSourceCompiler({ platform: 'ios', outputDir: dir })(
      'test/fixtures/logbox-ui-app.tsx',
    );
    const lines = output.ui.split('\n');
    const line = lines.findIndex((text) => text.includes('new Error("ui boom")'));
    const column = (lines[line] ?? '').indexOf('new Error("ui boom")') + 1;
    const hub = new DevicePatchHub({ root: process.cwd() });
    const phone = new FakeClient();
    const reported: { file?: string; line?: number }[] = [];

    hub.on('console', (entry) => reported.push(entry));
    hub.patch(output);
    hub.attach(phone);

    // The UI runtime names the bundle by the URL the compiler gave it (src/runtime/operations.ts).
    const stack = `Error: ui boom\n    at onPress (${output.uiUrl}:${line + 1}:${column})`;

    phone.emit(
      'message',
      JSON.stringify({ type: 'log', level: 'error', message: 'Error: ui boom', stack }),
    );

    await settle();

    assert.ok(line >= 0, 'the handler runs on the UI thread');
    assert.equal(reported[0]?.file, 'test/fixtures/logbox-ui-app.tsx');
    assert.equal(reported[0]?.line, 8);
    hub.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a device asking to open a frame reaches the hub as an editor location', async () => {
  const hub = new DevicePatchHub();
  const phone = new FakeClient();
  const opened: unknown[] = [];
  const problems: Error[] = [];

  hub.on('open', (location) => opened.push(location));
  hub.on('error', (error) => problems.push(error));
  hub.attach(phone);
  phone.emit('message', JSON.stringify({ type: 'open', file: 'src/App.tsx', line: 3, column: 9 }));
  phone.emit('message', JSON.stringify({ type: 'open', file: 'src/App.tsx' }));
  phone.emit('message', 'not json');
  await settle();

  assert.deepEqual(opened, [{ file: 'src/App.tsx', line: 3, column: 9 }]);
  assert.equal(problems.length, 2, 'malformed messages are reported, not thrown');
  hub.close();
});

interface Page {
  id: string;
  webSocketDebuggerUrl: string;
}

const isPages = (value: unknown): value is Page[] =>
  Array.isArray(value) &&
  value.every(
    (page) => typeof page?.id === 'string' && typeof page?.webSocketDebuggerUrl === 'string',
  );

const getJson = async (url: string): Promise<unknown> =>
  (await fetch(url, { headers: AUTH })).json();

/** The source map a `data:` URL carries. */
function inlineMap(url: unknown) {
  const prefix = 'data:application/json;charset=utf-8;base64,';

  assert.ok(typeof url === 'string' && url.startsWith(prefix), `not an inline map: ${String(url)}`);

  return JSON.parse(Buffer.from(url.slice(prefix.length), 'base64').toString('utf8'));
}

test('the dev server lists inspector pages over HTTP and relays CDP between sockets', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');
  const { WebSocket } = await import('ws');
  const dir = await mkdtemp(join(tmpdir(), 'kuito-inspector-'));
  const server = await startDevicePatchServer({ port: 0, root: dir, token: TOKEN });
  const { port } = server.address as { port: number };
  const base = `127.0.0.1:${port}`;
  const opened = async (url: string) => {
    const socket = new WebSocket(url, { headers: AUTH });

    await once(socket, 'open');

    return socket;
  };
  const next = async (socket: InstanceType<typeof WebSocket>) =>
    String((await once(socket, 'message'))[0]);

  try {
    const patches = await opened(`ws://${base}`);
    const device = await opened(
      `ws://${base}/inspector/device?device=A1&name=iPhone%2018%20Pro&app=dev.kuito.demo`,
    );
    const filename = join(dir, 'patch.js');

    await writeFile(filename, 'globalThis.count = 1;');

    await writeFile(
      filename + '.map',
      JSON.stringify({ version: 3, sources: ['app.tsx'], mappings: 'AAAA' }),
    );

    const patched = next(patches);

    server.hub.patch({
      path: filename,
      code: 'globalThis.count = 1;',
      map: JSON.stringify({ version: 3, sources: ['app.tsx'], mappings: 'AAAA' }),
      revision: 1,
    });

    assert.equal(JSON.parse(await patched).type, 'patch', 'the patch socket still lives at /');

    device.send('targets\u001f[{"id":"js","title":"JS thread"}]');

    const deadline = Date.now() + 5000;
    let pages: Page[] = [];

    while (!pages.length && Date.now() < deadline) {
      const listed = await getJson(`http://${base}/json/list`);

      pages = isPages(listed) ? listed : [];
    }

    assert.deepEqual(
      pages.map((page) => [page.id, page.webSocketDebuggerUrl]),
      [['A1-js', `ws://${base}/inspector/debug/A1-js?token=${TOKEN}`]],
    );

    assert.deepEqual(await getJson(`http://${base}/json`), pages);

    assert.deepEqual(await getJson(`http://${base}/json/version`), {
      Browser: 'Kuito/Hermes',
      'Protocol-Version': '1.3',
    });

    const connect = next(device);
    const frontend = await opened(pages[0]?.webSocketDebuggerUrl ?? '');

    assert.equal(await connect, 'connect\u001fjs');

    const command = next(device);

    frontend.send('{"id":1,"method":"Runtime.enable"}');
    assert.equal(await command, 'cdp\u001fjs\u001f{"id":1,"method":"Runtime.enable"}');

    const reply = next(frontend);

    device.send(
      'cdp\u001fjs\u001f' +
        JSON.stringify({
          method: 'Debugger.scriptParsed',
          params: { scriptId: '1', url: 'kuito://patch/1' },
        }),
    );

    assert.deepEqual(inlineMap(JSON.parse(await reply).params.sourceMapURL), {
      version: 3,
      sources: [pathToFileURL(join(dir, 'app.tsx')).href],
      mappings: 'AAAA',
    });

    // Hermes keeps no source for DevTools; the dev server has each patch.
    const source = next(frontend);

    frontend.send('{"id":2,"method":"Debugger.getScriptSource","params":{"scriptId":"1"}}');

    assert.deepEqual(JSON.parse(await source), {
      id: 2,
      result: { scriptSource: 'globalThis.count = 1;' },
    });

    // Android's bundled app is bytecode: Hermes names it by the file it was compiled from.
    const bytecode = next(frontend);

    device.send(
      'cdp\u001fjs\u001f' +
        JSON.stringify({ method: 'Debugger.scriptParsed', params: { url: filename } }),
    );

    assert.deepEqual(inlineMap(JSON.parse(await bytecode).params.sourceMapURL).sources, [
      pathToFileURL(join(dir, 'app.tsx')).href,
    ]);

    const outside = next(frontend);

    device.send(
      'cdp\u001fjs\u001f' +
        JSON.stringify({ method: 'Debugger.scriptParsed', params: { url: '/etc/hosts.js' } }),
    );

    assert.equal(
      JSON.parse(await outside).params.sourceMapURL,
      undefined,
      'files outside the project are never read',
    );

    assert.equal((await fetch(`http://${base}/nothing`, { headers: AUTH })).status, 404);

    for (const socket of [patches, device, frontend]) socket.close();
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('the dev server serves the Components panel and relays it to the kernel', async () => {
  const { startDevicePatchServer } = await import('../src/dev/device-server.ts');
  const { WebSocket } = await import('ws');
  const server = await startDevicePatchServer({ port: 0, token: TOKEN });
  const base = `127.0.0.1:${(server.address as { port: number }).port}`;
  const opened = async (url: string) => {
    const socket = new WebSocket(url, { headers: AUTH });

    await once(socket, 'open');

    return socket;
  };
  const next = async (socket: InstanceType<typeof WebSocket>) =>
    String((await once(socket, 'message'))[0]);

  try {
    const device = await opened(`ws://${base}/inspector/device?device=A1&name=Pixel&app=demo`);
    const deadline = Date.now() + 5000;

    device.send('targets\u001f[{"id":"js","title":"JS thread"}]');

    let page = await fetch(`http://${base}/components/A1-js?token=${TOKEN}`);

    while (page.status !== 200 && Date.now() < deadline)
      page = await fetch(`http://${base}/components/A1-js?token=${TOKEN}`);

    const html = await page.text();

    assert.match(html, /data-page="A1-js"/);
    assert.match(html, /<title>Components · JS thread · Pixel<\/title>/);

    assert.ok(
      html.includes(`<script src="/components/panel.js?token=${TOKEN}">`),
      'the panel loads its script, and opens its socket, with the token its page was opened with',
    );

    assert.equal((await fetch(`http://${base}/components/Z9-js`, { headers: AUTH })).status, 404);

    const script = await fetch(`http://${base}/components/panel.js?token=${TOKEN}`);

    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') ?? '', /javascript/);
    assert.match(await script.text(), /inspectComponent/);

    const panel = await opened(`ws://${base}/inspector/components/A1-js`);
    const forwarded = next(device);

    panel.send('{"event":"connect"}');
    assert.equal(await forwarded, 'panel\u001fjs\u001f{"event":"connect"}');

    const answered = next(panel);

    device.send('panel\u001fjs\u001f{"event":"hello"}');
    assert.equal(await answered, '{"event":"hello"}');

    for (const socket of [device, panel]) socket.close();
  } finally {
    await server.close();
  }
});

test('a recording answers the record command', () => {
  const hub = new DevicePatchHub();
  const phone = new FakeClient();
  const recordings: unknown[] = [];

  hub.on('recording', (event) => recordings.push(event));
  hub.attach(phone);

  phone.emit(
    'message',
    JSON.stringify({ type: 'hello', id: 'A1', name: 'Pixel', platform: 'android' }),
  );

  hub.command('record');

  phone.emit(
    'message',
    JSON.stringify({ type: 'recording', recording: 'VlJFQw==', tree: '1 Stack' }),
  );

  assert.deepEqual(phone.messages, [{ type: 'command', name: 'record' }]);

  assert.deepEqual(recordings, [
    {
      device: { id: 'A1', name: 'Pixel', platform: 'android' },
      recording: 'VlJFQw==',
      tree: '1 Stack',
    },
  ]);
});
