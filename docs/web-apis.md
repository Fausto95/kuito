# Web APIs

Kuito apps run on Hermes, which has the JavaScript language and `Intl` but
none of a browser's globals. Instead of polyfilling web APIs one at a time,
Kuito ships one standard library: implemented once, in the kernel
(`src/runtime`) or in shared C++ (`native/shared`), so it behaves the same on
iOS and Android, and typed in `src/ui/globals.d.ts`. This page lists all of
it, and what each part doesn't do. Anything not listed here is not there.

| Global                                        | Notes                                                       |
| --------------------------------------------- | ----------------------------------------------------------- |
| `fetch`                                       | Over the platform's HTTP client: URLSession, OkHttp         |
| `WebSocket`                                   | Over URLSession and OkHttp; text and `ArrayBuffer` messages |
| `Headers`                                     | Case-insensitive; iterates lowercased and sorted            |
| `AbortController`, `AbortSignal`              | `AbortSignal.abort()`, `AbortSignal.timeout()`              |
| `setTimeout`, `setInterval` and their clears  | On the JS thread's run loop                                 |
| `queueMicrotask`                              | Hermes' promise job queue                                   |
| `performance.now()`, `performance.timeOrigin` | A monotonic clock from the runtime's start                  |
| `URL`, `URLSearchParams`                      | WHATWG parsing, without internationalized domain names      |
| `TextEncoder`, `TextDecoder`                  | UTF-8 only, converted in C++                                |
| `crypto.getRandomValues()`, `randomUUID()`    | The platform's CSPRNG; no `crypto.subtle`                   |
| `structuredClone`                             | Deep copy with cycles; no `transfer`                        |
| `Intl`                                        | Hermes' own, with `PluralRules` and three formats added     |
| `console`                                     | Reaches the LogBox and `kuito dev` ([logbox](logbox.md))    |

`demo/web-apis.tsx` runs every entry on a device (`kuito dev ios --entry
web-apis.tsx` in `demo/`) and prints `ok` or `FAILED` for each.
`test/shell-smoke.test.ts` builds a shell of its own on the simulator or
emulator you name and checks `fetch` of a PNG as an `ArrayBuffer` and `Intl`
there; the `Native mobile shells` workflow runs it on both platforms:

```bash
KUITO_SMOKE_IOS="iPhone 18 Pro" KUITO_SMOKE_ANDROID=emulator-5554 npx vp test run test/shell-smoke.test.ts
```

## fetch

```tsx
declare const token: string;

const controller = new AbortController();
const response = await fetch('https://example.com/logo.png', {
  headers: { Authorization: `Bearer ${token}` },
  signal: controller.signal,
});

response.status; // 200
response.headers.get('Content-Type'); // 'image/png'

const bytes = await response.arrayBuffer();
```

`fetch(url, { method, headers, body, signal })` resolves once the response's
status and headers arrive, whatever the status; `ok` says whether it was
200–299. It rejects with a `TypeError` when the request fails on the way (no
connection, DNS, TLS), with the platform's message, and with the signal's
reason when aborted.

- **`url`** is an `http` or `https` URL string or a `URL`.
- **`method`** is `GET` (default), `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` or
  `OPTIONS`, in any case. Others are a `TypeError`.
- **`headers`** is a `Headers`, `[name, value]` pairs or an object. A name that
  isn't an HTTP token, or a value with CR, LF or NUL, is a `TypeError`.
- **`body`** is a string, sent as UTF-8 with `Content-Type:
  text/plain;charset=UTF-8` unless you set one; an `ArrayBuffer`; or a typed
  array or `DataView`, sent as exactly its own bytes; or `URLSearchParams`,
  sent as a form (`application/x-www-form-urlencoded;charset=UTF-8`). `GET` and `HEAD` take
  none. Send JSON as `JSON.stringify(value)` with a content type.

The response:

| Member                     | Is                                                      |
| -------------------------- | ------------------------------------------------------- |
| `status`, `ok`             | The status code; whether it is 200–299                  |
| `url`                      | The URL that answered, after redirects                  |
| `headers`                  | A `Headers`; a repeated header reads as `"a, b"`        |
| `arrayBuffer()`, `bytes()` | The body as an `ArrayBuffer` or a `Uint8Array`          |
| `text()`, `json()`         | The body decoded as UTF-8 (invalid bytes become U+FFFD) |
| `chunks(onChunk)`          | The body as it arrives, a `Uint8Array` at a time        |
| `bodyUsed`                 | A body reads once; a second read is a `TypeError`       |

### Streaming

