# API web

Les applications Kuito s'exécutent sur Hermes, qui offre le langage JavaScript
et `Intl` mais aucun des globaux d'un navigateur. Plutôt que de polyfiller les
API web une par une, Kuito livre une seule bibliothèque standard : implémentée
une fois, dans le noyau (`src/runtime`) ou en C++ partagé (`native/shared`),
afin de se comporter de la même façon sur iOS et Android, et typée dans
`src/ui/globals.d.ts`. Cette page en dresse la liste complète, avec ce que
chaque partie ne fait pas. Tout ce qui n'y figure pas n'existe pas.

| Global                                        | Notes                                                          |
| --------------------------------------------- | -------------------------------------------------------------- |
| `fetch`                                       | Sur le client HTTP de la plateforme : URLSession, OkHttp       |
| `WebSocket`                                   | Sur URLSession et OkHttp ; messages texte et `ArrayBuffer`     |
| `Headers`                                     | Insensible à la casse ; itère en minuscules et trié            |
| `AbortController`, `AbortSignal`              | `AbortSignal.abort()`, `AbortSignal.timeout()`                 |
| `setTimeout`, `setInterval` et leurs clear    | Sur la boucle d'exécution du thread JS                         |
| `queueMicrotask`                              | La file de jobs de promesses de Hermes                         |
| `performance.now()`, `performance.timeOrigin` | Une horloge monotone depuis le démarrage du runtime            |
| `URL`, `URLSearchParams`                      | Analyse WHATWG, sans noms de domaine internationalisés         |
| `TextEncoder`, `TextDecoder`                  | UTF-8 uniquement, converti en C++                              |
| `crypto.getRandomValues()`, `randomUUID()`    | Le CSPRNG de la plateforme ; pas de `crypto.subtle`            |
| `structuredClone`                             | Copie profonde avec cycles ; pas de `transfer`                 |
| `Intl`                                        | Celui de Hermes : `Collator`, `DateTimeFormat`, `NumberFormat` |
| `console`                                     | Arrive dans la LogBox et `kuito dev` ([logbox](logbox.md))     |

`demo/web-apis.tsx` exécute chaque entrée sur un appareil (`kuito dev ios --entry web-apis.tsx`
dans `demo/`) et affiche `ok` ou `FAILED` pour chacune.
`test/shell-smoke.test.ts` construit son propre shell sur le simulateur ou
l'émulateur que vous nommez et y vérifie `fetch` d'un PNG en `ArrayBuffer` et
`Intl` ; le workflow `Native mobile shells` l'exécute sur les deux plateformes :

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

`fetch(url, { method, headers, body, signal })` se résout dès que le statut et
les en-têtes de la réponse arrivent, quel que soit le statut ; `ok` indique
s'il était dans 200–299. Elle rejette avec un `TypeError` quand la requête
échoue en chemin (pas de connexion, DNS, TLS), avec le message de la
plateforme, et avec la raison du signal quand elle est annulée.

- **`url`** est une chaîne URL `http` ou `https`, ou une `URL`.
- **`method`** est `GET` (par défaut), `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`
  ou `OPTIONS`, en n'importe quelle casse. Les autres sont un `TypeError`.
- **`headers`** est un `Headers`, des paires `[name, value]` ou un objet. Un nom
  qui n'est pas un token HTTP, ou une valeur contenant CR, LF ou NUL, est un
  `TypeError`.
- **`body`** est une chaîne, envoyée en UTF-8 avec `Content-Type: text/plain;charset=UTF-8`
  sauf si vous en définissez un ; un `ArrayBuffer` ; ou un tableau typé ou un
  `DataView`, envoyé exactement avec ses propres octets ; ou `URLSearchParams`,
  envoyé comme un formulaire (`application/x-www-form-urlencoded;charset=UTF-8`). `GET` et `HEAD`
  n'en prennent pas. Envoyez du JSON avec `JSON.stringify(value)` et un type de
  contenu.

La réponse :

| Membre                     | Est                                                               |
| -------------------------- | ----------------------------------------------------------------- |
| `status`, `ok`             | Le code de statut ; s'il est dans 200–299                         |
| `url`                      | L'URL qui a répondu, après redirections                           |
| `headers`                  | Un `Headers` ; un en-tête répété se lit `"a, b"`                  |
| `arrayBuffer()`, `bytes()` | Le corps en `ArrayBuffer` ou en `Uint8Array`                      |
| `text()`, `json()`         | Le corps décodé en UTF-8 (les octets invalides deviennent U+FFFD) |
| `chunks(onChunk)`          | Le corps au fil de son arrivée, un `Uint8Array` à la fois         |
| `bodyUsed`                 | Un corps se lit une fois ; une seconde lecture est un `TypeError` |

