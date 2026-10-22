# Web APIs

Kuito apps run on Hermes, which has the JavaScript language and `Intl` but none of a browser's globals. Kuito ships one standard library that behaves the same on iOS and Android: the globals below, plus `Headers` and `console`, which reaches the LogBox and `kuito dev`. Anything not listed here is not there.

## fetch

`fetch(url, { method, headers, body, signal })` resolves once the response's status and headers arrive; `ok` says whether it was 200-299. It rejects with a `TypeError` when the request fails on the way, and with the signal's reason when aborted. `body` is a string, an `ArrayBuffer`, a typed array or `URLSearchParams`; send JSON as `JSON.stringify(value)` with a content type. The response has `status`, `ok`, `url`, `headers`, `arrayBuffer()`, `text()`, `json()` and `chunks(onChunk)`, the streaming read in place of the Streams API.

```tsx
const token = 'my-token';
const { signal } = new AbortController();

const response = await fetch('https://example.com/logo.png', {
  headers: { Authorization: `Bearer ${token}` },
  signal,
});

response.status; // 200
const bytes = await response.arrayBuffer();
```

Not there: cookies, a redirect policy (redirects are always followed; `response.url` says where it ended), `response.body`, `ReadableStream`, `Request`, `FormData`, `Blob` and an HTTP cache.

## WebSocket

`new WebSocket(url, protocols?)` connects to a `ws:` or `wss:` URL. It has `readyState`, `protocol`, `send(data)`, `close(code?, reason?)`, the four `on...` handlers and `addEventListener`. A connection that fails or drops gets an `error` event, then a `close` with code 1006 and `wasClean: false`. `binaryType` is always `'arraybuffer'`, and no cookies are sent.

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

## AbortController, timers and performance

`new AbortController()` has a `signal` and `abort(reason?)`. Without a reason, the reason is an `Error` named `AbortError`; check `error.name`, since Hermes has no `DOMException`. `AbortSignal.timeout(ms)` makes one that aborts with an `Error` named `TimeoutError`. Tasks and resources pass their own signal: hand it to `fetch` and leaving the screen cancels the request.

`setTimeout` and `setInterval` return a number; `clearTimeout` and `clearInterval` cancel either kind. `queueMicrotask(callback)` runs `callback` after the current job and before the next timer or event. `performance.now()` is fractional milliseconds since the JS runtime started, on the platform's monotonic clock; the rest of User Timing is not there.

## URL and text encoding

`new URL(url, base?)` parses as the WHATWG URL standard does; every part is settable and `searchParams` is live both ways. Custom schemes and `file:` URLs work. An invalid URL throws a `TypeError`. Not supported: internationalized domain names (pass the punycode `xn--` form), IPv4 shorthand, `URL.createObjectURL` and blob URLs. `URLSearchParams` has the standard methods; `toString()` is `application/x-www-form-urlencoded`.

`TextEncoder` and `TextDecoder` convert UTF-8 only; invalid bytes decode as U+FFFD. Not supported: other encodings, `fatal: true` and `{ stream: true }`.

## crypto and structuredClone

`crypto.getRandomValues(array)` fills an integer typed array in place with the platform's CSPRNG. `crypto.randomUUID()` is a version 4 UUID. `crypto.subtle` is not there.

`structuredClone(value)` copies deeply, cycles included: plain objects, arrays, `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, typed arrays and errors. A function or a symbol throws an `Error` named `DataCloneError`. The `transfer` option is not there.

## Intl

`Intl` is Hermes' own, backed by the platform: `Intl.Collator`, `Intl.DateTimeFormat` and `Intl.NumberFormat`. The platforms' locale data differs in small ways, so don't compare formatted strings across them.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
```

Not there, though TypeScript's `lib` still declares it: `PluralRules`, `RelativeTimeFormat`, `ListFormat`, `Segmenter`, `DisplayNames`, `Locale` and BigInt formatting. Check `'PluralRules' in Intl` before using one. On iOS only, `NumberFormat`'s `formatToParts` is not there, and `notation: 'compact'` and `signDisplay` are ignored.

## In depth

[Web APIs](../../../../docs/web-apis.md) covers every option and member of each global, `Headers`, streaming with `chunks`, how requests cross to the platform and the smoke tests that check each entry on a device.
