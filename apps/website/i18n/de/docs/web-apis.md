# Web-APIs

Kuito-Apps laufen auf Hermes, das die JavaScript-Sprache und `Intl` hat, aber
keine der Globals eines Browsers. Statt Web-APIs einzeln zu polyfillen,
liefert Kuito eine einzige Standardbibliothek: einmal implementiert, im
Kernel (`src/runtime`) oder in gemeinsamem C++ (`native/shared`), sodass sie
sich auf iOS und Android gleich verhält, und typisiert in
`src/ui/globals.d.ts`. Diese Seite listet sie vollständig auf, und was jeder
Teil nicht tut. Was hier nicht aufgeführt ist, ist nicht vorhanden.

| Global                                        | Hinweise                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| `fetch`                                       | Über den HTTP-Client der Plattform: URLSession, OkHttp                       |
| `WebSocket`                                   | Über URLSession und OkHttp; Text- und `ArrayBuffer`-Nachrichten              |
| `Headers`                                     | Groß-/Kleinschreibung wird ignoriert; iteriert kleingeschrieben und sortiert |
| `AbortController`, `AbortSignal`              | `AbortSignal.abort()`, `AbortSignal.timeout()`                               |
| `setTimeout`, `setInterval` und ihre Clears   | Auf der Run Loop des JS-Threads                                              |
| `queueMicrotask`                              | Die Promise-Job-Queue von Hermes                                             |
| `performance.now()`, `performance.timeOrigin` | Eine monotone Uhr ab dem Start der Laufzeit                                  |
| `URL`, `URLSearchParams`                      | WHATWG-Parsing, ohne internationalisierte Domainnamen                        |
| `TextEncoder`, `TextDecoder`                  | Nur UTF-8, in C++ konvertiert                                                |
| `crypto.getRandomValues()`, `randomUUID()`    | Der CSPRNG der Plattform; kein `crypto.subtle`                               |
| `structuredClone`                             | Tiefe Kopie mit Zyklen; kein `transfer`                                      |
| `Intl`                                        | Hermes' eigenes: `Collator`, `DateTimeFormat`, `NumberFormat`                |
| `console`                                     | Erreicht die LogBox und `kuito dev` ([LogBox](logbox.md))                   |

`demo/web-apis.tsx` führt jeden Eintrag auf einem Gerät aus (`kuito dev ios --entry
web-apis.tsx` in `demo/`) und gibt für jeden `ok` oder `FAILED` aus.
`test/shell-smoke.test.ts` baut eine eigene Shell auf dem angegebenen
Simulator oder Emulator und prüft dort `fetch` eines PNG als `ArrayBuffer`
sowie `Intl`; der Workflow `Native mobile shells` führt ihn auf beiden
Plattformen aus:

```bash
KUITO_SMOKE_IOS="iPhone 18 Pro" KUITO_SMOKE_ANDROID=emulator-5554 npx vp test run test/shell-smoke.test.ts
```

## fetch

```tsx
const response = await fetch('https://example.com/logo.png', {
  headers: { Authorization: `Bearer ${token}` },
  signal,
});

response.status; // 200
response.headers.get('Content-Type'); // 'image/png'

const bytes = await response.arrayBuffer();
```

`fetch(url, { method, headers, body, signal })` wird aufgelöst, sobald Status
und Header der Antwort eintreffen, unabhängig vom Status; `ok` sagt, ob er
200–299 war. Es wird mit einem `TypeError` abgelehnt, wenn die Anfrage
unterwegs fehlschlägt (keine Verbindung, DNS, TLS), mit der Meldung der
Plattform, und mit dem Grund des Signals, wenn sie abgebrochen wurde.

- **`url`** ist ein `http`- oder `https`-URL-String oder eine `URL`.
- **`method`** ist `GET` (Standard), `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`
  oder `OPTIONS`, in beliebiger Schreibweise. Andere sind ein `TypeError`.
- **`headers`** ist ein `Headers`, `[name, value]`-Paare oder ein Objekt. Ein
  Name, der kein HTTP-Token ist, oder ein Wert mit CR, LF oder NUL ist ein
  `TypeError`.
