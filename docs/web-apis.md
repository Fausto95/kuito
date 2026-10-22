# Use HTTP and Web APIs

Kuito provides platform-backed Web APIs without a browser DOM. Use fetch for HTTP, WebSocket for a persistent connection, and the available standard utilities for URLs, bytes and timing.

## Fetch JSON and handle failure

Check HTTP status before consuming a response. Use AbortController or a task’s supplied signal for cancellation. There is no browser cookie jar or HTTP cache in this host; explicitly authenticate requests as your server requires.

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

## Keep a connection open

Open a WebSocket when your feature needs live messages and close it during cleanup. Handle connection errors and reconnection in the application rather than assuming the connection stays available.

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

## Format values for the user

Intl formats supported numbers, dates and messages using the platform-backed implementation. Read localization signals when formatting must react to a changed language.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
```

## Choose the right utility

URL and URLSearchParams build URLs; Headers manages request headers; TextEncoder and TextDecoder convert UTF-8; crypto supplies random values and UUIDs. Timers, queueMicrotask, performance and structuredClone support ordinary app work. These globals need no kuito import.

## Know the runtime boundary

App code runs in Hermes, not a web page or Node. There is no document, browser window, localStorage or Node file system. Use fileSystem for files and storage for persistence. The global API reference documents the supported subset, including request and response shapes; a familiar name does not imply every browser feature exists.

## Continue

See [async work](async.md), [network state](network.md), [files](file-system.md) and the [API reference](https://kuito.dev/docs/apis).
