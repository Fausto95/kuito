import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { bytes } from './support/fake-http.ts';
import { hosting } from './support/host-wire.ts';
import { standardHost } from './support/standard-host.ts';
import { installKernel } from './support/kuito-host.ts';

// WebSocket over the platform's client (native/shared/Socket.h), driven
// through a fake host that records what the kernel asks and answers as the
// platform does, on the JS thread.

interface SocketEvent {
  readonly type: string;
  readonly data?: unknown;
  readonly code?: number;
  readonly reason?: string;
  readonly wasClean?: boolean;
  readonly message?: string;
}

interface KernelSocket {
  readonly url: string;
  readonly readyState: number;
  readonly protocol: string;
  binaryType: string;
  onopen: ((event: SocketEvent) => void) | null;
  onmessage: ((event: SocketEvent) => void) | null;
  onerror: ((event: SocketEvent) => void) | null;
  onclose: ((event: SocketEvent) => void) | null;
  addEventListener(type: string, listener: (event: SocketEvent) => void): void;
  removeEventListener(type: string, listener: (event: SocketEvent) => void): void;
  send(data: unknown): void;
  close(code?: number, reason?: string): void;
}

interface SocketGlobals {
  WebSocket: {
    new (url: string, protocols?: string | string[]): KernelSocket;
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;
  };
  __kuitoSocketOpen(id: number, protocol: string): void;
  __kuitoSocketMessage(id: number, data: string | ArrayBuffer): void;
  __kuitoSocketError(id: number, message: string): void;
  __kuitoSocketClose(id: number, code: number, reason: string, wasClean: boolean): void;
}

function assertSockets(context: object): asserts context is SocketGlobals {
  if (!('WebSocket' in context) || !('__kuitoSocketOpen' in context))
    throw new Error('The kernel did not install WebSocket');
}

type Call =
  | { op: 'open'; id: number; url: string; protocols: string[] }
  | { op: 'send'; id: number; data: string | ArrayBuffer }
  | { op: 'close'; id: number; code: number; reason: string };

function create() {
  const calls: Call[] = [];
  const context = installKernel(
    hosting({
      ...standardHost(),
      __kuitoHostSocket: {
        open: (id: number, url: string, protocols: string[]) =>
          calls.push({ op: 'open', id, url, protocols: [...protocols] }),
        send: (id: number, data: string | ArrayBuffer) => calls.push({ op: 'send', id, data }),
        close: (id: number, code: number, reason: string) =>
          calls.push({ op: 'close', id, code, reason }),
      },
    }),
  );

  assertSockets(context);

  const idOf = () => {
    const open = calls.find((call) => call.op === 'open');

    if (!open) throw new Error('No socket opened');

    return open.id;
  };

  return { context, calls, idOf };
}

function record(socket: KernelSocket) {
  const events: string[] = [];

  socket.onopen = () => events.push('open');

  socket.onmessage = ({ data }) =>
    events.push(
      'message ' +
        (typeof data === 'string' ? data : [...new Uint8Array(data as ArrayBuffer)].join(',')),
    );

  socket.onerror = ({ message }) => events.push('error ' + message);

  socket.onclose = ({ code, reason, wasClean }) =>
    events.push(`close ${code} ${reason} ${wasClean}`);

  return events;
}

test('a socket opens through the host with its protocols and reports the one chosen', () => {
  const { context, calls, idOf } = create();
  const socket = new context.WebSocket('wss://echo.example.com/chat', ['v2', 'v1']);
  const events = record(socket);

  assert.equal(socket.readyState, context.WebSocket.CONNECTING);

  assert.equal(
    JSON.stringify(calls),
    JSON.stringify([
      { op: 'open', id: idOf(), url: 'wss://echo.example.com/chat', protocols: ['v2', 'v1'] },
    ]),
  );

  context.__kuitoSocketOpen(idOf(), 'v2');
  assert.equal(socket.readyState, context.WebSocket.OPEN);
  assert.equal(socket.protocol, 'v2');
  assert.deepEqual(events, ['open']);
});

