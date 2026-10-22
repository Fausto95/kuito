# Web-APIs

Kuito-Apps laufen auf Hermes, das die JavaScript-Sprache und `Intl` hat, aber keine der Globals eines Browsers. Kuito liefert eine Standardbibliothek, die sich auf iOS und Android gleich verhält: die Globals unten, dazu `Headers` und `console`, das die LogBox und `kuito dev` erreicht. Was hier nicht aufgeführt ist, ist nicht vorhanden.

## fetch

`fetch(url, { method, headers, body, signal })` wird aufgelöst, sobald Status und Header der Antwort eintreffen; `ok` sagt, ob er 200-299 war. Es wird mit einem `TypeError` abgelehnt, wenn die Anfrage unterwegs fehlschlägt, und mit dem Grund des Signals, wenn sie abgebrochen wurde. `body` ist ein String, ein `ArrayBuffer`, ein Typed Array oder `URLSearchParams`; JSON wird als `JSON.stringify(value)` mit einem Content-Type gesendet. Die Antwort hat `status`, `ok`, `url`, `headers`, `arrayBuffer()`, `text()`, `json()` und `chunks(onChunk)`, das streamende Lesen anstelle der Streams API.

```tsx
const response = await fetch('https://example.com/logo.png', {
  headers: { Authorization: `Bearer ${token}` },
  signal,
});

response.status; // 200
const bytes = await response.arrayBuffer();
```

Nicht vorhanden: Cookies, eine Redirect-Richtlinie (Redirects werden immer gefolgt; `response.url` sagt, wo sie endeten), `response.body`, `ReadableStream`, `Request`, `FormData`, `Blob` und ein HTTP-Cache.

## WebSocket

`new WebSocket(url, protocols?)` verbindet sich mit einer `ws:`- oder `wss:`-URL. Es hat `readyState`, `protocol`, `send(data)`, `close(code?, reason?)`, die vier `on...`-Handler und `addEventListener`. Eine Verbindung, die fehlschlägt oder abbricht, erhält ein `error`-Ereignis, dann ein `close` mit Code 1006 und `wasClean: false`. `binaryType` ist immer `'arraybuffer'`, und es werden keine Cookies gesendet.

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

## AbortController, Timer und performance

`new AbortController()` hat ein `signal` und `abort(reason?)`. Ohne Grund ist der Grund ein `Error` namens `AbortError`; `error.name` prüfen, da Hermes keine `DOMException` hat. `AbortSignal.timeout(ms)` erzeugt eines, das mit einem `Error` namens `TimeoutError` abbricht. Tasks und Resources reichen ihr eigenes Signal weiter: an `fetch` übergeben, und das Verlassen des Screens bricht die Anfrage ab.

`setTimeout` und `setInterval` geben eine Zahl zurück; `clearTimeout` und `clearInterval` brechen beide Arten ab. `queueMicrotask(callback)` führt `callback` nach dem aktuellen Job und vor dem nächsten Timer oder Ereignis aus. `performance.now()` sind Millisekunden mit Nachkommastellen seit dem Start der JS-Laufzeit, auf der monotonen Uhr der Plattform; der Rest von User Timing ist nicht vorhanden.

## URL und Textkodierung

`new URL(url, base?)` parst wie der WHATWG-URL-Standard; jeder Teil ist setzbar und `searchParams` ist in beide Richtungen live. Eigene Schemes und `file:`-URLs funktionieren. Eine ungültige URL wirft einen `TypeError`. Nicht unterstützt: internationalisierte Domainnamen (die Punycode-Form `xn--` übergeben), IPv4-Kurzschreibweise, `URL.createObjectURL` und Blob-URLs. `URLSearchParams` hat die Standardmethoden; `toString()` ist `application/x-www-form-urlencoded`.

`TextEncoder` und `TextDecoder` konvertieren nur UTF-8; ungültige Bytes werden als U+FFFD dekodiert. Nicht unterstützt: andere Kodierungen, `fatal: true` und `{ stream: true }`.

## crypto und structuredClone

`crypto.getRandomValues(array)` füllt ein ganzzahliges Typed Array an Ort und Stelle mit dem CSPRNG der Plattform. `crypto.randomUUID()` ist eine UUID der Version 4. `crypto.subtle` ist nicht vorhanden.

`structuredClone(value)` kopiert tief, Zyklen eingeschlossen: einfache Objekte, Arrays, `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, Typed Arrays und Fehler. Eine Funktion oder ein Symbol wirft einen `Error` namens `DataCloneError`. Die Option `transfer` ist nicht vorhanden.

## Intl

`Intl` ist Hermes' eigenes, gestützt auf die Plattform: `Intl.Collator`, `Intl.DateTimeFormat` und `Intl.NumberFormat`. Die Locale-Daten der Plattformen unterscheiden sich in Kleinigkeiten, formatierte Strings also nicht plattformübergreifend vergleichen.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
```

Nicht vorhanden, obwohl TypeScripts `lib` es weiterhin deklariert: `PluralRules`, `RelativeTimeFormat`, `ListFormat`, `Segmenter`, `DisplayNames`, `Locale` und BigInt-Formatierung. Vor der Verwendung `'PluralRules' in Intl` prüfen. Nur auf iOS ist `formatToParts` von `NumberFormat` nicht vorhanden, und `notation: 'compact'` und `signDisplay` werden ignoriert.

## Vertiefung

[Web-APIs](../../../../docs/web-apis.md) behandelt jede Option und jeden Member jedes Globals, `Headers`, Streaming mit `chunks`, wie Anfragen zur Plattform übergehen und die Smoke-Tests, die jeden Eintrag auf einem Gerät prüfen.
