// Opens Chrome's bundled DevTools frontend (src/dev/inspector-proxy.ts) on a
// page. Chromium will not open devtools:// URLs from the command line or in a
// tab, but its debugging endpoint serves the same bundled frontend over HTTP,
// so DevTools gets a browser of its own: a dedicated profile with a loopback
// debugging port, reused across sessions.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Chromium browsers by platform, most common first. */
const BROWSERS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: [
    'Google Chrome',
    'Google Chrome Canary',
    'Chromium',
    'Microsoft Edge',
    'Brave Browser',
  ].map((name) => `/Applications/${name}.app/Contents/MacOS/${name}`),
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ],
};

interface FindOptions {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
}

/** `KUITO_DEVTOOLS_BROWSER`, or the first Chromium browser installed. */
export function findBrowser({ platform, env, exists }: FindOptions): string | undefined {
  return env.KUITO_DEVTOOLS_BROWSER || BROWSERS[platform]?.find(exists);
}

interface Response {
  ok: boolean;
  json(): Promise<unknown>;
}

export interface BrowserDeps {
  browser: string | undefined;
  /** The DevTools browser's user data directory. */
  profile: string;
  /** Starts the browser, detached from the dev server. */
  spawn(command: string, args: string[]): void;
  /** The debugging port the browser wrote to its profile, if it did. */
  readPort(): Promise<number | undefined>;
  fetch(url: string, init?: { method: string }): Promise<Response>;
  deadlineMs?: number;
}

const isTabs = (value: unknown): value is { id: string; url: string }[] =>
  Array.isArray(value) &&
  value.every(
    (tab) =>
      typeof tab === 'object' &&
      tab !== null &&
      typeof (tab as { id?: unknown }).id === 'string' &&
      typeof (tab as { url?: unknown }).url === 'string',
  );

/** The running DevTools browser's endpoint, if one answers. */
async function endpoint(deps: BrowserDeps): Promise<string | undefined> {
  const port = await deps.readPort();

  if (!port) return undefined;

  const base = `http://127.0.0.1:${port}`;

  try {
    return (await deps.fetch(`${base}/json/version`)).ok ? base : undefined;
  } catch {
    return undefined;
  }
}

async function launch(browser: string, deps: BrowserDeps): Promise<string> {
  deps.spawn(browser, [
    `--user-data-dir=${deps.profile}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  const deadline = Date.now() + (deps.deadlineMs ?? 15_000);

  while (Date.now() < deadline) {
    const base = await endpoint(deps);

    if (base) return base;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`${browser} did not open its DevTools endpoint`);
}

const BUNDLED = 'devtools://devtools/bundled/';

/** The bundled frontend at `frontend` (a devtools:// URL), as the browser at `base` serves it. */
const servedBy = (base: string, frontend: string) =>
  frontend.startsWith(BUNDLED) ? `${base}/devtools/${frontend.slice(BUNDLED.length)}` : frontend;

/** Opens `frontend` (a devtools:// URL), or brings forward the tab already showing it. */
export async function openDevtools(frontend: string, deps: BrowserDeps): Promise<void> {
  if (!deps.browser)
    throw new Error(
      'No Chromium-based browser found for DevTools. Open this URL in Chrome or Edge, ' +
        `or set KUITO_DEVTOOLS_BROWSER to a Chromium executable:\n${frontend}`,
    );

  const base = (await endpoint(deps)) ?? (await launch(deps.browser, deps));
  const page = servedBy(base, frontend);
  const tabs: unknown = await (await deps.fetch(`${base}/json/list`)).json();
  const open = isTabs(tabs) ? tabs.find((tab) => tab.url === page) : undefined;

  if (open) await deps.fetch(`${base}/json/activate/${open.id}`);
  else await deps.fetch(`${base}/json/new?${encodeURIComponent(page)}`, { method: 'PUT' });
}

/** The dependencies of a real browser, with its profile under `root`/.kuito. */
export function browserDeps(root: string): BrowserDeps {
  const profile = join(root, '.kuito', 'devtools-browser');

  return {
    browser: findBrowser({ platform: process.platform, env: process.env, exists: existsSync }),
    profile,
    spawn(command, args) {
      spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    },
    async readPort() {
      const text = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
      const port = Number(text.split('\n')[0]);

      return Number.isInteger(port) && port > 0 ? port : undefined;
    },
    fetch: (url, init) => fetch(url, init),
  };
}