### Streaming

`chunks` est la lecture en flux de Kuito, à la place de l'API Streams.
`onChunk` reçoit chaque morceau au fur et à mesure que le réseau le livre, et
la promesse se résout à la fin du corps, ou rejette en cas d'échec ou
d'annulation. Utilisez-la pour les server-sent events, les longs
téléchargements avec progression, ou tout ce qui est trop gros pour être
conservé en deux exemplaires.

```tsx
const response = await fetch(url, { signal });
let received = 0;

await response.chunks((chunk) => {
  received += chunk.byteLength;
  progress.value = received / Number(response.headers.get('content-length'));
});
```

Sans `chunks`, la plateforme met le corps en tampon et le remet à JavaScript
en une fois, à la fin, en une seule copie. Un `onChunk` qui lève une exception
annule la requête, et `chunks` rejette avec ce qui a été levé.

### Comment ça traverse

`__kuitoHostHttp.start(id, { url, method, headers }, body)` remet une requête
au client de la plateforme (`native/shared/Http.h`) ; les en-têtes traversent
sous forme de tableau plat `[name, value, …]` et le corps sous forme de chaîne
ou d'`ArrayBuffer`, copié une fois. Le client répond sur le thread JS par
`__kuitoHttpHead`, puis `__kuitoHttpEnd` avec le corps dans un `ArrayBuffer`
que JavaScript possède. `chunks` appelle `stream(id)` : le client envoie ce
qu'il a mis en tampon, puis chaque morceau via `__kuitoHttpChunk`.
`cancel(id)` l'arrête. `fileSystem.download` et `upload`
([système de fichiers](file-system.md#downloads-and-uploads)) utilisent le même
hôte, en lui demandant d'écrire le corps dans un fichier (`saveTo`), de le lire
depuis un fichier (un corps `{ file, prefix, suffix }`) et de signaler
`__kuitoHttpProgress`. Sur iOS le client est un délégué de données
`URLSession` (`KuitoHTTPClient.m`) ; sur Android, OkHttp lisant le
`BufferedSource` du corps (`KuitoHttpClient.kt`).

### Ce que fetch ne fait pas

- **Cookies.** Aucun n'est stocké ni envoyé pour vous, sur aucune des deux
  plateformes, et `credentials` n'est pas une option. Lisez `set-cookie`
  vous-même et envoyez ce qu'il vous faut dans les en-têtes.
- **Politique de redirection.** Les redirections sont toujours suivies ;
  `response.url` indique où elles ont abouti. `redirect: 'manual'` n'est pas
  une option.
- **L'API Streams.** `response.body`, `ReadableStream` et les corps de requête
  en flux n'existent pas ; lisez avec `chunks`, envoyez un corps entier.
- **`Request`, `new Response(...)`, `FormData`, `Blob`.** Passez une URL et un
  objet d'initialisation ; construisez les corps multipart vous-même.
- **Cache, `mode`, `referrer`, `keepalive`, `priority`.** Il n'y a pas de cache
  HTTP : chaque requête part sur le réseau. `Image` garde son propre cache
  ([primitives](primitives.md#image)).

## WebSocket

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

`new WebSocket(url, protocols?)` se connecte à une URL `ws:` ou `wss:` (un
autre schéma, un fragment ou un protocole répété est un `SyntaxError`), via
`URLSessionWebSocketTask` sur iOS et OkHttp sur Android
(`native/shared/Socket.h`). Il possède `readyState` et les quatre constantes,
`protocol` (celui que le serveur a choisi), `send(data)` et `close(code?, reason?)`,
les gestionnaires `onopen`, `onmessage`, `onerror` et `onclose`, et
`addEventListener` pour les quatre mêmes. Les écouteurs reçoivent un événement
avec `type` et `target`, plus `data` pour un message, `message` (la description
de la plateforme) pour une erreur, et `code`, `reason` et `wasClean` pour une
fermeture.

- `send` prend une chaîne ou des octets (`ArrayBuffer`, un tableau typé, un
  `DataView`) ; avant l'ouverture du socket c'est un `InvalidStateError`, après
  sa fermeture cela ne fait rien.
- `close` prend 1000 ou 3000–4999 (`InvalidAccessError` sinon) et une raison
  d'au plus 123 octets d'UTF-8 (`SyntaxError`).
- Une connexion qui échoue ou tombe reçoit un événement `error`, puis un
  `close` avec le code 1006 et `wasClean: false`.

Ce qu'il ne fait pas : `binaryType` vaut toujours `'arraybuffer'` (il n'y a pas
de `Blob` ; le définir à `'blob'` est un `SyntaxError`) ; `bufferedAmount` vaut
toujours 0, puisque les octets ne sont pas comptés à leur départ ; `extensions`
est toujours vide (pas de `permessage-deflate`) ; aucun cookie n'est envoyé.
Les écouteurs s'exécutent avant le gestionnaire `on…`, quel que soit l'ordre
dans lequel ils ont été ajoutés.

## Headers

`new Headers(init)` prend un `Headers`, des paires `[name, value]` ou un objet,
et possède `append`, `set`, `get`, `has`, `delete`, `forEach`, `keys`,
`values`, `entries` et l'itération. Les noms se comparent sans tenir compte de
la casse et reviennent en minuscules, triés ; `get` joint les valeurs d'un nom
répété avec `", "`. `getSetCookie` n'existe pas ; `get('set-cookie')` les
joint.

## AbortController

`new AbortController()` possède un `signal` et `abort(reason?)`. Le signal
possède `aborted`, `reason`, `onabort`, `throwIfAborted()` et des écouteurs
`abort` (`addEventListener('abort', listener, { once })`). Sans raison, la
raison est une `Error` nommée `AbortError` ; vérifiez `error.name`, puisque
Hermes n'a pas de `DOMException`. `AbortSignal.abort(reason)` en crée un déjà
annulé ; `AbortSignal.timeout(ms)` un qui s'annule avec une `Error` nommée
`TimeoutError`. `AbortSignal.any` n'existe pas.

Les tâches et les ressources transmettent leur propre signal ([async](async.md)) ;
passez-le à `fetch` et quitter l'écran annule la requête.

## Minuteurs et microtâches

`setTimeout(callback, delay, ...args)` et `setInterval(callback, delay, ...args)`
renvoient un nombre ; `clearTimeout(id)` et `clearInterval(id)` annulent l'un
comme l'autre, puisqu'ils partagent leurs identifiants. Chaque exécution est un
job à part entière sur le thread JS, suivi d'un point de contrôle des
microtâches. Un délai est borné à 0–2 147 000 000 ms ; il n'y a pas de borne de
4 ms pour l'imbrication ni de limitation au-delà de ce que la plateforme impose
à une application en arrière-plan. Un intervalle est réarmé avant l'exécution
de son callback, donc un intervalle qui lève une exception continue de se
répéter, et un qui s'annule lui-même s'arrête.

`queueMicrotask(callback)` exécute `callback` après le job courant et avant le
prochain minuteur ou événement. Une erreur qu'il lève arrive dans la LogBox
comme rejet non géré.

## performance

`performance.now()` est en millisecondes, fractionnaires, depuis le démarrage
du runtime JS de l'application, sur l'horloge monotone de la plateforme : elle
ne recule jamais quand l'utilisateur change l'heure. `performance.timeOrigin`
est l'heure murale de ce démarrage. `mark`, `measure` et le reste de User
Timing n'existent pas ; le profileur des devtools les couvre
([devtools](devtools.md)).

## URL et URLSearchParams

`new URL(url, base?)` analyse comme le standard WHATWG URL : schéma,
utilisateur et mot de passe, hôte (en minuscules), port (omis quand c'est celui
par défaut du schéma), chemin (avec `.` et `..` résolus) et requête et
fragment, chacun encodé en pourcentage comme le dit le standard, et une URL
relative résolue par rapport à `base`. Chaque partie est modifiable ;
`searchParams` est vivant dans les deux sens. `URL.canParse` et `URL.parse`
répondent sans lever d'exception. Les schémas personnalisés fonctionnent
(`myapp://route/show/1`, `mailto:x@y.z`), de même que les URL `file:`.

Une URL invalide lève un `TypeError` qui dit ce qui ne va pas, là où le
standard la réparerait parfois. Non pris en charge :

- **Les noms de domaine internationalisés.** Un hôte hors ASCII est un
  `TypeError` ; passez sa forme punycode (`xn--`).
- **La notation abrégée IPv4** (`http://0x7f.1`, `http://2130706433`) : ces
  hôtes sont conservés tels quels. Les hôtes IPv6 entre crochets sont
  conservés tels quels, en minuscules.
- `URL.createObjectURL` et les URL blob.

`URLSearchParams` prend une chaîne de requête (avec ou sans `?`), des paires
`[name, value]`, un objet ou un autre `URLSearchParams`, et possède `append`,
`delete`, `get`, `getAll`, `has`, `set`, `sort`, `forEach`, `keys`, `values`,
`entries`, `size` et l'itération. `toString()` est en
`application/x-www-form-urlencoded` : les espaces en `+`.

## TextEncoder et TextDecoder

`new TextEncoder().encode(text)` est le texte en UTF-8 dans un `Uint8Array`,
un substitut isolé devenant U+FFFD ; `encodeInto(text, bytes)` écrit des
caractères entiers tant qu'ils tiennent et indique combien il a `read` et
`written`. `new TextDecoder().decode(bytes)` prend un `ArrayBuffer` ou
n'importe quelle vue ; les octets invalides se décodent en U+FFFD, et un BOM
initial est supprimé sauf avec `ignoreBOM`. La conversion est en C++
(`native/shared/Utf8.h`), pas une boucle dans l'interpréteur.

Non pris en charge : les encodages autres qu'UTF-8 (un `RangeError`),
`fatal: true` (un `TypeError`), et `{ stream: true }`.

## crypto

`crypto.getRandomValues(array)` remplit sur place un tableau typé d'entiers
avec `arc4random_buf`, le CSPRNG de la plateforme, et le renvoie : au plus
65 536 octets (`QuotaExceededError`), tableaux d'entiers uniquement
(`TypeMismatchError`). `crypto.randomUUID()` est un UUID version 4 selon la
RFC 9562. `crypto.subtle` (hachage, signature, chiffrement) n'existe pas.

## structuredClone

`structuredClone(value)` copie en profondeur : primitifs, objets simples,
tableaux, `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, tableaux typés et
`DataView` (les vues d'un même tampon partagent toujours leur copie), primitifs
encapsulés et erreurs. Les cycles et les références partagées survivent. Une
instance de classe devient un objet simple avec ses propres propriétés
énumérables. Une fonction ou un symbole lève une `Error` nommée
`DataCloneError`. L'option `transfer` n'existe pas : les tampons sont toujours
copiés.

## Intl

`Intl` est celui de Hermes, adossé à la plateforme : Foundation sur iOS,
`java.text` et ICU sur Android. Les deux ont `Intl.Collator`,
`Intl.DateTimeFormat`, `Intl.NumberFormat` et `Intl.getCanonicalLocales`, et
`toLocaleString`, `toLocaleDateString`, `localeCompare` et `toLocaleUpperCase`
formatent avec eux.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5); // '€1,234.50'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
new Intl.Collator('de').compare('ä', 'z'); // -1
```

Ceci fonctionne de la même façon sur les deux : le `style` `decimal`,
`currency` et `percent` de `NumberFormat`, les chiffres fractionnaires et
significatifs, `currencyDisplay`, et `resolvedOptions()` ; `dateStyle`,
`timeStyle`, chaque option de champ, `hour12`, n'importe quel `timeZone` IANA,
`formatToParts()` et `resolvedOptions()` de `DateTimeFormat` ; `sensitivity` et
`numeric` de `Collator` ; et le `supportedLocalesOf` de chaque constructeur.
Les données de locale des plateformes diffèrent par de petits détails, donc ne
comparez pas les chaînes formatées de l'une à l'autre : `currencyDisplay: 'name'`
donne `2.00 euros` sur iOS et `Euro 2.00` sur Android, `timeZoneName: 'short'`
`GMT` sur iOS et `UTC` sur Android.

Ce qui n'existe pas. Le `lib` de TypeScript déclare toujours tout cela, et un
fichier de déclaration ne peut pas le retirer (`src/ui/globals.d.ts`), donc
cela passe la vérification de types et lève un `TypeError` sur un appareil :

- **`PluralRules`, `RelativeTimeFormat`, `ListFormat`, `Segmenter`,
  `DisplayNames`, `Locale`** et **`Intl.supportedValuesOf`**, sur les deux
  plateformes. Vérifiez `'PluralRules' in Intl` avant d'en utiliser un.
- **`formatRange` et `formatRangeToParts` de `DateTimeFormat`**, sur les deux.
- **BigInt** : `NumberFormat.format(10n)` lève `Cannot convert BigInt to number` ;
  formatez `Number(value)` ou les chiffres vous-même.
- **Sur iOS uniquement** : le `formatToParts` de `NumberFormat` n'existe pas ;
  `notation: 'compact'` et `signDisplay` sont ignorés (`1,234`, `1`, là où
  Android donne `1.2K`, `+1`) ; et `style: 'unit'` convertit vers les unités de
  la locale (`{ unit: 'kilometer' }` formate 5 en `3.107mi` en `en-US`), donc
  ne l'utilisez pas.

`test/shell-smoke.test.ts` vérifie le sous-ensemble dans le shell de chaque
plateforme.