`chunks` is Kuito's streaming read, in place of the Streams API. `onChunk`
gets each piece as the network delivers it, and the promise resolves when the
body ends, or rejects on a failure or an abort. Use it for server-sent events,
long downloads with progress, or anything too big to hold twice.

```tsx
import { signal } from 'kuito';

const url = 'https://example.com/movie.mp4';
const controller = new AbortController();
const progress = signal(0);

const response = await fetch(url, { signal: controller.signal });
let received = 0;

await response.chunks((chunk) => {
  received += chunk.byteLength;
  progress.value = received / Number(response.headers.get('content-length'));
});
```

Without `chunks`, the platform buffers the body and hands it to JavaScript
once, at the end, in one copy. An `onChunk` that throws cancels the request,
and `chunks` rejects with what it threw.

### How it crosses

`__kuitoHostHttp.start(id, { url, method, headers }, body)` hands a request
to the platform's client (`native/shared/Http.h`); headers cross as a flat
`[name, value, …]` array and the body as a string or an `ArrayBuffer`, copied
once. The client answers on the JS thread with `__kuitoHttpHead`, then
`__kuitoHttpEnd` with the body as an `ArrayBuffer` JavaScript owns. `chunks`
calls `stream(id)`: the client sends what it buffered, then each piece through
`__kuitoHttpChunk`. `cancel(id)` stops it. `fileSystem.download` and `upload`
([file system](file-system.md#downloads-and-uploads)) use the same host,
asking it to write the body to a file (`saveTo`), read it from one (a
`{ file, prefix, suffix }` body) and report `__kuitoHttpProgress`. On iOS the client is a
`URLSession` data delegate (`KuitoHTTPClient.m`); on Android, OkHttp reading
the body's `BufferedSource` (`KuitoHttpClient.kt`).

### What fetch doesn't do

- **Cookies.** None are stored or sent for you, on either platform, and
  `credentials` is not an option. Read `set-cookie` yourself and send what
  you need in headers.
- **Redirect policy.** Redirects are always followed; `response.url` says
  where it ended. `redirect: 'manual'` is not an option.
- **The Streams API.** `response.body`, `ReadableStream` and streamed request
  bodies are not there; read with `chunks`, upload a whole body.
- **`Request`, `new Response(...)`, `FormData`, `Blob`.** Pass a URL and an
  init object; build multipart bodies yourself.
- **Caching, `mode`, `referrer`, `keepalive`, `priority`.** There is no HTTP
  cache: every request goes to the network. `Image` keeps its own cache
  ([primitives](primitives.md#image)).

## WebSocket

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

`new WebSocket(url, protocols?)` connects to a `ws:` or `wss:` URL (another
scheme, a fragment or a repeated protocol is a `SyntaxError`), through
`URLSessionWebSocketTask` on iOS and OkHttp on Android
(`native/shared/Socket.h`). It has `readyState` and the four constants,
`protocol` (the one the server chose), `send(data)` and `close(code?,
reason?)`, the `onopen`, `onmessage`, `onerror` and `onclose` handlers and
`addEventListener` for the same four. Listeners get an event with `type` and
`target`, plus `data` for a message, `message` (the platform's description)
for an error, and `code`, `reason` and `wasClean` for a close.

- `send` takes a string or bytes (`ArrayBuffer`, a typed array, a
  `DataView`); before the socket opens it is an `InvalidStateError`, after it
  closes it does nothing.
- `close` takes 1000 or 3000–4999 (`InvalidAccessError` otherwise) and a
  reason of at most 123 bytes of UTF-8 (`SyntaxError`).
- A connection that fails or drops gets an `error` event, then a `close`
  with code 1006 and `wasClean: false`.

What it doesn't do: `binaryType` is always `'arraybuffer'` (there is no
`Blob`; setting `'blob'` is a `SyntaxError`); `bufferedAmount` is always 0,
since bytes are not counted on their way out; `extensions` is always empty
(no `permessage-deflate`); no cookies are sent. Listeners run before the
`on…` handler, whatever order they were added in.

## Headers

`new Headers(init)` takes `Headers`, `[name, value]` pairs or an object, and
has `append`, `set`, `get`, `has`, `delete`, `forEach`, `keys`, `values`,
`entries` and iteration. Names compare case-insensitively and come back
lowercased, sorted; `get` joins a repeated name's values with `", "`.
`getSetCookie` is not there; `get('set-cookie')` joins them.

## AbortController

`new AbortController()` has a `signal` and `abort(reason?)`. The signal has
`aborted`, `reason`, `onabort`, `throwIfAborted()` and `abort` listeners
(`addEventListener('abort', listener, { once })`). Without a reason, the
reason is an `Error` named `AbortError`; check `error.name`, since Hermes has
no `DOMException`. `AbortSignal.abort(reason)` makes one already aborted;
`AbortSignal.timeout(ms)` one that aborts with an `Error` named
`TimeoutError`. `AbortSignal.any` is not there.

Tasks and resources pass their own signal ([async](async.md)); hand it to
`fetch` and leaving the screen cancels the request.

## Timers and microtasks

`setTimeout(callback, delay, ...args)` and `setInterval(callback, delay,
...args)` return a number; `clearTimeout(id)` and `clearInterval(id)` cancel
either kind, since they share ids. Each run is a job of its own on the JS
thread, followed by a microtask checkpoint. A delay is clamped to
0–2,147,000,000 ms; there is no 4 ms nesting clamp and no throttling beyond
what the platform does to a backgrounded app. An interval is re-armed before
its callback runs, so one that throws keeps repeating, and one that clears
itself stops.

`queueMicrotask(callback)` runs `callback` after the current job and before
the next timer or event. An error it throws reaches the LogBox as an
unhandled rejection.

## performance

`performance.now()` is milliseconds, fractional, since the app's JS runtime
started, on the platform's monotonic clock: it never goes back when the user
changes the time. `performance.timeOrigin` is the wall-clock time of that
start. `mark`, `measure` and the rest of User Timing are not there; the
devtools' profiler covers them ([devtools](devtools.md)).

## URL and URLSearchParams

`new URL(url, base?)` parses as the WHATWG URL standard does: scheme, user
and password, host (lowercased), port (dropped when it is the scheme's
default), path (with `.` and `..` resolved) and query and fragment, each
percent-encoded as the standard says, and a relative URL resolved against
`base`. Every part is settable; `searchParams` is live both ways.
`URL.canParse` and `URL.parse` answer without throwing. Custom schemes work
(`myapp://route/show/1`, `mailto:x@y.z`), as do `file:` URLs.

An invalid URL throws a `TypeError` that says what is wrong, where the
standard would sometimes repair it. Not supported:

- **Internationalized domain names.** A host outside ASCII is a `TypeError`;
  pass its punycode (`xn--`) form.
- **IPv4 shorthand** (`http://0x7f.1`, `http://2130706433`): such hosts are
  kept as written. IPv6 hosts in brackets are kept as written, lowercased.
- `URL.createObjectURL` and blob URLs.

`URLSearchParams` takes a query string (with or without `?`), `[name, value]`
pairs, an object or another `URLSearchParams`, and has `append`, `delete`,
`get`, `getAll`, `has`, `set`, `sort`, `forEach`, `keys`, `values`,
`entries`, `size` and iteration. `toString()` is
`application/x-www-form-urlencoded`: spaces as `+`.

## TextEncoder and TextDecoder

`new TextEncoder().encode(text)` is the text as UTF-8 in a `Uint8Array`, a
lone surrogate as U+FFFD; `encodeInto(text, bytes)` writes whole characters
while they fit and says how much it `read` and `written`.
`new TextDecoder().decode(bytes)` takes an `ArrayBuffer` or any view; invalid
bytes decode as U+FFFD, and a leading BOM is dropped unless `ignoreBOM`. The
conversion is C++ (`native/shared/Utf8.h`), not a loop in the interpreter.

Not supported: encodings other than UTF-8 (a `RangeError`), `fatal: true` (a
`TypeError`), and `{ stream: true }`.

## crypto

`crypto.getRandomValues(array)` fills an integer typed array in place with
`arc4random_buf`, the platform's CSPRNG, and returns it: at most 65,536 bytes
(`QuotaExceededError`), integer arrays only (`TypeMismatchError`).
`crypto.randomUUID()` is an RFC 9562 version 4 UUID. `crypto.subtle` (hashing,
signing, encryption) is not there.

## structuredClone

`structuredClone(value)` copies deeply: primitives, plain objects, arrays,
`Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, typed arrays and `DataView`
(views of one buffer still share their copy), boxed primitives and errors.
Cycles and shared references survive. A class instance becomes a plain
object with its own enumerable properties. A function or a symbol throws an
`Error` named `DataCloneError`. The `transfer` option is not there: buffers
are always copied.

## Intl

`Intl` is Hermes' own, backed by the platform: Foundation on iOS, `java.text`
and ICU on Android. Both have `Intl.Collator`, `Intl.DateTimeFormat`,
`Intl.NumberFormat` and `Intl.getCanonicalLocales`, and `toLocaleString`,
`toLocaleDateString`, `localeCompare` and `toLocaleUpperCase` format with
them.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5); // '€1,234.50'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
new Intl.Collator('de').compare('ä', 'z'); // -1
```

These work alike on both: `NumberFormat`'s `style` `decimal`, `currency` and
`percent`, fraction and significant digits, `currencyDisplay`, and
`resolvedOptions()`; `DateTimeFormat`'s `dateStyle`, `timeStyle`, each field
option, `hour12`, any IANA `timeZone`, `formatToParts()` and
`resolvedOptions()`; `Collator`'s `sensitivity` and `numeric`; and each
constructor's `supportedLocalesOf`. The platforms' locale data differs in
small ways, so don't compare formatted strings across them: `currencyDisplay:
'name'` gives `2.00 euros` on iOS and `Euro 2.00` on Android, `timeZoneName:
'short'` `GMT` on iOS and `UTC` on Android.

Hermes has no `PluralRules`, `RelativeTimeFormat`, `ListFormat` or
`DisplayNames`; Kuito adds them to `Intl` (`src/native/intl`), and keeps a
runtime's own where it has one (Node, in tests). `PluralRules` is there
before the app runs. The other three ask the platform's locale data, so each
is added only for an app that names it: a module whose source mentions
`RelativeTimeFormat`, `ListFormat` or `DisplayNames` imports its installer
first (`src/dev/intl-formats.ts`), and an app that names none ships none of
the IntlFormats native module. A name built at run time
(`Intl['List' + 'Format']`) is not seen:

```tsx
new Intl.PluralRules('ru').select(3); // 'few'
new Intl.PluralRules('en', { type: 'ordinal' }).select(22); // 'two'
new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-1, 'day'); // 'yesterday'
new Intl.ListFormat('pt').format(['maçãs', 'peras', 'uvas']); // 'maçãs, peras e uvas'
new Intl.DisplayNames('fr', { type: 'region' }).of('DE'); // 'Allemagne'
```

- **`PluralRules`** runs on CLDR 48's rules, in JavaScript, the same on both
  platforms: `select`, `resolvedOptions` and `supportedLocalesOf`, with the
  digit options. The rules are Unicode data (`src/native/intl/LICENSE-unicode`);
  `test/intl-polyfill.test.ts` holds every locale to ICU's answers. It has no
  `selectRange`. `localization.messages` picks its plural forms
  ([localization](localization.md#messages)).
- They are the JS thread's: code the compiler places on the UI thread
  ([placement](placement.md)) sees Hermes' `Intl` without them.
- **`RelativeTimeFormat`**, **`ListFormat`** and **`DisplayNames`** ask the
  platform's locale data: Foundation on iOS, `android.icu` on Android. They
  have `format` or `of`, `resolvedOptions` and `supportedLocalesOf`, not
  `formatToParts`. Options are checked as ECMA-402 checks them; where a
  platform lacks one, construction throws a `RangeError` that says so:
  - `ListFormat`'s `type: 'disjunction'` and `'unit'` throw on iOS, whose
    `ListFormatter` joins with "and" only, and on Android before 13 (API 33).
    Their `style` is `long` whatever you pass on iOS and before Android 13.
  - `RelativeTimeFormat` on iOS formats whole units (`1.5` days rounds), a
    quarter as three months, and `-0` as `in 0 days`; a value too large for
    a 64-bit integer throws a `RangeError`. On Android 8 (API 26, 27) it formats
    numerically even with `numeric: 'auto'`, and a quarter as three months.
  - `DisplayNames` has no `dateTimeField` type on either. On iOS each name
    is the long, standard one whatever the `style` and `languageDisplay`.

What isn't there. TypeScript's `lib` still declares all of it, and a
declaration file can't remove it (`src/ui/globals.d.ts`), so it type-checks
and throws a `TypeError` on a device:

- **`Segmenter`, `Locale`** and **`Intl.supportedValuesOf`**, on either
  platform.
- **`DateTimeFormat`'s `formatRange` and `formatRangeToParts`**, on either.
- **BigInt**: `NumberFormat.format(10n)` throws `Cannot convert BigInt to
  number`; format `Number(value)` or the digits yourself.
- **On iOS only**: `NumberFormat`'s `formatToParts` is not there; `notation:
  'compact'` and `signDisplay` are ignored (`1,234`, `1`, where Android gives
  `1.2K`, `+1`); and `style: 'unit'` converts to the locale's units
  (`{ unit: 'kilometer' }` formats 5 as `3.107mi` in `en-US`), so don't use it.

`test/shell-smoke.test.ts` checks the subset in each platform's shell.