test('text and binary messages arrive as strings and ArrayBuffers', () => {
  const { context, idOf } = create();
  const socket = new context.WebSocket('ws://localhost:9000');
  const events = record(socket);

  context.__kuitoSocketOpen(idOf(), '');
  context.__kuitoSocketMessage(idOf(), 'hello');
  context.__kuitoSocketMessage(idOf(), bytes(Uint8Array.of(1, 2, 255)));
  assert.deepEqual(events, ['open', 'message hello', 'message 1,2,255']);
  assert.equal(socket.binaryType, 'arraybuffer');
  assert.throws(() => (socket.binaryType = 'blob'), { name: 'SyntaxError' });
});

test('send passes text as text and bytes as exactly their own ArrayBuffer', () => {
  const { context, calls, idOf } = create();
  const socket = new context.WebSocket('ws://localhost:9000');

  context.__kuitoSocketOpen(idOf(), '');
  socket.send('hi');
  socket.send(Uint8Array.of(9, 8, 7, 6).subarray(1, 3));

  const sent = calls.flatMap((call) =>
    call.op !== 'send'
      ? []
      : [typeof call.data === 'string' ? call.data : [...new Uint8Array(call.data)]],
  );

  assert.equal(JSON.stringify(sent), JSON.stringify(['hi', [8, 7]]));
});

test('send before the socket opens is an InvalidStateError; after it closed it is dropped', () => {
  const { context, calls, idOf } = create();
  const socket = new context.WebSocket('ws://localhost:9000');

  assert.throws(() => socket.send('early'), { name: 'InvalidStateError' });
  context.__kuitoSocketOpen(idOf(), '');
  context.__kuitoSocketClose(idOf(), 1000, '', true);
  socket.send('late');
  assert.equal(calls.filter((call) => call.op === 'send').length, 0);
});

test('close sends the code and reason, then the close event reports how it ended', () => {
  const { context, calls, idOf } = create();
  const socket = new context.WebSocket('ws://localhost:9000');
  const events = record(socket);

  context.__kuitoSocketOpen(idOf(), '');
  socket.close(4001, 'bye');
  assert.equal(socket.readyState, context.WebSocket.CLOSING);

  assert.equal(
    JSON.stringify(calls.find((call) => call.op === 'close')),
    JSON.stringify({ op: 'close', id: idOf(), code: 4001, reason: 'bye' }),
  );

  context.__kuitoSocketClose(idOf(), 4001, 'bye', true);
  assert.equal(socket.readyState, context.WebSocket.CLOSED);
  assert.deepEqual(events, ['open', 'close 4001 bye true']);
});

test('close takes 1000 or 3000–4999 and a reason of 123 bytes at most', () => {
  const { context } = create();
  const socket = new context.WebSocket('ws://localhost:9000');

  assert.throws(() => socket.close(1001), { name: 'InvalidAccessError' });
  assert.throws(() => socket.close(1000, 'é'.repeat(62)), { name: 'SyntaxError' });
});

test('a failure reports an error event, then a close event that was not clean', () => {
  const { context, idOf } = create();
  const socket = new context.WebSocket('wss://down.example.com');
  const events = record(socket);

  context.__kuitoSocketError(idOf(), 'Could not connect to the server.');
  context.__kuitoSocketClose(idOf(), 1006, '', false);
  assert.deepEqual(events, ['error Could not connect to the server.', 'close 1006  false']);
  assert.equal(socket.readyState, context.WebSocket.CLOSED);
});

test('addEventListener listeners run alongside the on- handler and can be removed', () => {
  const { context, idOf } = create();
  const socket = new context.WebSocket('ws://localhost:9000');
  const seen: string[] = [];
  const listener = (event: SocketEvent) => seen.push('listener ' + event.data);

  socket.addEventListener('message', listener);
  socket.onmessage = (event) => seen.push('handler ' + event.data);
  context.__kuitoSocketOpen(idOf(), '');
  context.__kuitoSocketMessage(idOf(), 'a');
  socket.removeEventListener('message', listener);
  context.__kuitoSocketMessage(idOf(), 'b');
  assert.deepEqual(seen, ['listener a', 'handler a', 'handler b']);
});

test('a URL that is not ws or wss is a SyntaxError before anything opens', () => {
  const { context, calls } = create();

  assert.throws(() => new context.WebSocket('https://example.com'), { name: 'SyntaxError' });
  assert.throws(() => new context.WebSocket('ws://example.com/#frag'), { name: 'SyntaxError' });

  assert.throws(() => new context.WebSocket('ws://example.com', ['a', 'a']), {
    name: 'SyntaxError',
  });

  assert.equal(calls.length, 0);
});
