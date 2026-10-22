import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { fakeHttp } from './support/fake-http.ts';
import { hosting } from './support/host-wire.ts';
import { standardHost } from './support/standard-host.ts';
import { installKernel } from './support/kuito-host.ts';

// The standard library as apps see it (docs/web-apis.md), installed by the
// kernel over a fake host. Values from the kernel's realm are compared by
// content: their prototypes are not this realm's.

interface KernelURLSearchParams extends Iterable<[string, string]> {
  readonly size: number;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string, value?: string): boolean;
  append(name: string, value: string): void;
  set(name: string, value: string): void;
  delete(name: string, value?: string): void;
  sort(): void;
  forEach(callback: (value: string, name: string) => void): void;
  toString(): string;
}

interface KernelURL {
  href: string;
  readonly origin: string;
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  readonly searchParams: KernelURLSearchParams;
  toString(): string;
  toJSON(): string;
}

interface StandardLibrary {
  setTimeout(callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): number;
  setInterval(callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): number;
  clearInterval(id: number | undefined): void;
  clearTimeout(id: number | undefined): void;
  queueMicrotask(callback: () => void): void;
  performance: { now(): number; readonly timeOrigin: number };
  URL: {
    new (url: string, base?: string | KernelURL): KernelURL;
    canParse(url: string, base?: string): boolean;
    parse(url: string, base?: string): KernelURL | null;
  };
  URLSearchParams: new (
    init?: string | [string, string][] | Record<string, string>,
  ) => KernelURLSearchParams;
  TextEncoder: new () => {
    readonly encoding: string;
    encode(text?: string): Uint8Array;
    encodeInto(text: string, into: Uint8Array): { read: number; written: number };
  };
  TextDecoder: new (
    label?: string,
    options?: { fatal?: boolean; ignoreBOM?: boolean },
  ) => { readonly encoding: string; decode(input?: ArrayBuffer | ArrayBufferView): string };
  crypto: {
    getRandomValues<T extends ArrayBufferView>(array: T): T;
    randomUUID(): string;
  };
  structuredClone<T>(value: T): T;
}

function assertStandard(context: object): asserts context is StandardLibrary {
  for (const name of [
    'setInterval',
    'queueMicrotask',
    'performance',
    'URL',
    'TextEncoder',
    'crypto',
  ])
    if (!(name in context)) throw new Error('The kernel did not install ' + name);
}

function create() {
  const clock = { now: 0 };
  const timers = new Map<number, { delay: number; callback: () => void }>();
  const http = fakeHttp();
  const context = installKernel(
    hosting({
      ...standardHost(clock),
      ...http.globals,
      __kuitoHostSetTimer(id: number, delay: number, callback: () => void) {
        if (timers.has(id)) throw new Error('Timer ID already active');

        timers.set(id, { delay, callback });
      },
      __kuitoHostClearTimer(id: number) {
        timers.delete(id);
      },
    }),
  );
  /** Fires timer `id` as the host does: forgotten first, then called. */
  const fire = (id: number) => {
    const timer = present(timers.get(id), 'timer ' + id);

    timers.delete(id);
    timer.callback();
  };

  assertStandard(context);

  return { context, clock, timers, fire, requests: http.requests };
}

const json = (value: unknown) => JSON.stringify(value);

test('setInterval repeats with its arguments until cleared, even from its own callback', () => {
  const { context, timers, fire } = create();
  const seen: unknown[] = [];
  const id = context.setInterval((tag) => seen.push(tag), 100, 'tick');

  assert.equal(timers.get(id)?.delay, 100);
  fire(id);
  fire(id);
  assert.deepEqual(seen, ['tick', 'tick']);
  context.clearInterval(id);
  assert.equal(timers.has(id), false);

  const self: number = context.setInterval(() => context.clearInterval(self), 10);

  fire(self);
  assert.equal(timers.has(self), false);
});

test('timeouts and intervals share ids, so either clear cancels either', () => {
  const { context, timers } = create();
  const interval = context.setInterval(() => {}, 5);
  const timeout = context.setTimeout(() => {}, 5);

  assert.notEqual(interval, timeout);
  context.clearTimeout(interval);
  context.clearInterval(timeout);
  assert.equal(timers.size, 0);
});

