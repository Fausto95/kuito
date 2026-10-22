// fetch over the platform's HTTP client (native/shared/Http.h, docs/web-apis.md).
// A request is a transfer keyed by id: the host answers with its head
// (fetch resolves), then the body, whole at the end or, once a reader asks
// with `chunks`, piece by piece as it arrives.
import { abortError } from './abort';
import { decodeUtf8, encodeUtf8, isArrayBuffer } from './encoding';
import { flatHeaders, headersFrom, makeHeaders } from './headers';
import { host } from './host';
import { formBody } from './url';
import { dict, isFunction } from './values';

declare global {
  var __kuitoHttpHead: (id: number, status: number, url: string, headers: string[]) => void;
  var __kuitoHttpChunk: (id: number, chunk: ArrayBuffer) => void;
  var __kuitoHttpEnd: (id: number, body: ArrayBuffer, error: string) => void;
  /** `total` is -1 when unknown. Only for a transfer that asked for progress. */
  var __kuitoHttpProgress: (id: number, bytes: number, total: number) => void;
}

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Who reads the body: all of it at the end, or each chunk as it lands. */
type Reader =
  | { kind: 'whole'; resolve: (body: ArrayBuffer) => void; reject: (error: unknown) => void }
  | {
      kind: 'chunks';
      onChunk: (chunk: Uint8Array) => void;
      resolve: () => void;
      reject: (error: unknown) => void;
    };

interface Transfer {
  readonly id: number;
  head?: { resolve: (response: Response) => void; reject: (error: unknown) => void };
  /** The body so far, when nobody streams it. */
  parts: ArrayBuffer[];
  reader?: Reader;
  ended: boolean;
  failure?: unknown;
  onProgress?: (bytes: number, total: number | null) => void;
  release(): void;
}

const transfers = dict<Transfer>();
let serial = 0;

function concat(parts: ArrayBuffer[]): ArrayBuffer {
  if (parts.length === 1) return parts[0];

  const whole = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let at = 0;

  parts.forEach((part) => {
    whole.set(new Uint8Array(part), at);
    at += part.byteLength;
  });

  return whole.buffer;
}

function settle(transfer: Transfer): void {
  const { reader } = transfer;

  if (!reader || (!transfer.ended && transfer.failure === undefined)) return;

  transfer.reader = undefined;

  if (transfer.failure !== undefined) reader.reject(transfer.failure);
  else if (reader.kind === 'whole') reader.resolve(concat(transfer.parts));
  else {
    const rest = concat(transfer.parts);

    if (rest.byteLength) reader.onChunk(new Uint8Array(rest));

    reader.resolve();
  }

  transfer.parts = [];
}

/** The transfer is over: the host forgets it, and so does the kernel. */
function finish(transfer: Transfer): void {
  delete transfers[transfer.id];
  transfer.release();
}

function fail(transfer: Transfer, error: unknown): void {
  transfer.failure = error;
  finish(transfer);

  if (transfer.head) transfer.head.reject(error);
  else settle(transfer);
}

class KuitoResponse implements Response {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText = '';
  readonly url: string;
  readonly headers: Headers;
  private used = false;
  private readonly transfer: Transfer;

  constructor(transfer: Transfer, status: number, url: string, headers: Headers) {
    this.transfer = transfer;
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.url = url;
    this.headers = headers;
  }

  get bodyUsed(): boolean {
    return this.used;
  }

  /** Starts the one read a body allows; false when it already started. */
  private claim(): boolean {
    if (this.used) return false;

    this.used = true;

    return true;
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    if (!this.claim()) return Promise.reject(TypeError('The response body was already read'));

    return new Promise<ArrayBuffer>((resolve, reject) => {
      this.transfer.reader = { kind: 'whole', resolve, reject };
      settle(this.transfer);
    });
  }

  bytes(): Promise<Uint8Array> {
    return this.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }

  text(): Promise<string> {
    return this.arrayBuffer().then(decodeUtf8);
  }

  json(): Promise<unknown> {
    return this.text().then((text): unknown => JSON.parse(text));
  }

  chunks(onChunk: (chunk: Uint8Array) => void): Promise<void> {
    if (!isFunction(onChunk)) return Promise.reject(TypeError('chunks takes a function'));

    if (!this.claim()) return Promise.reject(TypeError('The response body was already read'));

    return new Promise<void>((resolve, reject) => {
      const { transfer } = this;
      const deliver = (chunk: Uint8Array) => {
        try {
          onChunk(chunk);
        } catch (error) {
          host.__kuitoHostHttp?.cancel(transfer.id);
          fail(transfer, error);
        }
      };

      transfer.reader = { kind: 'chunks', onChunk: deliver, resolve, reject };

      if (transfer.ended || transfer.failure !== undefined) {
        settle(transfer);

        return;
      }

      const early = concat(transfer.parts);

      transfer.parts = [];

      if (early.byteLength) deliver(new Uint8Array(early));

      host.__kuitoHostHttp?.stream(transfer.id);
    });
  }
}

function methodOf(init: RequestInit): string {
  const method = String(init.method ?? 'GET').toUpperCase();

  if (METHODS.indexOf(method) === -1)
    throw TypeError(`fetch does not send ${method}; it sends ${METHODS.join(', ')}`);

  return method;
}

