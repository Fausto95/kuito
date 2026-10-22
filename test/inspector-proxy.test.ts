import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { pathToFileURL } from 'node:url';
import {
  InspectorProxy,
  deviceFromQuery,
  devtoolsSourceMap,
  encodeProxyFrame,
  frontendUrl,
  parseDeviceFrame,
} from '../src/dev/inspector-proxy.ts';

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  send(data: string) {
    this.sent.push(data);
    this.emit('sent', data);
  }
  close(code?: number, reason?: string) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closed = { code, reason };
    this.emit('close');
  }
}

const S = '\u001f';
const PHONE = { id: 'A1', name: 'iPhone 18 Pro', app: 'dev.kuito.demo' };
const TARGETS = `targets${S}[{"id":"js","title":"JS thread"},{"id":"ui","title":"UI thread"}]`;

function connected(options: Partial<ConstructorParameters<typeof InspectorProxy>[0]> = {}) {
  const proxy = new InspectorProxy({ host: '127.0.0.1:8765', token: 'T0K', ...options });
  const device = new FakeSocket();

  proxy.attachDevice(device, PHONE);
  device.emit('message', TARGETS);

  return { proxy, device };
}

test('device frames are fields joined by U+001F; malformed ones are rejected', () => {
  assert.deepEqual(parseDeviceFrame(TARGETS), {
    type: 'targets',
    targets: [
      { id: 'js', title: 'JS thread' },
      { id: 'ui', title: 'UI thread' },
    ],
  });

  // The CDP message itself may hold the separator's escape; only the first two split.
  assert.deepEqual(parseDeviceFrame(`cdp${S}js${S}{"id":1,"result":{"a":"x${S}y"}}`), {
    type: 'cdp',
    target: 'js',
    message: `{"id":1,"result":{"a":"x${S}y"}}`,
  });

  assert.throws(() => parseDeviceFrame('targets'), /targets/);
  assert.throws(() => parseDeviceFrame(`targets${S}[{"id":3}]`), /targets/);
  assert.throws(() => parseDeviceFrame(`cdp${S}js`), /cdp/);
  assert.throws(() => parseDeviceFrame(`hello${S}js`), /Unknown device frame "hello"/);

  assert.equal(encodeProxyFrame({ type: 'connect', target: 'js' }), `connect${S}js`);
  assert.equal(encodeProxyFrame({ type: 'disconnect', target: 'ui' }), `disconnect${S}ui`);

  assert.equal(
    encodeProxyFrame({ type: 'cdp', target: 'js', message: '{"id":1}' }),
    `cdp${S}js${S}{"id":1}`,
  );
});

test('a device names itself in its socket URL', () => {
  const query = new URLSearchParams({
    device: 'A1',
    name: 'iPhone 18 Pro',
    app: 'dev.kuito.demo',
  });

  assert.deepEqual(deviceFromQuery(query), PHONE);
  assert.throws(() => deviceFromQuery(new URLSearchParams({ name: 'x', app: 'y' })), /device/);
});

test('every target of every device is a page with a DevTools frontend URL', () => {
  const { proxy } = connected();
  const tablet = new FakeSocket();

  proxy.attachDevice(tablet, { id: 'B2', name: 'Pixel 9', app: 'dev.kuito.demo' });
  tablet.emit('message', `targets${S}[{"id":"js","title":"JS thread"}]`);

  assert.deepEqual(
    proxy.pages().map(({ id, title, description, type, webSocketDebuggerUrl }) => ({
      id,
      title,
      description,
      type,
      webSocketDebuggerUrl,
    })),
    [
      {
        id: 'A1-js',
        title: 'JS thread · iPhone 18 Pro',
        description: 'dev.kuito.demo',
        type: 'node',
        webSocketDebuggerUrl: 'ws://127.0.0.1:8765/inspector/debug/A1-js?token=T0K',
      },
      {
        id: 'A1-ui',
        title: 'UI thread · iPhone 18 Pro',
        description: 'dev.kuito.demo',
        type: 'node',
        webSocketDebuggerUrl: 'ws://127.0.0.1:8765/inspector/debug/A1-ui?token=T0K',
      },
      {
        id: 'B2-js',
        title: 'JS thread · Pixel 9',
        description: 'dev.kuito.demo',
        type: 'node',
        webSocketDebuggerUrl: 'ws://127.0.0.1:8765/inspector/debug/B2-js?token=T0K',
      },
    ],
  );

  assert.equal(
    proxy.pages()[0]?.devtoolsFrontendUrl,
    'devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=127.0.0.1%3A8765%2Finspector%2Fdebug%2FA1-js%3Ftoken%3DT0K',
  );

  assert.equal(
    frontendUrl('127.0.0.1:8765', 'A1-js', 'T0K'),
    proxy.pages()[0]?.devtoolsFrontendUrl,
  );

  // A pinned token may hold characters a query reads otherwise, as base64's `+`.
  const ws = new URL(frontendUrl('127.0.0.1:8765', 'A1-js', 'a+b/c=')).searchParams.get('ws');

  assert.equal(new URL(`ws://${ws}`).searchParams.get('token'), 'a+b/c=');

  assert.equal(proxy.latest('js')?.id, 'B2-js', '`j` debugs the device that connected last');
  assert.equal(proxy.latest('ui')?.id, 'A1-ui');

  tablet.close();
  assert.equal(proxy.latest('js')?.id, 'A1-js');

  assert.deepEqual(
    proxy.pages().map((page) => page.id),
    ['A1-js', 'A1-ui'],
    'a device that leaves takes its pages along',
  );
});