test('an interval whose callback throws keeps repeating', () => {
  const { context, timers, fire } = create();
  const id = context.setInterval(() => {
    throw new Error('boom');
  }, 5);

  assert.throws(() => fire(id), /boom/);
  assert.equal(timers.has(id), true);
});

test('queueMicrotask runs after the current job, before the next timer', async () => {
  const { context, fire } = create();
  const order: string[] = [];
  const timer = context.setTimeout(() => order.push('timer'), 0);

  context.queueMicrotask(() => order.push('microtask'));
  order.push('sync');
  await Promise.resolve();
  fire(timer);
  assert.deepEqual(order, ['sync', 'microtask', 'timer']);
  assert.throws(() => context.queueMicrotask(42 as never), { name: 'TypeError' });
});

test('performance.now reads the host clock; timeOrigin is the wall clock at start', () => {
  const { context, clock } = create();

  clock.now = 12.5;
  assert.equal(context.performance.now(), 12.5);
  assert.ok(Math.abs(context.performance.timeOrigin - Date.now()) < 60_000);
});

test('URL parses an absolute URL into its parts', () => {
  const { context } = create();
  const url = new context.URL('HTTPS://user:pa%20ss@Example.COM:8443/a/./b/../c d?x=1&y=two#frag');

  assert.equal(url.protocol, 'https:');
  assert.equal(url.username, 'user');
  assert.equal(url.password, 'pa%20ss');
  assert.equal(url.hostname, 'example.com');
  assert.equal(url.port, '8443');
  assert.equal(url.host, 'example.com:8443');
  assert.equal(url.origin, 'https://example.com:8443');
  assert.equal(url.pathname, '/a/c%20d');
  assert.equal(url.search, '?x=1&y=two');
  assert.equal(url.hash, '#frag');
  assert.equal(url.href, 'https://user:pa%20ss@example.com:8443/a/c%20d?x=1&y=two#frag');
  assert.equal(String(url), url.href);
  assert.equal(json({ url }), json({ url: url.href }));
});

test('URL drops a default port and gives an empty path a slash', () => {
  const { context } = create();

  assert.equal(new context.URL('http://example.com:80').href, 'http://example.com/');
  assert.equal(new context.URL('https://example.com:443/x').port, '');
  assert.equal(new context.URL('ws://example.com:80/').host, 'example.com');
});

test('URL resolves a reference against a base', () => {
  const { context } = create();
  const base = 'https://example.com/a/b/c?q=1#h';
  const resolve = (reference: string) => new context.URL(reference, base).href;

  assert.equal(resolve('d'), 'https://example.com/a/b/d');
  assert.equal(resolve('../d'), 'https://example.com/a/d');
  assert.equal(resolve('/d'), 'https://example.com/d');
  assert.equal(resolve('//other.org/x'), 'https://other.org/x');
  assert.equal(resolve('?z=2'), 'https://example.com/a/b/c?z=2');
  assert.equal(resolve('#k'), 'https://example.com/a/b/c?q=1#k');
  assert.equal(resolve(''), 'https://example.com/a/b/c?q=1');
  assert.equal(resolve('http://x.io'), 'http://x.io/');
  assert.equal(new context.URL('e', new context.URL(base)).href, 'https://example.com/a/b/e');
});

test('URL takes non-special schemes as they are', () => {
  const { context } = create();
  const mail = new context.URL('mailto:someone@example.com');
  const file = new context.URL('file:///var/mobile/notes.txt');
  const custom = new context.URL('myapp://route/show/1?ref=push');

  assert.equal(mail.protocol, 'mailto:');
  assert.equal(mail.pathname, 'someone@example.com');
  assert.equal(file.host, '');
  assert.equal(file.pathname, '/var/mobile/notes.txt');
  assert.equal(custom.host, 'route');
  assert.equal(custom.pathname, '/show/1');
  assert.equal(custom.searchParams.get('ref'), 'push');
});