/** What crosses: text as text, bytes as exactly their own ArrayBuffer. */
function bodyOf(body: unknown): string | ArrayBuffer | undefined {
  if (body == null) return undefined;

  if (typeof body === 'string' || isArrayBuffer(body)) return body;

  if (ArrayBuffer.isView(body))
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice().buffer;

  throw TypeError(
    'A fetch body is a string, an ArrayBuffer or a typed array; JSON.stringify objects',
  );
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;

  if (
    typeof input === 'object' &&
    input !== null &&
    'href' in input &&
    typeof input.href === 'string'
  )
    return input.href;

  throw TypeError('fetch takes a URL string');
}

/** A body the host reads from a file, between optional bytes before and after it. */
export interface FileBody {
  file: string;
  prefix?: ArrayBuffer;
  suffix?: ArrayBuffer;
}

type HostBody = string | ArrayBuffer | FileBody | undefined;

/** What the host is asked beyond a plain request: where to save, and which progress to report. */
interface Extras {
  saveTo?: string;
  progress?: 'send' | 'receive';
  onProgress?: (bytes: number, total: number | null) => void;
}

/** Starts one transfer on the host; resolves at its head. */
function send(
  url: string,
  method: string,
  headers: Headers,
  body: HostBody,
  signal: AbortSignal | undefined,
  extras: Extras = {},
): Promise<Response> {
  const http = host.__kuitoHostHttp;

  if (!http) return Promise.reject(Error('This Kuito host has no HTTP client'));

  if (signal?.aborted) return Promise.reject(signal.reason);

  return new Promise<Response>((resolve, reject) => {
    const id = ++serial;
    const onAbort = () => {
      if (!transfers[id]) return;

      http.cancel(id);
      fail(transfer, signal?.reason ?? abortError());
    };
    const transfer: Transfer = {
      id,
      head: { resolve, reject },
      parts: [],
      ended: false,
      onProgress: extras.onProgress,
      release: () => signal?.removeEventListener('abort', onAbort),
    };
    const { saveTo, progress } = extras;

    transfers[id] = transfer;
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      http.start(
        id,
        {
          url,
          method,
          headers: flatHeaders(headers),
          ...(saveTo !== undefined && { saveTo }),
          ...(progress !== undefined && { progress }),
        },
        body,
      );
    } catch (error) {
      fail(transfer, error);
    }
  });
}

function request(
  input: string | { readonly href: string },
  init: RequestInit = {},
): Promise<Response> {
  try {
    const url = urlOf(input);
    const method = methodOf(init);
    const form = formBody(init.body);
    const body = form ?? bodyOf(init.body);
    const headers = makeHeaders(init.headers);

    if (form !== null && !headers.has('content-type'))
      headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');

    if (body !== undefined && (method === 'GET' || method === 'HEAD'))
      throw TypeError(`A ${method} request has no body`);

    if (typeof body === 'string' && !headers.has('content-type'))
      headers.set('content-type', 'text/plain;charset=UTF-8');

    return send(url, method, headers, body, init.signal ?? undefined);
  } catch (error) {
    return Promise.reject(error);
  }
}

export interface FileTransferRequest extends Extras {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  body?: string | ArrayBuffer | FileBody;
}

export interface FileTransferResult {
  status: number;
  url: string;
  headers: Headers;
  body: ArrayBuffer;
}

/**
 * A transfer to or from a file, for fileSystem.download and upload
 * (src/native/file-system.ts): the same host and transfers as fetch, with
 * the host writing the body to `saveTo` or reading it from a file, and
 * reporting progress. Settles once the body has ended.
 */
export function fileTransfer(request: FileTransferRequest): {
  result: Promise<FileTransferResult>;
  cancel(): void;
} {
  const controller = new AbortController();
  const result = send(
    request.url,
    methodOf({ method: request.method }),
    makeHeaders(request.headers),
    request.body,
    controller.signal,
    request,
  ).then((response) =>
    response.arrayBuffer().then((body) => ({
      status: response.status,
      url: response.url,
      headers: response.headers,
      body,
    })),
  );

  return { result, cancel: () => controller.abort() };
}

export function installFetch(): void {
  if (!host.__kuitoHostHttp) return;

  host.__kuitoHttpHead = (id, status, url, headers) => {
    const transfer = transfers[id];
    const head = transfer?.head;

    if (!head) return;

    transfer.head = undefined;
    head.resolve(new KuitoResponse(transfer, status, url, headersFrom(headers)));
  };

  host.__kuitoHttpChunk = (id, chunk) => {
    const transfer = transfers[id];

    if (!transfer) return;

    if (transfer.reader?.kind === 'chunks') transfer.reader.onChunk(new Uint8Array(chunk));
    else transfer.parts.push(chunk);
  };

  host.__kuitoHttpEnd = (id, body, error) => {
    const transfer = transfers[id];

    if (!transfer) return;

    if (error || transfer.head) {
      fail(transfer, TypeError(error || 'The host ended the request without a response'));

      return;
    }

    if (body.byteLength) transfer.parts.push(body);

    transfer.ended = true;
    finish(transfer);
    settle(transfer);
  };

  host.__kuitoHttpProgress = (id, bytes, total) =>
    transfers[id]?.onProgress?.(bytes, total < 0 ? null : total);

  host.fetch = request;
  // Proves the host can decode before an app's first response needs it.
  encodeUtf8('');
}
