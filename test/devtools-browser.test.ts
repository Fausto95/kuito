import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { findBrowser, openDevtools } from '../src/dev/devtools-browser.ts';
import type { BrowserDeps } from '../src/dev/devtools-browser.ts';

const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FRONTEND =
  'devtools://devtools/bundled/js_app.html?ws=127.0.0.1%3A8765%2Finspector%2Fdebug%2FA1-js';
// A tab cannot open devtools://; the browser serves the same frontend on its debugging port.
const SERVED =
  'http://127.0.0.1:9333/devtools/js_app.html?ws=127.0.0.1%3A8765%2Finspector%2Fdebug%2FA1-js';

test('DevTools opens in the first Chromium browser installed, or the one named', () => {
  const installed =
    (...paths: string[]) =>
    (path: string) =>
      paths.includes(path);

  assert.equal(findBrowser({ platform: 'darwin', env: {}, exists: installed(EDGE) }), EDGE);

  assert.equal(
    findBrowser({ platform: 'darwin', env: {}, exists: installed(EDGE, CHROME) }),
    CHROME,
  );

  assert.equal(
    findBrowser({
      platform: 'darwin',
      env: { KUITO_DEVTOOLS_BROWSER: '/opt/cft/chrome' },
      exists: installed(),
    }),
    '/opt/cft/chrome',
  );

  assert.equal(findBrowser({ platform: 'darwin', env: {}, exists: installed() }), undefined);
});

interface Request {
  url: string;
  method: string;
}

/** A browser that writes its debugging port once launched, and answers its HTTP endpoints. */
function fakeBrowser({ running = false, tabs = [] as { id: string; url: string }[] } = {}) {
  const spawned: string[][] = [];
  const requests: Request[] = [];
  let up = running;
  const deps: BrowserDeps = {
    browser: CHROME,
    profile: '/work/.kuito/devtools-browser',
    spawn(command, args) {
      spawned.push([command, ...args]);
      up = true;
    },
    readPort: async () => (up ? 9333 : undefined),
    async fetch(url, init) {
      requests.push({ url, method: init?.method ?? 'GET' });
      if (!up) throw new Error('ECONNREFUSED');

      const body = url.endsWith('/json/list') ? tabs : {};

      return { ok: true, json: async () => body };
    },
    deadlineMs: 1000,
  };

  return { deps, spawned, requests };
}

test('DevTools opens in a dedicated browser profile through its debugging port', async () => {
  const { deps, spawned, requests } = fakeBrowser();

  await openDevtools(FRONTEND, deps);

  assert.deepEqual(spawned, [
    [
      CHROME,
      '--user-data-dir=/work/.kuito/devtools-browser',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
  ]);

  assert.deepEqual(
    requests.filter(({ method }) => method === 'PUT'),
    [{ url: 'http://127.0.0.1:9333/json/new?' + encodeURIComponent(SERVED), method: 'PUT' }],
  );
});

test('a running DevTools browser is reused, and a tab already on the page comes forward', async () => {
  const { deps, spawned, requests } = fakeBrowser({
    running: true,
    tabs: [
      { id: 'T1', url: 'about:blank' },
      { id: 'T2', url: SERVED },
    ],
  });

  await openDevtools(FRONTEND, deps);

  assert.deepEqual(spawned, []);
  assert.ok(requests.some(({ url }) => url === 'http://127.0.0.1:9333/json/activate/T2'));
  assert.ok(!requests.some(({ method }) => method === 'PUT'), 'no second tab for the same page');
});

test('without a Chromium browser the error says what to open by hand', async () => {
  const { deps } = fakeBrowser();

  await assert.rejects(
    openDevtools(FRONTEND, { ...deps, browser: undefined }),
    (error: Error) =>
      /No Chromium-based browser/.test(error.message) &&
      error.message.includes(FRONTEND) &&
      error.message.includes('KUITO_DEVTOOLS_BROWSER'),
  );
});