test('an invalid URL throws a TypeError; canParse and parse say so without throwing', () => {
  const { context } = create();

  for (const input of ['', 'no scheme', 'https://', 'http://exa mple.com', 'https://host:99999'])
    assert.throws(() => new context.URL(input), { name: 'TypeError' }, input);

  assert.equal(context.URL.canParse('relative'), false);
  assert.equal(context.URL.canParse('relative', 'https://example.com'), true);
  assert.equal(context.URL.parse('nope'), null);
  assert.equal(context.URL.parse('/x', 'https://a.io')?.href, 'https://a.io/x');
});

test('URL setters update href, and searchParams writes back to search', () => {
  const { context } = create();
  const url = new context.URL('https://example.com/path?a=1');

  url.pathname = '/other path';
  url.hash = 'top';
  url.port = '8080';
  url.searchParams.append('b', 'two words');
  assert.equal(url.href, 'https://example.com:8080/other%20path?a=1&b=two+words#top');
  url.search = '?c=3';
  assert.equal(url.searchParams.get('c'), '3');
  assert.equal(url.searchParams.has('a'), false);
  url.hostname = 'api.example.com';
  url.protocol = 'http';
  assert.equal(url.href, 'http://api.example.com:8080/other%20path?c=3#top');
});

test('URLSearchParams parses, edits and serializes as application/x-www-form-urlencoded', () => {
  const { context } = create();
  const params = new context.URLSearchParams('?a=1&b=x+y&a=2&c=%E2%9C%93&empty=&flag');

  assert.equal(params.get('a'), '1');
  assert.deepEqual([...params.getAll('a')], ['1', '2']);
  assert.equal(params.get('b'), 'x y');
  assert.equal(params.get('c'), '✓');
  assert.equal(params.get('flag'), '');
  assert.equal(params.get('missing'), null);
  assert.equal(params.size, 6);
  params.set('a', '3');
  params.delete('empty');
  params.append('d', 'a&b=c ✓');
  params.sort();
  assert.equal(params.toString(), 'a=3&b=x+y&c=%E2%9C%93&d=a%26b%3Dc+%E2%9C%93&flag=');

  assert.equal(
    json([...params]),
    json([
      ['a', '3'],
      ['b', 'x y'],
      ['c', '✓'],
      ['d', 'a&b=c ✓'],
      ['flag', ''],
    ]),
  );

  assert.equal(new context.URLSearchParams({ q: 'a b' }).toString(), 'q=a+b');

  assert.equal(
    new context.URLSearchParams([
      ['q', '1'],
      ['q', '2'],
    ]).toString(),
    'q=1&q=2',
  );
});

test('TextEncoder encodes UTF-8; TextDecoder decodes views and strips a BOM', () => {
  const { context } = create();
  const encoded = new context.TextEncoder().encode('é✓😀');
  const decoder = new context.TextDecoder();

  assert.deepEqual([...encoded], [0xc3, 0xa9, 0xe2, 0x9c, 0x93, 0xf0, 0x9f, 0x98, 0x80]);
  assert.equal(new context.TextEncoder().encoding, 'utf-8');
  assert.equal(decoder.decode(encoded), 'é✓😀');
  assert.equal(decoder.decode(encoded.subarray(2, 5)), '✓');
  assert.equal(decoder.decode(Uint8Array.of(0xef, 0xbb, 0xbf, 0x41).buffer), 'A');

  assert.equal(
    new context.TextDecoder('utf-8', { ignoreBOM: true }).decode(Uint8Array.of(0xef, 0xbb, 0xbf)),
    '﻿',
  );

  assert.equal(decoder.decode(), '');
  assert.equal(decoder.decode(Uint8Array.of(0xff)), '�');
});

test('TextEncoder.encodeInto writes what fits, never half a character', () => {
  const { context } = create();
  const into = new Uint8Array(4);
  const result = new context.TextEncoder().encodeInto('a✓b', into);

  assert.deepEqual({ ...result }, { read: 2, written: 4 });
  assert.deepEqual([...into], [0x61, 0xe2, 0x9c, 0x93]);

  const tight = new Uint8Array(2);

  assert.deepEqual(
    { ...new context.TextEncoder().encodeInto('a😀', tight) },
    { read: 1, written: 1 },
  );
});

