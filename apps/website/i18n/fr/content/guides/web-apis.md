# API web

Les apps Kuito tournent sur Hermes, qui a le langage JavaScript et `Intl` mais aucun des globaux d'un navigateur. Kuito livre une bibliothèque standard qui se comporte pareil sur iOS et Android : les globaux ci-dessous, plus `Headers` et `console`, qui atteint la LogBox et `kuito dev`. Tout ce qui n'y figure pas n'existe pas.

## fetch

`fetch(url, { method, headers, body, signal })` se résout une fois le statut et les en-têtes de la réponse arrivés ; `ok` dit s'il était 200-299. Il rejette avec un `TypeError` quand la requête échoue en chemin, et avec la raison du signal quand elle est annulée. `body` est une chaîne, un `ArrayBuffer`, un tableau typé ou `URLSearchParams` ; envoyez du JSON avec `JSON.stringify(value)` et un type de contenu. La réponse a `status`, `ok`, `url`, `headers`, `arrayBuffer()`, `text()`, `json()` et `chunks(onChunk)`, la lecture en flux à la place de l'API Streams.

```tsx
const response = await fetch('https://example.com/logo.png', {
  headers: { Authorization: `Bearer ${token}` },
  signal,
});

response.status; // 200
const bytes = await response.arrayBuffer();
```

N'existent pas : les cookies, une politique de redirection (les redirections sont toujours suivies ; `response.url` dit où elle a fini), `response.body`, `ReadableStream`, `Request`, `FormData`, `Blob` et un cache HTTP.

## WebSocket

`new WebSocket(url, protocols?)` se connecte à une URL `ws:` ou `wss:`. Il a `readyState`, `protocol`, `send(data)`, `close(code?, reason?)`, les quatre gestionnaires `on...` et `addEventListener`. Une connexion qui échoue ou tombe reçoit un événement `error`, puis un `close` avec le code 1006 et `wasClean: false`. `binaryType` est toujours `'arraybuffer'`, et aucun cookie n'est envoyé.

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

## AbortController, minuteurs et performance

`new AbortController()` a un `signal` et `abort(reason?)`. Sans raison, la raison est une `Error` nommée `AbortError` ; vérifiez `error.name`, puisque Hermes n'a pas de `DOMException`. `AbortSignal.timeout(ms)` en fabrique un qui annule avec une `Error` nommée `TimeoutError`. Les tâches et les ressources passent leur propre signal : donnez-le à `fetch` et quitter l'écran annule la requête.

`setTimeout` et `setInterval` renvoient un nombre ; `clearTimeout` et `clearInterval` annulent l'un comme l'autre. `queueMicrotask(callback)` exécute `callback` après le job courant et avant le prochain minuteur ou événement. `performance.now()` est en millisecondes fractionnaires depuis le démarrage du runtime JS, sur l'horloge monotone de la plateforme ; le reste de User Timing n'existe pas.

## URL et encodage de texte

`new URL(url, base?)` analyse comme le fait le standard WHATWG URL ; chaque partie est modifiable et `searchParams` est vivant dans les deux sens. Les schémas personnalisés et les URL `file:` fonctionnent. Une URL invalide lève un `TypeError`. Non pris en charge : les noms de domaine internationalisés (passez la forme punycode `xn--`), la notation abrégée IPv4, `URL.createObjectURL` et les URL blob. `URLSearchParams` a les méthodes standard ; `toString()` est en `application/x-www-form-urlencoded`.

`TextEncoder` et `TextDecoder` convertissent l'UTF-8 seulement ; les octets invalides se décodent en U+FFFD. Non pris en charge : les autres encodages, `fatal: true` et `{ stream: true }`.

## crypto et structuredClone

`crypto.getRandomValues(array)` remplit en place un tableau typé d'entiers avec le CSPRNG de la plateforme. `crypto.randomUUID()` est un UUID de version 4. `crypto.subtle` n'existe pas.

`structuredClone(value)` copie en profondeur, cycles compris : objets simples, tableaux, `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, tableaux typés et erreurs. Une fonction ou un symbole lève une `Error` nommée `DataCloneError`. L'option `transfer` n'existe pas.

## Intl

`Intl` est celui de Hermes, appuyé sur la plateforme : `Intl.Collator`, `Intl.DateTimeFormat` et `Intl.NumberFormat`. Les données de locale des plateformes diffèrent sur de petits points, donc ne comparez pas des chaînes formatées entre elles.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
```

N'existent pas, bien que la `lib` de TypeScript les déclare encore : `PluralRules`, `RelativeTimeFormat`, `ListFormat`, `Segmenter`, `DisplayNames`, `Locale` et le formatage des BigInt. Vérifiez `'PluralRules' in Intl` avant d'en utiliser un. Sur iOS seulement, le `formatToParts` de `NumberFormat` n'existe pas, et `notation: 'compact'` et `signDisplay` sont ignorés.

## En profondeur

[API web](../../../../docs/web-apis.md) couvre chaque option et membre de chaque global, `Headers`, la lecture en flux avec `chunks`, comment les requêtes passent à la plateforme et les tests de fumée qui vérifient chaque entrée sur un appareil.