test('a frontend attaches to one target and CDP flows both ways', () => {
  const { proxy, device } = connected();
  const frontend = new FakeSocket();

  proxy.attachDebugger(frontend, 'A1-js');
  frontend.emit('message', '{"id":1,"method":"Debugger.enable"}');
  device.emit('message', `cdp${S}js${S}{"id":1,"result":{}}`);
  device.emit('message', `cdp${S}ui${S}{"method":"Runtime.consoleAPICalled"}`);

  assert.deepEqual(device.sent, [
    `connect${S}js`,
    `cdp${S}js${S}{"id":1,"method":"Debugger.enable"}`,
  ]);

  assert.deepEqual(frontend.sent, ['{"id":1,"result":{}}'], 'another target’s traffic stays out');

  device.sent.length = 0;
  frontend.close();
  assert.deepEqual(device.sent, [`disconnect${S}js`]);
});

test('an unknown page closes the frontend with the reason', () => {
  const { proxy, device } = connected();
  const frontend = new FakeSocket();

  proxy.attachDebugger(frontend, 'Z9-js');

  assert.equal(frontend.closed?.code, 1011);
  assert.match(frontend.closed?.reason ?? '', /No Kuito app is running Z9-js/);
  assert.deepEqual(device.sent, []);
});

test('a second frontend replaces the first and starts a fresh session', () => {
  const { proxy, device } = connected();
  const first = new FakeSocket();
  const second = new FakeSocket();

  proxy.attachDebugger(first, 'A1-js');
  proxy.attachDebugger(second, 'A1-js');
  device.emit('message', `cdp${S}js${S}{"method":"Debugger.resumed"}`);

  assert.equal(first.readyState, 3);
  assert.match(first.closed?.reason ?? '', /Another DevTools window/);
  assert.deepEqual(device.sent, [`connect${S}js`, `disconnect${S}js`, `connect${S}js`]);
  assert.deepEqual(first.sent, []);
  assert.deepEqual(second.sent, ['{"method":"Debugger.resumed"}']);
});

test('frontends close when their device leaves or reconnects', () => {
  const { proxy, device } = connected();
  const frontend = new FakeSocket();

  proxy.attachDebugger(frontend, 'A1-ui');
  device.close();

  assert.equal(frontend.readyState, 3);
  assert.match(frontend.closed?.reason ?? '', /iPhone 18 Pro disconnected/);

  const again = new FakeSocket();
  const relaunched = new FakeSocket();
  const replaced = new FakeSocket();

  proxy.attachDevice(again, PHONE);
  again.emit('message', TARGETS);
  proxy.attachDebugger(relaunched, 'A1-js');
  proxy.attachDevice(replaced, PHONE);

  assert.equal(again.readyState, 3, 'the same device connecting again replaces its old socket');
  assert.equal(relaunched.readyState, 3);
  assert.deepEqual(proxy.pages(), [], 'pages return once the new socket lists its targets');
});

test('Components panel messages ride their own frames', () => {
  assert.deepEqual(
    parseDeviceFrame(`panel${S}js${S}{"event":"tree","payload":{"components":[]}}`),
    {
      type: 'panel',
      target: 'js',
      message: '{"event":"tree","payload":{"components":[]}}',
    },
  );

  assert.equal(
    encodeProxyFrame({ type: 'panel', target: 'js', message: '{"event":"connect"}' }),
    `panel${S}js${S}{"event":"connect"}`,
  );
});

test('a Components panel talks to the kernel beside a DevTools window, not through it', () => {
  const { proxy, device } = connected();
  const debuggerWindow = new FakeSocket();
  const panel = new FakeSocket();

  proxy.attachDebugger(debuggerWindow, 'A1-js');
  proxy.attachComponents(panel, 'A1-js');
  device.sent.length = 0;

  panel.emit('message', '{"event":"connect"}');
  device.emit('message', `panel${S}js${S}{"event":"tree","payload":{"components":[]}}`);
  device.emit('message', `cdp${S}js${S}{"method":"Debugger.resumed"}`);

  assert.deepEqual(device.sent, [`panel${S}js${S}{"event":"connect"}`]);
  assert.deepEqual(panel.sent, ['{"event":"tree","payload":{"components":[]}}']);
  assert.deepEqual(debuggerWindow.sent, ['{"method":"Debugger.resumed"}']);

  device.sent.length = 0;
  panel.close();

  assert.deepEqual(
    device.sent,
    [`panel${S}js${S}{"event":"shutdown"}`],
    'the backend stops when its panel goes',
  );

  assert.equal(debuggerWindow.readyState, 1);
});