- **`body`** ist ein String, gesendet als UTF-8 mit `Content-Type:
  text/plain;charset=UTF-8`, sofern keiner gesetzt ist; ein `ArrayBuffer`;
  oder ein typisiertes Array oder `DataView`, gesendet als genau seine
  eigenen Bytes; oder `URLSearchParams`, gesendet als Formular
  (`application/x-www-form-urlencoded;charset=UTF-8`). `GET` und `HEAD`
  nehmen keinen an. JSON als `JSON.stringify(value)` mit einem Content-Type
  senden.

Die Antwort:

| Member                     | Ist                                                                 |
| -------------------------- | ------------------------------------------------------------------- |
| `status`, `ok`             | Der Statuscode; ob er 200–299 ist                                   |
| `url`                      | Die URL, die geantwortet hat, nach Weiterleitungen                  |
| `headers`                  | Ein `Headers`; ein wiederholter Header liest sich als `"a, b"`      |
| `arrayBuffer()`, `bytes()` | Der Body als `ArrayBuffer` oder `Uint8Array`                        |
| `text()`, `json()`         | Der Body als UTF-8 dekodiert (ungültige Bytes werden zu U+FFFD)     |
| `chunks(onChunk)`          | Der Body, wie er eintrifft, ein `Uint8Array` nach dem anderen       |
| `bodyUsed`                 | Ein Body wird einmal gelesen; ein zweites Lesen ist ein `TypeError` |

### Streaming

`chunks` ist Kuitos streamendes Lesen, anstelle der Streams API. `onChunk`
erhält jedes Stück, wie das Netzwerk es liefert, und das Promise wird
aufgelöst, wenn der Body endet, oder bei einem Fehler oder Abbruch abgelehnt.
Es eignet sich für Server-Sent Events, lange Downloads mit Fortschritt oder
alles, was zu groß ist, um es zweimal zu halten.

```tsx
const response = await fetch(url, { signal });
let received = 0;

await response.chunks((chunk) => {
  received += chunk.byteLength;
  progress.value = received / Number(response.headers.get('content-length'));
});
```

Ohne `chunks` puffert die Plattform den Body und übergibt ihn JavaScript
einmal, am Ende, in einer Kopie. Ein `onChunk`, das wirft, bricht die Anfrage
ab, und `chunks` wird mit dem Geworfenen abgelehnt.

### Wie es die Grenze überquert