test('TextDecoder decodes UTF-8 only, and fatal is a TypeError', () => {
  const { context } = create();

  assert.equal(new context.TextDecoder('UTF8').encoding, 'utf-8');
  assert.throws(() => new context.TextDecoder('latin1'), { name: 'RangeError' });
  assert.throws(() => new context.TextDecoder('utf-8', { fatal: true }), { name: 'TypeError' });
});

test('crypto.getRandomValues fills an integer array in place, 65536 bytes at most', () => {
  const { context } = create();
  const bytes = new Uint8Array(64);
  const words = new Uint32Array(4);

  assert.equal(context.crypto.getRandomValues(bytes), bytes);
  assert.ok(bytes.some((byte) => byte !== 0));
  context.crypto.getRandomValues(words);
  assert.ok(words.some((word) => word !== 0));

  assert.throws(() => context.crypto.getRandomValues(new Float64Array(2)), {
    name: 'TypeMismatchError',
  });

  assert.throws(() => context.crypto.getRandomValues(new Uint8Array(65537)), {
    name: 'QuotaExceededError',
  });
});

test('crypto.randomUUID is a version 4 UUID, different each time', () => {
  const { context } = create();
  const a = context.crypto.randomUUID();

  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(context.crypto.randomUUID(), a);
});

test('structuredClone copies deeply, keeping cycles, shared references and built-in types', () => {
  const { context } = create();
  const shared = { n: 1 };
  const buffer = Uint8Array.of(1, 2, 3, 4).buffer;
  const source: Record<string, unknown> = {
    list: [shared, shared],
    when: new Date(5),
    pattern: /a+/gi,
    map: new Map([['k', shared]]),
    set: new Set([1, 2]),
    bytes: new Uint8Array(buffer, 1, 2),
    words: new Uint16Array(buffer),
    error: new RangeError('out'),
    boxed: Object(3),
  };

  source.self = source;

  const copy = context.structuredClone(source);
  const list = copy.list as object[];
  const bytes = copy.bytes as Uint8Array;

  assert.notEqual(copy, source);
  assert.equal(copy.self, copy);
  assert.equal(list[0], list[1]);
  assert.notEqual(list[0], shared);
  assert.equal((copy.when as Date).getTime(), 5);
  assert.equal(String(copy.pattern), '/a+/gi');
  assert.equal((copy.map as Map<string, object>).get('k'), list[0]);
  assert.deepEqual([...(copy.set as Set<number>)], [1, 2]);
  assert.deepEqual([...bytes], [2, 3]);
  assert.equal(bytes.buffer, (copy.words as Uint16Array).buffer);
  assert.notEqual(bytes.buffer, buffer);
  assert.equal((copy.error as Error).name, 'RangeError');
  assert.equal((copy.error as Error).message, 'out');
  assert.equal(Number(copy.boxed), 3);
});

test('structuredClone copies a class instance as a plain object and refuses functions', () => {
  const { context } = create();

  class Point {
    x = 1;
    method() {}
  }

  const copy = context.structuredClone({ point: new Point() });

  assert.equal(json(copy), '{"point":{"x":1}}');
  assert.equal(Object.getPrototypeOf(Object.getPrototypeOf(copy.point)), null);
  assert.throws(() => context.structuredClone({ run() {} }), { name: 'DataCloneError' });
  assert.throws(() => context.structuredClone(Symbol('s')), { name: 'DataCloneError' });
});

test('fetch takes a URL object and URLSearchParams as a form body', () => {
  const { context, requests } = create();
  const fetch = Reflect.get(context, 'fetch') as (url: unknown, init?: object) => Promise<unknown>;

  void fetch(new context.URL('https://example.com/search?q=1'), {
    method: 'POST',
    body: new context.URLSearchParams({ name: 'Zoë Q' }),
  });

  assert.equal(requests[0].url, 'https://example.com/search?q=1');
  assert.equal(requests[0].body, 'name=Zo%C3%AB+Q');

  assert.equal(
    json(requests[0].headers),
    json([['content-type', 'application/x-www-form-urlencoded;charset=UTF-8']]),
  );
});
