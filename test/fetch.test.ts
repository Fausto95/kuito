import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { present } from './support/present.ts';
import { fakeHttp } from './support/fake-http.ts';
import { hosting } from './support/host-wire.ts';
import { installKernel } from './support/kuito-host.ts';

interface KernelHeaders {
  get(name: string): string | null;
  has(name: string): boolean;
  forEach(callback: (value: string, name: string) => void): void;
}

interface KernelResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly url: string;
  readonly headers: KernelHeaders;
  readonly bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  bytes(): Promise<Uint8Array>;
  text(): Promise<string>;
  json(): Promise<unknown>;
  chunks(onChunk: (chunk: Uint8Array) => void): Promise<void>;
}

interface KernelSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
}

interface KernelFetch {
  fetch(
    input: string,
    init?: {
      method?: string;
      headers?: unknown;
      body?: unknown;
      signal?: KernelSignal;
    },
  ): Promise<KernelResponse>;
  AbortController: new () => { readonly signal: KernelSignal; abort(reason?: unknown): void };
  Headers: new (init?: unknown) => KernelHeaders & {
    set(name: string, value: string): void;
    append(name: string, value: string): void;
  };
}

function assertFetch(context: object): asserts context is KernelFetch {
  if (!('fetch' in context) || !('AbortController' in context) || !('Headers' in context))
    throw new Error('The kernel did not install fetch');
}

function create() {
  const http = fakeHttp();
  const context = installKernel(hosting({ ...http.globals }));

  assertFetch(context);

  return { context, ...http, server: http.server(context) };
}

const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff);
const text = (buffer: ArrayBuffer | string | undefined) =>
  typeof buffer === 'string' ? buffer : new TextDecoder().decode(present(buffer, 'body'));

test('fetch resolves at the head with status, final URL and headers by any case', async () => {
  const { context, requests, server } = create();
  const pending = context.fetch('https://example.org/a');
  const [sent] = requests;

  assert.equal(sent.method, 'GET');
  assert.equal(sent.body, undefined);

  server.head(sent.id, {
    status: 201,
    url: 'https://example.org/b',
    headers: { 'Content-Type': 'image/png', 'X-Count': '2' },
  });

  const response = await pending;

  assert.equal(response.status, 201);
  assert.equal(response.ok, true);
  assert.equal(response.url, 'https://example.org/b');
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('X-COUNT'), '2');
  assert.equal(response.headers.get('missing'), null);
});

test('a response outside 200–299 resolves with ok false', async () => {
  const { context, requests, server } = create();
  const pending = context.fetch('https://example.org/missing');

  server.respond(requests[0].id, { status: 404, body: 'gone' });

  const response = await pending;

  assert.equal(response.ok, false);
  assert.equal(await response.text(), 'gone');
});

test('request headers cross as name/value pairs from an object, pairs or Headers', () => {
  const { context, requests } = create();
  const headers = new context.Headers({ Accept: 'image/png' });

  headers.append('X-Tag', 'a');
  headers.append('x-tag', 'b');
  void context.fetch('https://example.org/1', { headers: { Authorization: 'Bearer t' } });
  void context.fetch('https://example.org/2', { headers: [['X-One', '1']] });
  void context.fetch('https://example.org/3', { headers });

  assert.deepEqual(
    requests.map((sent) => sent.headers),
    [
      [['authorization', 'Bearer t']],
      [['x-one', '1']],
      [
        ['accept', 'image/png'],
        ['x-tag', 'a, b'],
      ],
    ],
  );
});

test('a binary response body arrives byte for byte as an ArrayBuffer', async () => {
  const { context, requests, server } = create();
  const pending = context.fetch('https://example.org/logo.png');

  server.respond(requests[0].id, { headers: { 'content-type': 'image/png' }, body: PNG });

  const response = await pending;
  const buffer = await response.arrayBuffer();

  assert.deepEqual([...new Uint8Array(buffer)], [...PNG]);
  assert.equal(response.bodyUsed, true);
});

test('bytes, text and json decode the body as UTF-8', async () => {
  const { context, requests, server } = create();
  const reads = [
    context.fetch('https://example.org/1'),
    context.fetch('https://example.org/2'),
    context.fetch('https://example.org/3'),
  ];

  server.respond(requests[0].id, { body: 'café ✓' });
  server.respond(requests[1].id, { body: '{"name":"Zoë"}' });
  server.respond(requests[2].id, { body: PNG });

  const [plain, json, binary] = await Promise.all(reads);

  assert.equal(await plain.text(), 'café ✓');
  assert.equal(JSON.stringify(await json.json()), '{"name":"Zoë"}');
  assert.deepEqual([...(await binary.bytes())], [...PNG]);
});