`__kuitoHostHttp.start(id, { url, method, headers }, body)` übergibt eine
Anfrage an den Client der Plattform (`native/shared/Http.h`); Header
überqueren die Grenze als flaches `[name, value, …]`-Array und der Body als
String oder `ArrayBuffer`, einmal kopiert. Der Client antwortet auf dem
JS-Thread mit `__kuitoHttpHead`, dann `__kuitoHttpEnd` mit dem Body als
`ArrayBuffer`, der JavaScript gehört. `chunks` ruft `stream(id)` auf: der
Client sendet, was er gepuffert hat, dann jedes Stück über
`__kuitoHttpChunk`. `cancel(id)` stoppt es. `fileSystem.download` und
`upload` ([Dateisystem](file-system.md#downloads-and-uploads)) verwenden
denselben Host und bitten ihn, den Body in eine Datei zu schreiben
(`saveTo`), ihn aus einer zu lesen (ein `{ file, prefix, suffix }`-Body) und
`__kuitoHttpProgress` zu melden. Auf iOS ist der Client ein
`URLSession`-Data-Delegate (`KuitoHTTPClient.m`); auf Android OkHttp, das
die `BufferedSource` des Bodys liest (`KuitoHttpClient.kt`).

### Was fetch nicht tut

- **Cookies.** Keine werden auf einer der beiden Plattformen automatisch
  gespeichert oder gesendet, und `credentials` ist keine Option.
  `set-cookie` selbst lesen und das Benötigte in Headern senden.
- **Weiterleitungsrichtlinie.** Weiterleitungen werden immer verfolgt;
  `response.url` sagt, wo es endete. `redirect: 'manual'` ist keine Option.
- **Die Streams API.** `response.body`, `ReadableStream` und gestreamte
  Request-Bodys sind nicht vorhanden; mit `chunks` lesen, einen ganzen Body
  hochladen.
- **`Request`, `new Response(...)`, `FormData`, `Blob`.** Eine URL und ein
  Init-Objekt übergeben; Multipart-Bodys selbst erstellen.
- **Caching, `mode`, `referrer`, `keepalive`, `priority`.** Es gibt keinen
  HTTP-Cache: jede Anfrage geht ins Netzwerk. `Image` führt einen eigenen
  Cache ([Primitive](primitives.md#image)).

## WebSocket

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

`new WebSocket(url, protocols?)` verbindet sich mit einer `ws:`- oder
`wss:`-URL (ein anderes Schema, ein Fragment oder ein wiederholtes Protokoll
ist ein `SyntaxError`), über `URLSessionWebSocketTask` auf iOS und OkHttp auf
Android (`native/shared/Socket.h`). Es hat `readyState` und die vier
Konstanten, `protocol` (das vom Server gewählte), `send(data)` und
`close(code?, reason?)`, die Handler `onopen`, `onmessage`, `onerror` und
`onclose` sowie `addEventListener` für dieselben vier. Listener erhalten ein
Event mit `type` und `target`, dazu `data` bei einer Nachricht, `message` (die
Beschreibung der Plattform) bei einem Fehler und `code`, `reason` und
`wasClean` bei einem Schließen.

- `send` nimmt einen String oder Bytes (`ArrayBuffer`, ein typisiertes Array,
  ein `DataView`); vor dem Öffnen des Sockets ist es ein
  `InvalidStateError`, nach dem Schließen tut es nichts.
- `close` nimmt 1000 oder 3000–4999 (sonst `InvalidAccessError`) und einen
  Grund von höchstens 123 Bytes UTF-8 (`SyntaxError`).
- Eine Verbindung, die fehlschlägt oder abbricht, erhält ein `error`-Event,
  dann ein `close` mit Code 1006 und `wasClean: false`.

Was es nicht tut: `binaryType` ist immer `'arraybuffer'` (es gibt kein
`Blob`; `'blob'` zu setzen ist ein `SyntaxError`); `bufferedAmount` ist immer
0, da Bytes auf dem Weg hinaus nicht gezählt werden; `extensions` ist immer
leer (kein `permessage-deflate`); es werden keine Cookies gesendet. Listener
laufen vor dem `on…`-Handler, in welcher Reihenfolge sie auch hinzugefügt
wurden.

## Headers

`new Headers(init)` nimmt `Headers`, `[name, value]`-Paare oder ein Objekt
und hat `append`, `set`, `get`, `has`, `delete`, `forEach`, `keys`, `values`,
`entries` und Iteration. Namen werden ohne Beachtung der
Groß-/Kleinschreibung verglichen und kommen kleingeschrieben und sortiert
zurück; `get` verbindet die Werte eines wiederholten Namens mit `", "`.
`getSetCookie` ist nicht vorhanden; `get('set-cookie')` verbindet sie.

## AbortController

`new AbortController()` hat ein `signal` und `abort(reason?)`. Das Signal hat
`aborted`, `reason`, `onabort`, `throwIfAborted()` und `abort`-Listener
(`addEventListener('abort', listener, { once })`). Ohne Grund ist der Grund
ein `Error` mit dem Namen `AbortError`; `error.name` prüfen, da Hermes keine
`DOMException` hat. `AbortSignal.abort(reason)` erzeugt eines, das bereits
abgebrochen ist; `AbortSignal.timeout(ms)` eines, das mit einem `Error`
namens `TimeoutError` abbricht. `AbortSignal.any` ist nicht vorhanden.

Tasks und Ressourcen übergeben ihr eigenes Signal ([Async](async.md)); wird
es an `fetch` weitergereicht, bricht das Verlassen des Bildschirms die
Anfrage ab.

## Timer und Microtasks

`setTimeout(callback, delay, ...args)` und `setInterval(callback, delay,
...args)` geben eine Zahl zurück; `clearTimeout(id)` und `clearInterval(id)`
brechen beide Arten ab, da sie sich die IDs teilen. Jeder Durchlauf ist ein
eigener Job auf dem JS-Thread, gefolgt von einem Microtask-Checkpoint. Eine
Verzögerung wird auf 0–2.147.000.000 ms begrenzt; es gibt keine
4-ms-Verschachtelungsgrenze und keine Drosselung über das hinaus, was die
Plattform mit einer App im Hintergrund tut. Ein Intervall wird neu
scharfgeschaltet, bevor sein Callback läuft, sodass eines, das wirft,
weiterläuft und eines, das sich selbst löscht, stoppt.

`queueMicrotask(callback)` führt `callback` nach dem aktuellen Job und vor
dem nächsten Timer oder Event aus. Ein Fehler, den es wirft, erreicht die
LogBox als unbehandelte Ablehnung.

## performance

`performance.now()` sind Millisekunden, mit Nachkommastellen, seit dem Start
der JS-Laufzeit der App, auf der monotonen Uhr der Plattform: sie läuft nie
zurück, wenn der Benutzer die Uhrzeit ändert. `performance.timeOrigin` ist
die Wanduhrzeit dieses Starts. `mark`, `measure` und der Rest von User Timing
sind nicht vorhanden; der Profiler der Devtools deckt sie ab
([Devtools](devtools.md)).

## URL und URLSearchParams

`new URL(url, base?)` parst wie der WHATWG-URL-Standard: Schema, Benutzer und
Passwort, Host (kleingeschrieben), Port (weggelassen, wenn er der Standard
des Schemas ist), Pfad (mit aufgelösten `.` und `..`) sowie Query und
Fragment, jeweils prozentkodiert, wie der Standard es vorschreibt, und eine
relative URL gegen `base` aufgelöst. Jeder Teil ist setzbar; `searchParams`
ist in beide Richtungen live. `URL.canParse` und `URL.parse` antworten, ohne
zu werfen. Eigene Schemata funktionieren (`myapp://route/show/1`,
`mailto:x@y.z`), ebenso `file:`-URLs.

Eine ungültige URL wirft einen `TypeError`, der sagt, was falsch ist, wo der
Standard sie manchmal reparieren würde. Nicht unterstützt:

- **Internationalisierte Domainnamen.** Ein Host außerhalb von ASCII ist ein
  `TypeError`; seine Punycode-Form (`xn--`) übergeben.
- **IPv4-Kurzschreibweise** (`http://0x7f.1`, `http://2130706433`): solche
  Hosts werden wie geschrieben beibehalten. IPv6-Hosts in eckigen Klammern
  werden wie geschrieben beibehalten, kleingeschrieben.
- `URL.createObjectURL` und Blob-URLs.

`URLSearchParams` nimmt einen Query-String (mit oder ohne `?`),
`[name, value]`-Paare, ein Objekt oder ein anderes `URLSearchParams` und hat
`append`, `delete`, `get`, `getAll`, `has`, `set`, `sort`, `forEach`, `keys`,
`values`, `entries`, `size` und Iteration. `toString()` ist
`application/x-www-form-urlencoded`: Leerzeichen als `+`.

## TextEncoder und TextDecoder

`new TextEncoder().encode(text)` ist der Text als UTF-8 in einem
`Uint8Array`, ein einzelnes Surrogat als U+FFFD; `encodeInto(text, bytes)`
schreibt ganze Zeichen, solange sie passen, und sagt, wie viel es `read` und
`written` hat. `new TextDecoder().decode(bytes)` nimmt einen `ArrayBuffer`
oder eine beliebige View; ungültige Bytes werden als U+FFFD dekodiert, und
eine führende BOM wird entfernt, sofern nicht `ignoreBOM`. Die Konvertierung
ist C++ (`native/shared/Utf8.h`), keine Schleife im Interpreter.

Nicht unterstützt: andere Kodierungen als UTF-8 (ein `RangeError`),
`fatal: true` (ein `TypeError`) und `{ stream: true }`.

## crypto

`crypto.getRandomValues(array)` füllt ein ganzzahliges typisiertes Array an
Ort und Stelle mit `arc4random_buf`, dem CSPRNG der Plattform, und gibt es
zurück: höchstens 65.536 Bytes (`QuotaExceededError`), nur ganzzahlige
Arrays (`TypeMismatchError`). `crypto.randomUUID()` ist eine UUID der
Version 4 nach RFC 9562. `crypto.subtle` (Hashing, Signieren,
Verschlüsselung) ist nicht vorhanden.

## structuredClone

`structuredClone(value)` kopiert tief: Primitive, einfache Objekte, Arrays,
`Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, typisierte Arrays und
`DataView` (Views auf einen Buffer teilen sich weiterhin ihre Kopie),
geboxte Primitive und Fehler. Zyklen und geteilte Referenzen bleiben
erhalten. Eine Klasseninstanz wird zu einem einfachen Objekt mit ihren
eigenen aufzählbaren Eigenschaften. Eine Funktion oder ein Symbol wirft
einen `Error` namens `DataCloneError`. Die Option `transfer` ist nicht
vorhanden: Buffer werden immer kopiert.

## Intl

`Intl` ist Hermes' eigenes, gestützt auf die Plattform: Foundation auf iOS,
`java.text` und ICU auf Android. Beide haben `Intl.Collator`,
`Intl.DateTimeFormat`, `Intl.NumberFormat` und `Intl.getCanonicalLocales`,
und `toLocaleString`, `toLocaleDateString`, `localeCompare` und
`toLocaleUpperCase` formatieren damit.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5); // '€1,234.50'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
new Intl.Collator('de').compare('ä', 'z'); // -1
```

Diese funktionieren auf beiden gleich: `NumberFormat`s `style` `decimal`,
`currency` und `percent`, Nachkomma- und signifikante Stellen,
`currencyDisplay` und `resolvedOptions()`; `DateTimeFormat`s `dateStyle`,
`timeStyle`, jede Feldoption, `hour12`, jede IANA-`timeZone`,
`formatToParts()` und `resolvedOptions()`; `Collator`s `sensitivity` und
`numeric`; und `supportedLocalesOf` jedes Konstruktors. Die Locale-Daten der
Plattformen unterscheiden sich in Kleinigkeiten, daher formatierte Strings
nicht plattformübergreifend vergleichen: `currencyDisplay:
'name'` ergibt `2.00 euros` auf iOS und `Euro 2.00` auf Android,
`timeZoneName: 'short'` `GMT` auf iOS und `UTC` auf Android.

Was nicht vorhanden ist. TypeScripts `lib` deklariert weiterhin alles davon,
und eine Deklarationsdatei kann es nicht entfernen (`src/ui/globals.d.ts`),
sodass es die Typprüfung besteht und auf einem Gerät einen `TypeError`
wirft:

- **`PluralRules`, `RelativeTimeFormat`, `ListFormat`, `Segmenter`,
  `DisplayNames`, `Locale`** und **`Intl.supportedValuesOf`**, auf beiden
  Plattformen. Vor der Verwendung `'PluralRules' in Intl` prüfen.
- **`DateTimeFormat`s `formatRange` und `formatRangeToParts`**, auf beiden.
- **BigInt**: `NumberFormat.format(10n)` wirft `Cannot convert BigInt to
  number`; `Number(value)` oder die Ziffern selbst formatieren.
- **Nur auf iOS**: `NumberFormat`s `formatToParts` ist nicht vorhanden;
  `notation: 'compact'` und `signDisplay` werden ignoriert (`1,234`, `1`, wo
  Android `1.2K`, `+1` liefert); und `style: 'unit'` rechnet in die
  Einheiten der Locale um (`{ unit: 'kilometer' }` formatiert 5 als
  `3.107mi` in `en-US`), daher nicht verwenden.

`test/shell-smoke.test.ts` prüft die Teilmenge in der Shell jeder Plattform.
