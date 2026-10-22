// Web APIs Kuito's runtime provides inside Hermes (src/runtime/web.ts),
// declared to match what it implements rather than the full DOM library.

declare global {
  interface AbortSignal {
    readonly aborted: boolean;
    /** An Error named `AbortError` (or `TimeoutError`) unless `abort` was given one. */
    readonly reason: unknown;
    onabort: ((event: { type: 'abort'; target: AbortSignal }) => void) | null;
    throwIfAborted(): void;
    addEventListener(
      type: 'abort',
      listener: (event: { type: 'abort'; target: AbortSignal }) => void,
      options?: { once?: boolean },
    ): void;
    removeEventListener(
      type: 'abort',
      listener: (event: { type: 'abort'; target: AbortSignal }) => void,
    ): void;
  }

  var AbortSignal: {
    readonly prototype: AbortSignal;
    abort(reason?: unknown): AbortSignal;
    timeout(milliseconds: number): AbortSignal;
  };

  interface AbortController {
    readonly signal: AbortSignal;
    abort(reason?: unknown): void;
  }

  var AbortController: { readonly prototype: AbortController; new (): AbortController };

  /** Names are case-insensitive and iterate lowercased, sorted. */
  interface Headers {
    append(name: string, value: string): void;
    set(name: string, value: string): void;
    /** A repeated name's values, joined by ", ". */
    get(name: string): string | null;
    has(name: string): boolean;
    delete(name: string): void;
    forEach(callback: (value: string, name: string, headers: Headers) => void): void;
    keys(): string[];
    values(): string[];
    entries(): [string, string][];
    [Symbol.iterator](): IterableIterator<[string, string]>;
  }

  type HeadersInit = Headers | [string, string][] | Record<string, string>;

  var Headers: { readonly prototype: Headers; new (init?: HeadersInit): Headers };

  type BodyInit = string | ArrayBuffer | ArrayBufferView | URLSearchParams;

  interface RequestInit {
    method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
    headers?: HeadersInit;
    /**
     * A string goes as UTF-8, `text/plain;charset=UTF-8` unless a content type
     * is set; URLSearchParams as a form.
     */
    body?: BodyInit | null;
    signal?: AbortSignal | null;
  }

  interface Response {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    /** The URL that answered, after redirects. */
    readonly url: string;
    readonly headers: Headers;
    readonly bodyUsed: boolean;
    arrayBuffer(): Promise<ArrayBuffer>;
    bytes(): Promise<Uint8Array>;
    text(): Promise<string>;
    json(): Promise<unknown>;
    /**
     * Kuito's streaming read, in place of the Streams API: `onChunk` gets
     * the body piece by piece as it arrives; resolves when it ends.
     */
    chunks(onChunk: (chunk: Uint8Array) => void): Promise<void>;
  }

  /** Resolves at the response's head; see docs/web-apis.md for what it doesn't do. */
  var fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;

  var setTimeout: <A extends unknown[]>(
    callback: (...args: A) => void,
    delay?: number,
    ...args: A
  ) => number;

  var clearTimeout: (id: number | undefined) => void;

  /** Shares ids with setTimeout: clearTimeout and clearInterval cancel either. */
  var setInterval: <A extends unknown[]>(
    callback: (...args: A) => void,
    delay?: number,
    ...args: A
  ) => number;

  var clearInterval: (id: number | undefined) => void;

  var queueMicrotask: (callback: () => void) => void;

  /** `now()` is milliseconds since the app's JS runtime started, on a monotonic clock. */
  var performance: { now(): number; readonly timeOrigin: number };

  interface URLSearchParams extends Iterable<[string, string]> {
    readonly size: number;
    append(name: string, value: string): void;
    delete(name: string, value?: string): void;
    get(name: string): string | null;
    getAll(name: string): string[];
    has(name: string, value?: string): boolean;
    set(name: string, value: string): void;
    sort(): void;
    forEach(callback: (value: string, name: string, params: URLSearchParams) => void): void;
    keys(): IterableIterator<string>;
    values(): IterableIterator<string>;
    entries(): IterableIterator<[string, string]>;
    /** application/x-www-form-urlencoded: spaces as `+`. */
    toString(): string;
  }

  var URLSearchParams: {
    readonly prototype: URLSearchParams;
    new (
      init?: string | [string, string][] | Record<string, string> | URLSearchParams,
    ): URLSearchParams;
  };

  /** WHATWG URL without internationalized domain names; see docs/web-apis.md. */
  interface URL {
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
    readonly searchParams: URLSearchParams;
    toString(): string;
    toJSON(): string;
  }

  var URL: {
    readonly prototype: URL;
    /** Throws a TypeError naming what is wrong with an invalid URL. */
    new (url: string, base?: string | URL): URL;
    canParse(url: string, base?: string): boolean;
    parse(url: string, base?: string): URL | null;
  };

  interface TextEncoder {
    readonly encoding: 'utf-8';
    encode(text?: string): Uint8Array;
    encodeInto(text: string, into: Uint8Array): { read: number; written: number };
  }

  var TextEncoder: { readonly prototype: TextEncoder; new (): TextEncoder };

  /** UTF-8 only; invalid bytes decode as U+FFFD. */
  interface TextDecoder {
    readonly encoding: 'utf-8';
    readonly fatal: false;
    readonly ignoreBOM: boolean;
    decode(input?: ArrayBuffer | ArrayBufferView): string;
  }

  var TextDecoder: {
    readonly prototype: TextDecoder;
    new (label?: string, options?: { fatal?: false; ignoreBOM?: boolean }): TextDecoder;
  };

  /** The platform's CSPRNG; no SubtleCrypto. */
  interface Crypto {
    getRandomValues<T extends ArrayBufferView>(array: T): T;
    randomUUID(): string;
  }

  var crypto: Crypto;

  /** What a WebSocket's listeners get: `data` for message, `code`, `reason`, `wasClean` for close. */
  interface WebSocketEvent {
    readonly type: 'open' | 'message' | 'error' | 'close';
    readonly target: WebSocket;
    /** A text message as a string, a binary one as an ArrayBuffer. */
    readonly data?: string | ArrayBuffer;
    /** The platform's description of an error. */
    readonly message?: string;
    readonly code?: number;
    readonly reason?: string;
    readonly wasClean?: boolean;
  }

  interface WebSocket {
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;
    readonly url: string;
    readonly readyState: 0 | 1 | 2 | 3;
    /** The subprotocol the server chose, once open. */
    readonly protocol: string;
    /** Always 0: bytes are not counted on their way out. */
    readonly bufferedAmount: number;
    readonly extensions: string;
    /** Only 'arraybuffer': there is no Blob. */
    binaryType: 'arraybuffer';
    onopen: ((event: WebSocketEvent) => void) | null;
    onmessage: ((event: WebSocketEvent) => void) | null;
    onerror: ((event: WebSocketEvent) => void) | null;
    onclose: ((event: WebSocketEvent) => void) | null;
    addEventListener(type: WebSocketEvent['type'], listener: (event: WebSocketEvent) => void): void;
    removeEventListener(
      type: WebSocketEvent['type'],
      listener: (event: WebSocketEvent) => void,
    ): void;
    send(data: string | ArrayBuffer | ArrayBufferView): void;
    close(code?: number, reason?: string): void;
  }

  var WebSocket: {
    readonly prototype: WebSocket;
    new (url: string | URL, protocols?: string | string[]): WebSocket;
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;
  };

  // Intl is Hermes' own, typed by the ES2024 lib, which declares all of
  // ECMA-402; a declaration file can't take members back out of it. Both
  // platforms have Collator, DateTimeFormat, NumberFormat and
  // getCanonicalLocales, and Kuito adds PluralRules, RelativeTimeFormat,
  // ListFormat and DisplayNames (src/native/intl). These type-check but
  // throw on a device: Segmenter, Locale, supportedValuesOf, formatRange,
  // formatToParts on the added formats and BigInt formatting; iOS also
  // lacks NumberFormat's formatToParts (docs/web-apis.md#intl).

  /** Deep copy with cycles; functions and symbols throw a DataCloneError. No `transfer`. */
  var structuredClone: <T>(value: T) => T;

  /** Every entry reaches the LogBox and the `kuito dev` terminal; see docs/logbox.md. */
  var console: {
    log(...values: unknown[]): void;
    info(...values: unknown[]): void;
    debug(...values: unknown[]): void;
    warn(...values: unknown[]): void;
    error(...values: unknown[]): void;
  };
}

export {};