test('a string body crosses as text with a default text/plain content type', () => {
  const { context, requests } = create();

  void context.fetch('https://example.org/notes', { method: 'post', body: 'hello ✓' });

  void context.fetch('https://example.org/json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body, 'hello ✓');
  assert.deepEqual(requests[0].headers, [['content-type', 'text/plain;charset=UTF-8']]);
  assert.deepEqual(requests[1].headers, [['content-type', 'application/json']]);
});

test('a binary body crosses as exactly its bytes, a view as its own slice', () => {
  const { context, requests } = create();
  const whole = Uint8Array.of(1, 2, 3, 4, 5, 6);

  void context.fetch('https://example.org/a', { method: 'POST', body: whole.buffer });
  void context.fetch('https://example.org/b', { method: 'POST', body: whole.subarray(2, 4) });

  const sent = requests.map(({ body }) => {
    if (typeof body !== 'object' || 'file' in body)
      throw new Error('Expected an ArrayBuffer body, got ' + JSON.stringify(body));

    return [...new Uint8Array(body)];
  });

  assert.deepEqual(sent, [
    [1, 2, 3, 4, 5, 6],
    [3, 4],
  ]);

  assert.deepEqual(requests[1].headers, []);
});

test('fetch rejects what it cannot send before anything crosses', async () => {
  const { context, requests } = create();

  await assert.rejects(context.fetch('https://example.org', { method: 'POST', body: { a: 1 } }), {
    name: 'TypeError',
  });

  await assert.rejects(context.fetch('https://example.org', { body: 'x' }), /GET/);

  await assert.rejects(context.fetch('https://example.org', { method: 'BREW' }), {
    name: 'TypeError',
  });

  await assert.rejects(context.fetch('https://example.org', { headers: { 'Bad Name': 'x' } }), {
    name: 'TypeError',
  });

  assert.equal(requests.length, 0);
});

test('a network failure before the head rejects with a TypeError naming it', async () => {
  const { context, requests, server } = create();
  const pending = context.fetch('https://example.org');

  server.end(requests[0].id, '', 'The Internet connection appears to be offline.');

  await assert.rejects(pending, (error: Error) => {
    assert.equal(error.name, 'TypeError');
    assert.match(error.message, /offline/);

    return true;
  });
});

test('a failure after the head rejects the body read', async () => {
  const { context, requests, server } = create();
  const pending = context.fetch('https://example.org');

  server.head(requests[0].id);

  const response = await pending;
  const body = response.arrayBuffer();

  server.end(requests[0].id, '', 'connection lost');
  await assert.rejects(body, /connection lost/);
});

test('aborting before the head cancels the request and rejects with AbortError', async () => {
  const { context, requests, cancelled, server } = create();
  const controller = new context.AbortController();
  const pending = context.fetch('https://example.org', { signal: controller.signal });

  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(cancelled, [requests[0].id]);
  // The platform may still answer before it sees the cancel.
  server.respond(requests[0].id, { body: 'late' });
});

test('an aborted signal sends nothing and rejects with its reason', async () => {
  const { context, requests } = create();
  const controller = new context.AbortController();
  const reason = new Error('left the screen');

  controller.abort(reason);
  await assert.rejects(context.fetch('https://example.org', { signal: controller.signal }), reason);
  assert.equal(requests.length, 0);
});

test('aborting while the body streams cancels it and rejects the read', async () => {
  const { context, requests, cancelled, server } = create();
  const controller = new context.AbortController();
  const pending = context.fetch('https://example.org', { signal: controller.signal });

  server.head(requests[0].id);

  const response = await pending;
  const seen: number[] = [];
  const reading = response.chunks((chunk) => seen.push(chunk.byteLength));

  server.chunk(requests[0].id, 'abc');
  controller.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  assert.deepEqual(cancelled, [requests[0].id]);
  assert.deepEqual(seen, [3]);
});

test('chunks streams the body in order and settles when it ends', async () => {
  const { context, requests, server } = create();
  const pending = context.fetch('https://example.org/events');
  const [sent] = requests;

  server.head(sent.id, { headers: { 'content-type': 'text/event-stream' } });

  const response = await pending;
  const seen: string[] = [];
  const reading = response.chunks((chunk) => seen.push(new TextDecoder().decode(chunk)));

  assert.equal(sent.streaming, true);
  server.chunk(sent.id, 'data: 1\n\n');
  server.chunk(sent.id, 'data: 2\n\n');
  assert.deepEqual(seen, ['data: 1\n\n', 'data: 2\n\n']);
  server.end(sent.id);
  await reading;
  assert.equal(response.bodyUsed, true);
  await assert.rejects(response.text(), { name: 'TypeError' });
});

test('chunks after the host already buffered the whole body delivers it at once', async () => {
  const { context, requests, server } = create();
  const pending = context.fetch('https://example.org/small');

  server.respond(requests[0].id, { body: 'all of it' });

  const response = await pending;
  const seen: string[] = [];

  await response.chunks((chunk) => seen.push(text(chunk.slice().buffer)));
  assert.deepEqual(seen, ['all of it']);
});

test('a body reads once', async () => {
  const { context, requests, server } = create();
  const pending = context.fetch('https://example.org');

  server.respond(requests[0].id, { body: 'once' });

  const response = await pending;

  assert.equal(await response.text(), 'once');
  await assert.rejects(response.arrayBuffer(), { name: 'TypeError' });
});
