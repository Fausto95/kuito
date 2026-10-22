// WebSocket over the platform's client (native/shared/Socket.h): URLSession's
// web socket task on iOS, OkHttp's on Android. The host opens, sends and
// closes by id; it answers with open, message, error and close, in order, on
// the JS thread.
import { encodeUtf8, isArrayBuffer } from './encoding';
import { host } from './host';
import { dict, isFunction } from './values';

declare global {
  var __kuitoSocketOpen: (id: number, protocol: string) => void;
  var __kuitoSocketMessage: (id: number, data: string | ArrayBuffer) => void;
  var __kuitoSocketError: (id: number, message: string) => void;
  var __kuitoSocketClose: (id: number, code: number, reason: string, wasClean: boolean) => void;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

type SocketType = 'open' | 'message' | 'error' | 'close';
type Listener = (event: WebSocketEvent) => void;

/** Error-shaped, as Hermes has no DOMException: callers check `name`. */
function domError(name: string, message: string): Error {
  const error = new Error(message);

  error.name = name;

  return error;
}

const sockets = dict<KuitoWebSocket>();
let serial = 0;

function socketUrl(input: string): string {
  const url = new URL(input);

  if (url.protocol !== 'ws:' && url.protocol !== 'wss:')
    throw domError('SyntaxError', `WebSocket takes a ws: or wss: URL, not ${url.protocol}`);

  if (url.hash) throw domError('SyntaxError', 'A WebSocket URL has no fragment');

  return url.href;
}

function protocolList(protocols: string | string[]): string[] {
  const list = typeof protocols === 'string' ? [protocols] : protocols.map(String);

  if (
    new Set(list).size !== list.length ||
    list.some((name) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))
  )
    throw domError('SyntaxError', `Invalid WebSocket protocols ${JSON.stringify(list)}`);

  return list;
}

class KuitoWebSocket implements WebSocket {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSING = CLOSING;
  static readonly CLOSED = CLOSED;
  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSING = CLOSING;
  readonly CLOSED = CLOSED;
  readonly url: string;
  readyState: 0 | 1 | 2 | 3 = CONNECTING;
  protocol = '';
  /** Bytes are not counted on their way out; see docs/web-apis.md. */
  readonly bufferedAmount = 0;
  readonly extensions = '';
  onopen: Listener | null = null;
  onmessage: Listener | null = null;
  onerror: Listener | null = null;
  onclose: Listener | null = null;
  private readonly id: number;
  private readonly listeners: Record<SocketType, Listener[]> = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  constructor(url: string | URL, protocols: string | string[] = []) {
    const socket = host.__kuitoHostSocket;

    if (!socket) throw Error('This Kuito host has no WebSocket client');

    this.url = socketUrl(String(url));

    const list = protocolList(protocols);

    this.id = ++serial;
    sockets[this.id] = this;
    socket.open(this.id, this.url, list);
  }

  get binaryType(): 'arraybuffer' {
    return 'arraybuffer';
  }

  set binaryType(value: string) {
    if (value !== 'arraybuffer')
      throw domError('SyntaxError', 'WebSocket messages arrive as ArrayBuffers; there is no Blob');
  }

  addEventListener(type: SocketType, listener: Listener): void {
    const list = this.listeners[type];

    if (list && isFunction(listener) && list.indexOf(listener) === -1) list.push(listener);
  }

  removeEventListener(type: SocketType, listener: Listener): void {
    const list = this.listeners[type];
    const at = list ? list.indexOf(listener) : -1;

    if (at !== -1) list.splice(at, 1);
  }

  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (this.readyState === CONNECTING)
      throw domError('InvalidStateError', 'The WebSocket is still connecting');

    if (this.readyState !== OPEN) return;

    const payload =
      typeof data === 'string' || isArrayBuffer(data)
        ? data
        : ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice().buffer
          : null;

    if (payload === null)
      throw TypeError('WebSocket sends a string, an ArrayBuffer or a typed array');

    host.__kuitoHostSocket?.send(this.id, payload);
  }

  close(code?: number, reason = ''): void {
    if (code !== undefined && code !== 1000 && !(code >= 3000 && code <= 4999))
      throw domError('InvalidAccessError', `A close code is 1000 or 3000–4999, not ${code}`);

    if (encodeUtf8(String(reason)).byteLength > 123)
      throw domError('SyntaxError', 'A close reason is 123 bytes of UTF-8 at most');

    if (this.readyState === CLOSING || this.readyState === CLOSED) return;

    this.readyState = CLOSING;
    host.__kuitoHostSocket?.close(this.id, code ?? 1000, String(reason));
  }

  /** The host's side: delivers one event to the on- handler and every listener. */
  emit(type: SocketType, fields: Partial<WebSocketEvent> = {}): void {
    const event: WebSocketEvent = { type, target: this, ...fields };
    const handler = this[`on${type}`];

    this.listeners[type].slice().forEach((listener) => listener(event));
    handler?.call(this, event);
  }
}

export function installWebSocket(): void {
  if (!host.__kuitoHostSocket) return;

  host.__kuitoSocketOpen = (id, protocol) => {
    const socket = sockets[id];

    if (!socket || socket.readyState !== CONNECTING) return;

    socket.readyState = OPEN;
    socket.protocol = protocol;
    socket.emit('open');
  };

  host.__kuitoSocketMessage = (id, data) => {
    const socket = sockets[id];

    if (socket?.readyState === OPEN) socket.emit('message', { data });
  };

  host.__kuitoSocketError = (id, message) => sockets[id]?.emit('error', { message });

  host.__kuitoSocketClose = (id, code, reason, wasClean) => {
    const socket = sockets[id];

    if (!socket) return;

    delete sockets[id];
    socket.readyState = CLOSED;
    socket.emit('close', { code, reason, wasClean });
  };

  host.WebSocket = KuitoWebSocket;
}