test('a Components panel for an unknown page, or a replaced one, is closed', () => {
  const { proxy, device } = connected();
  const lost = new FakeSocket();
  const first = new FakeSocket();
  const second = new FakeSocket();

  proxy.attachComponents(lost, 'Z9-js');
  proxy.attachComponents(first, 'A1-js');
  proxy.attachComponents(second, 'A1-js');
  device.emit('message', `panel${S}js${S}{"event":"hello"}`);

  assert.match(lost.closed?.reason ?? '', /No Kuito app is running Z9-js/);
  assert.match(first.closed?.reason ?? '', /Another Components panel/);
  assert.deepEqual(second.sent, ['{"event":"hello"}']);

  device.close();
  assert.equal(second.readyState, 3, 'it closes with its device');
});

test('a malformed device frame is reported, and the socket stays up', () => {
  const problems: Error[] = [];
  const { proxy, device } = connected({ onError: (error) => problems.push(error) });

  device.emit('message', 'nonsense');

  assert.equal(problems.length, 1);
  assert.match(problems[0]?.message ?? '', /iPhone 18 Pro sent a malformed inspector frame/);
  assert.equal(device.readyState, 1);
  assert.equal(proxy.pages().length, 2);
});

test('scripts with a known source map carry it inline, so any frontend can read it', () => {
  const map = '{"version":3,"sources":["file:///work/app.tsx"],"mappings":"AAAA"}';
  const { proxy, device } = connected({
    sourceMap: (script) => (script === 'kuito://patch/3' ? map : undefined),
  });
  const frontend = new FakeSocket();
  const parsed = (url: string, sourceMapURL = 'patch-3.js.map') =>
    JSON.stringify({
      method: 'Debugger.scriptParsed',
      params: { scriptId: '7', url, sourceMapURL },
    });

  proxy.attachDebugger(frontend, 'A1-js');
  device.emit('message', `cdp${S}js${S}${parsed('kuito://patch/3')}`);
  device.emit('message', `cdp${S}js${S}${parsed('kuito://bootstrap', '')}`);

  assert.deepEqual(
    frontend.sent.map((message) => JSON.parse(message).params),
    [
      {
        scriptId: '7',
        url: 'kuito://patch/3',
        sourceMapURL:
          'data:application/json;charset=utf-8;base64,' + Buffer.from(map).toString('base64'),
      },
      { scriptId: '7', url: 'kuito://bootstrap', sourceMapURL: '' },
    ],
  );

  assert.equal(frontend.sent[1], parsed('kuito://bootstrap', ''), 'other messages pass verbatim');
});

test('the dev server answers for script sources Hermes does not keep', async () => {
  const { proxy, device } = connected({
    scriptSource: async (script) => (script === 'kuito://ui/abc' ? 'function f() {}' : undefined),
  });
  const frontend = new FakeSocket();
  const parsed = (scriptId: string, url: string) =>
    `cdp${S}ui${S}` +
    JSON.stringify({ method: 'Debugger.scriptParsed', params: { scriptId, url } });

  proxy.attachDebugger(frontend, 'A1-ui');
  device.emit('message', parsed('4', 'kuito://ui/abc'));
  device.emit('message', parsed('5', 'kuito://somewhere'));
  device.sent.length = 0;
  frontend.sent.length = 0;

  const answered = once(frontend, 'sent');

  frontend.emit(
    'message',
    '{"id":9,"method":"Debugger.getScriptSource","params":{"scriptId":"4"}}',
  );

  await answered;

  const forwarded = once(device, 'sent');

  frontend.emit(
    'message',
    '{"id":10,"method":"Debugger.getScriptSource","params":{"scriptId":"5"}}',
  );

  await forwarded;

  assert.deepEqual(
    frontend.sent.map((message) => JSON.parse(message)),
    [{ id: 9, result: { scriptSource: 'function f() {}' } }],
  );

  assert.deepEqual(
    device.sent,
    [`cdp${S}ui${S}{"id":10,"method":"Debugger.getScriptSource","params":{"scriptId":"5"}}`],
    'a script the server does not know is the device’s to answer',
  );
});

test('source maps reach DevTools with absolute file sources', () => {
  const map = JSON.stringify({
    version: 3,
    sourceRoot: '',
    sources: ['../../demo/app.tsx', '../../src/ui/index.ts'],
    sourcesContent: ['app', 'ui'],
    names: [],
    mappings: 'AAAA',
  });
  const served = JSON.parse(devtoolsSourceMap(map, '/work/kuito/dist/live'));

  assert.deepEqual(served.sources, [
    pathToFileURL('/work/kuito/demo/app.tsx').href,
    pathToFileURL('/work/kuito/src/ui/index.ts').href,
  ]);

  assert.equal(served.sourceRoot, undefined);
  assert.deepEqual(served.sourcesContent, ['app', 'ui']);
  assert.equal(served.mappings, 'AAAA');
});
