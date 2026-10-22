import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules } from './support/fake-modules.ts';
import { installKernel, type Props } from './support/kuito-host.ts';
import { handleOf, hosting, nativeEvent } from './support/host-wire.ts';

// WebView as an app renders it, against a fake platform that describes the
// WebView module the way the iOS and Android registries do: the props the
// view receives, the events its handlers hear, and the calls its ref makes.

interface WebViewHandle {
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  stop(): Promise<void>;
  injectJavaScript(script: string): Promise<void>;
  postMessage(data: string): Promise<void>;
}

interface Scope {
  page: {
    current: WebViewHandle | null;
    readonly url: { readonly value: string };
    readonly title: { readonly value: string };
    readonly loading: { readonly value: boolean };
    readonly canGoBack: { readonly value: boolean };
    readonly canGoForward: { readonly value: boolean };
  };
  seen: unknown[];
  showHtml(shown: boolean): void;
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-webview-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/webview-app.tsx');

const EVENTS = ['loadStart', 'load', 'loadEnd', 'error', 'navigate', 'message'];
const METHODS = ['goBack', 'goForward', 'injectJavaScript', 'postMessage', 'reload', 'stop'];

/** Lets the kernel's scheduled updates run. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0));

async function launch() {
  const native = fakeModules({
    WebView: { functions: {}, view: { events: EVENTS, functions: METHODS } },
  });
  const views = new Map<string, { kind: string; props: Props }>();
  const kernel = installKernel(
    hosting({
      createView(id: string, kind: string) {
        views.set(id, { kind, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        const view = views.get(id);

        if (view) view.props[name] = value;
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

  return {
    ...native,
    ...scope,
    kernel,
    views,
    id: (label: string) => handleOf(kernel.__kuito, label),
  };
}

const navigation = {
  url: 'https://example.com/',
  title: 'Example Domain',
  loading: false,
  canGoBack: true,
  canGoForward: false,
};

test('a WebView mounts as the WebView module view, its props as the platform reads them', async () => {
  const app = await launch();
  const page = app.views.get('page');

  assert.equal(page?.kind, 'module:WebView');
  assert.deepEqual(app.loads, ['WebView']);

  assert.deepEqual(data(page.props), {
    height: 400,
    src: { uri: 'https://example.com', headers: { 'Accept-Language': 'pt' } },
    allowedOrigins: ['https://*.example.com', 'https://example.com'],
    injectedJavaScript: "document.body.dataset.app = 'kuito'",
    javaScriptEnabled: true,
    swipeNavigation: true,
    userAgent: 'Kuito Test',
  });
});

test('inline HTML crosses as html with its base URL', async () => {
  const app = await launch();

  app.showHtml(true);
  await settle();

  assert.equal(app.views.has('page'), false);

  assert.deepEqual(data(app.views.get('inline')?.props), {
    flex: 1,
    html: { html: '<h1>Hi</h1>', baseUrl: 'https://example.com' },
  });
});

test('load, navigation and error events reach their handlers with the page state', async () => {
  const app = await launch();
  const send = (event: string, payload: object) =>
    nativeEvent(app.kernel.__kuito, `page.${event}\u001f${JSON.stringify(payload)}`);

  send('loadStart', { ...navigation, loading: true });
  send('navigate', navigation);
  send('load', navigation);
  send('loadEnd', navigation);

  send('error', {
    ...navigation,
    url: 'https://offline.example.com/',
    code: -1009,
    description: 'The Internet connection appears to be offline.',
  });

  assert.equal(app.page.url.value, 'https://offline.example.com/', 'its ref holds the page state');
  assert.equal(app.page.title.value, 'Example Domain');
  assert.equal(app.page.loading.value, false);
  assert.equal(app.page.canGoBack.value, true);
  assert.equal(app.page.canGoForward.value, false);

  assert.deepEqual(data(app.seen), [
    ['loadStart', 'https://example.com/', true],
    ['navigation', 'https://example.com/', true, false],
    ['load', 'https://example.com/', 'Example Domain'],
    ['loadEnd', 'https://example.com/'],
    [
      'error',
      'https://offline.example.com/',
      -1009,
      'The Internet connection appears to be offline.',
    ],
  ]);
});

test('a message the page posts arrives as onMessage, with the page URL', async () => {
  const app = await launch();

  nativeEvent(
    app.kernel.__kuito,
    'page.message\u001f{"data":"{\\"type\\":\\"ready\\"}","url":"https://example.com/"}',
  );

  assert.deepEqual(data(app.seen), [['message', '{"type":"ready"}', 'https://example.com/']]);
});

test('the ref navigates, injects script and posts messages through view functions', async () => {
  const app = await launch();
  const page = app.page.current;

  assert.ok(page, 'the ref holds the mounted WebView');

  void page.goBack();
  void page.goForward();
  void page.reload();
  void page.stop();
  void page.injectJavaScript('window.scrollTo(0, 0)');
  void page.postMessage('{"type":"hello"}');

  assert.deepEqual(data(app.queued), [
    { module: 'WebView', method: 'goBack', args: [app.id('page')] },
    { module: 'WebView', method: 'goForward', args: [app.id('page')] },
    { module: 'WebView', method: 'reload', args: [app.id('page')] },
    { module: 'WebView', method: 'stop', args: [app.id('page')] },
    {
      module: 'WebView',
      method: 'injectJavaScript',
      args: [app.id('page'), 'window.scrollTo(0, 0)'],
    },
    { module: 'WebView', method: 'postMessage', args: [app.id('page'), '{"type":"hello"}'] },
  ]);
});
