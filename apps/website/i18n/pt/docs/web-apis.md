# Web APIs

As aplicações Kuito correm no Hermes, que tem a linguagem JavaScript e `Intl`,
mas nenhum dos globais de um browser. Em vez de fazer polyfill das web APIs
uma a uma, o Kuito inclui uma única biblioteca padrão: implementada uma vez,
no kernel (`src/runtime`) ou em C++ partilhado (`native/shared`), para que se
comporte da mesma forma no iOS e no Android, e tipada em `src/ui/globals.d.ts`.
Esta página enumera tudo o que ela tem, e o que cada parte não faz. O que não
está aqui listado não existe.

| Global                                        | Notas                                                             |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `fetch`                                       | Sobre o cliente HTTP da plataforma: URLSession, OkHttp            |
| `WebSocket`                                   | Sobre URLSession e OkHttp; mensagens de texto e `ArrayBuffer`     |
| `Headers`                                     | Insensível a maiúsculas; itera em minúsculas e por ordem          |
| `AbortController`, `AbortSignal`              | `AbortSignal.abort()`, `AbortSignal.timeout()`                    |
| `setTimeout`, `setInterval` e os seus clears  | No run loop da thread JS                                          |
| `queueMicrotask`                              | A fila de jobs de promessas do Hermes                             |
| `performance.now()`, `performance.timeOrigin` | Um relógio monotónico desde o arranque do runtime                 |
| `URL`, `URLSearchParams`                      | Parsing WHATWG, sem nomes de domínio internacionalizados          |
| `TextEncoder`, `TextDecoder`                  | Só UTF-8, convertido em C++                                       |
| `crypto.getRandomValues()`, `randomUUID()`    | O CSPRNG da plataforma; sem `crypto.subtle`                       |
| `structuredClone`                             | Cópia profunda com ciclos; sem `transfer`                         |
| `Intl`                                        | O do próprio Hermes: `Collator`, `DateTimeFormat`, `NumberFormat` |
| `console`                                     | Chega à LogBox e ao `kuito dev` ([logbox](logbox.md))             |

`demo/web-apis.tsx` executa todas as entradas num dispositivo (`kuito dev ios --entry web-apis.tsx`
em `demo/`) e imprime `ok` ou `FAILED` para cada uma.
`test/shell-smoke.test.ts` constrói uma shell própria no simulador ou
emulador que indicar e verifica aí o `fetch` de um PNG como `ArrayBuffer` e o
`Intl`; o workflow `Native mobile shells` executa-o em ambas as plataformas:

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

`fetch(url, { method, headers, body, signal })` resolve assim que o estado e
os cabeçalhos da resposta chegam, seja qual for o estado; `ok` diz se foi
200–299. Rejeita com um `TypeError` quando o pedido falha pelo caminho (sem
ligação, DNS, TLS), com a mensagem da plataforma, e com a razão do signal
quando abortado.

- **`url`** é uma string de URL `http` ou `https`, ou um `URL`.
- **`method`** é `GET` (predefinição), `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`
  ou `OPTIONS`, em qualquer capitalização. Outros são um `TypeError`.
- **`headers`** é um `Headers`, pares `[name, value]` ou um objeto. Um nome
  que não seja um token HTTP, ou um valor com CR, LF ou NUL, é um `TypeError`.
- **`body`** é uma string, enviada como UTF-8 com `Content-Type: text/plain;charset=UTF-8`
  a menos que defina um; um `ArrayBuffer`; ou um typed array ou `DataView`,
  enviado exatamente com os seus próprios bytes; ou `URLSearchParams`,
  enviado como formulário (`application/x-www-form-urlencoded;charset=UTF-8`). `GET` e `HEAD` não
  aceitam nenhum. Envie JSON como `JSON.stringify(value)` com um content type.

A resposta:

| Membro                     | É                                                                   |
| -------------------------- | ------------------------------------------------------------------- |
| `status`, `ok`             | O código de estado; se está em 200–299                              |
| `url`                      | O URL que respondeu, após os redirecionamentos                      |
| `headers`                  | Um `Headers`; um cabeçalho repetido lê-se como `"a, b"`             |
| `arrayBuffer()`, `bytes()` | O corpo como um `ArrayBuffer` ou um `Uint8Array`                    |
| `text()`, `json()`         | O corpo descodificado como UTF-8 (bytes inválidos tornam-se U+FFFD) |
| `chunks(onChunk)`          | O corpo à medida que chega, um `Uint8Array` de cada vez             |
| `bodyUsed`                 | Um corpo lê-se uma vez; uma segunda leitura é um `TypeError`        |

### Streaming

`chunks` é a leitura em streaming do Kuito, em vez da Streams API. `onChunk`
recebe cada pedaço à medida que a rede o entrega, e a promessa resolve quando
o corpo termina, ou rejeita numa falha ou num abort. Use-a para server-sent
events, descarregamentos longos com progresso, ou qualquer coisa grande de
mais para guardar duas vezes.

```tsx
const response = await fetch(url, { signal });
let received = 0;

await response.chunks((chunk) => {
  received += chunk.byteLength;
  progress.value = received / Number(response.headers.get('content-length'));
});
```

Sem `chunks`, a plataforma guarda o corpo em buffer e entrega-o ao JavaScript
de uma vez, no fim, numa única cópia. Um `onChunk` que lance uma exceção
cancela o pedido, e `chunks` rejeita com o que ele lançou.

### Como atravessa

`__kuitoHostHttp.start(id, { url, method, headers }, body)` entrega um pedido
ao cliente da plataforma (`native/shared/Http.h`); os cabeçalhos atravessam
como um array plano `[name, value, …]` e o corpo como uma string ou um
`ArrayBuffer`, copiado uma vez. O cliente responde na thread JS com
`__kuitoHttpHead`, depois `__kuitoHttpEnd` com o corpo como um `ArrayBuffer`
de que o JavaScript é dono. `chunks` chama `stream(id)`: o cliente envia o
que tinha em buffer, depois cada pedaço através de `__kuitoHttpChunk`.
`cancel(id)` interrompe-o. `fileSystem.download` e `upload`
([sistema de ficheiros](file-system.md#downloads-and-uploads)) usam o mesmo
host, pedindo-lhe que escreva o corpo num ficheiro (`saveTo`), que o leia de
um (um corpo `{ file, prefix, suffix }`) e que reporte `__kuitoHttpProgress`.
No iOS o cliente é um delegate de dados de `URLSession`
(`KuitoHTTPClient.m`); no Android, o OkHttp a ler o `BufferedSource` do
corpo (`KuitoHttpClient.kt`).

### O que o fetch não faz

- **Cookies.** Nenhum é guardado ou enviado por si, em nenhuma das
  plataformas, e `credentials` não é uma opção. Leia `set-cookie` você mesmo
  e envie o que precisar nos cabeçalhos.
- **Política de redirecionamento.** Os redirecionamentos são sempre seguidos;
  `response.url` diz onde terminou. `redirect: 'manual'` não é uma opção.
- **A Streams API.** `response.body`, `ReadableStream` e corpos de pedido em
  streaming não existem; leia com `chunks`, envie um corpo inteiro.
- **`Request`, `new Response(...)`, `FormData`, `Blob`.** Passe um URL e um
  objeto init; construa os corpos multipart você mesmo.
- **Cache, `mode`, `referrer`, `keepalive`, `priority`.** Não há cache HTTP:
  todos os pedidos vão à rede. `Image` mantém a sua própria cache
  ([primitivas](primitives.md#image)).

## WebSocket

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

`new WebSocket(url, protocols?)` liga-se a um URL `ws:` ou `wss:` (outro
esquema, um fragmento ou um protocolo repetido é um `SyntaxError`), através de
`URLSessionWebSocketTask` no iOS e do OkHttp no Android
(`native/shared/Socket.h`). Tem `readyState` e as quatro constantes,
`protocol` (o que o servidor escolheu), `send(data)` e `close(code?,
reason?)`, os handlers `onopen`, `onmessage`, `onerror` e `onclose`, e
`addEventListener` para os mesmos quatro. Os listeners recebem um evento com
`type` e `target`, mais `data` para uma mensagem, `message` (a descrição da
plataforma) para um erro, e `code`, `reason` e `wasClean` para um fecho.

- `send` aceita uma string ou bytes (`ArrayBuffer`, um typed array, um
  `DataView`); antes de o socket abrir é um `InvalidStateError`, depois de
  fechar não faz nada.
- `close` aceita 1000 ou 3000–4999 (`InvalidAccessError` caso contrário) e
  uma razão com no máximo 123 bytes de UTF-8 (`SyntaxError`).
- Uma ligação que falha ou cai recebe um evento `error`, depois um `close`
  com o código 1006 e `wasClean: false`.

O que não faz: `binaryType` é sempre `'arraybuffer'` (não há `Blob`; definir
`'blob'` é um `SyntaxError`); `bufferedAmount` é sempre 0, já que os bytes
não são contados à saída; `extensions` é sempre vazio (sem
`permessage-deflate`); não são enviados cookies. Os listeners correm antes do
handler `on…`, seja qual for a ordem em que foram adicionados.

## Headers

`new Headers(init)` aceita `Headers`, pares `[name, value]` ou um objeto, e
tem `append`, `set`, `get`, `has`, `delete`, `forEach`, `keys`, `values`,
`entries` e iteração. Os nomes comparam-se sem distinguir maiúsculas e vêm
em minúsculas, ordenados; `get` junta os valores de um nome repetido com `", "`.
`getSetCookie` não existe; `get('set-cookie')` junta-os.

## AbortController

`new AbortController()` tem um `signal` e `abort(reason?)`. O signal tem
`aborted`, `reason`, `onabort`, `throwIfAborted()` e listeners de `abort`
(`addEventListener('abort', listener, { once })`). Sem razão, a razão é um
`Error` com o nome `AbortError`; verifique `error.name`, já que o Hermes não
tem `DOMException`. `AbortSignal.abort(reason)` cria um já abortado;
`AbortSignal.timeout(ms)` um que aborta com um `Error` com o nome
`TimeoutError`. `AbortSignal.any` não existe.

As tasks e os resources passam o seu próprio signal ([async](async.md));
entregue-o ao `fetch` e sair do ecrã cancela o pedido.

## Temporizadores e microtasks

`setTimeout(callback, delay, ...args)` e `setInterval(callback, delay,
...args)` devolvem um número; `clearTimeout(id)` e `clearInterval(id)`
cancelam qualquer um dos dois, já que partilham ids. Cada execução é um job
próprio na thread JS, seguido de um checkpoint de microtasks. Um atraso é
limitado a 0–2.147.000.000 ms; não há o limite de 4 ms por aninhamento nem
throttling além do que a plataforma faz a uma aplicação em segundo plano. Um
intervalo é rearmado antes de o seu callback correr, pelo que um que lance
uma exceção continua a repetir-se, e um que se cancele a si próprio deixa de
correr.

`queueMicrotask(callback)` executa `callback` depois do job atual e antes do
próximo temporizador ou evento. Um erro que lance chega à LogBox como uma
rejeição não tratada.

## performance

`performance.now()` são milissegundos, fracionários, desde o arranque do
runtime JS da aplicação, no relógio monotónico da plataforma: nunca recua
quando o utilizador altera a hora. `performance.timeOrigin` é a hora de
relógio desse arranque. `mark`, `measure` e o resto do User Timing não
existem; o profiler das devtools cobre-os ([devtools](devtools.md)).

## URL e URLSearchParams

`new URL(url, base?)` faz o parsing como o padrão WHATWG URL: esquema,
utilizador e palavra-passe, host (em minúsculas), porta (omitida quando é a
predefinida do esquema), caminho (com `.` e `..` resolvidos) e query e
fragmento, cada um percent-encoded como o padrão manda, e um URL relativo
resolvido em relação a `base`. Todas as partes podem ser definidas;
`searchParams` é vivo nos dois sentidos. `URL.canParse` e `URL.parse`
respondem sem lançar exceção. Esquemas personalizados funcionam
(`myapp://route/show/1`, `mailto:x@y.z`), assim como URLs `file:`.

Um URL inválido lança um `TypeError` que diz o que está errado, onde o
padrão por vezes o repararia. Não suportado:

- **Nomes de domínio internacionalizados.** Um host fora do ASCII é um
  `TypeError`; passe a sua forma punycode (`xn--`).
- **Abreviaturas IPv4** (`http://0x7f.1`, `http://2130706433`): esses hosts
  são mantidos como foram escritos. Os hosts IPv6 entre parênteses retos são
  mantidos como foram escritos, em minúsculas.
- `URL.createObjectURL` e URLs blob.

`URLSearchParams` aceita uma query string (com ou sem `?`), pares
`[name, value]`, um objeto ou outro `URLSearchParams`, e tem `append`,
`delete`, `get`, `getAll`, `has`, `set`, `sort`, `forEach`, `keys`, `values`,
`entries`, `size` e iteração. `toString()` é
`application/x-www-form-urlencoded`: espaços como `+`.

## TextEncoder e TextDecoder

`new TextEncoder().encode(text)` é o texto em UTF-8 num `Uint8Array`, um
surrogate isolado como U+FFFD; `encodeInto(text, bytes)` escreve caracteres
inteiros enquanto couberem e diz quanto leu (`read`) e escreveu (`written`).
`new TextDecoder().decode(bytes)` aceita um `ArrayBuffer` ou qualquer view;
os bytes inválidos descodificam como U+FFFD, e um BOM inicial é descartado a
menos que `ignoreBOM`. A conversão é em C++ (`native/shared/Utf8.h`), não um
ciclo no interpretador.

Não suportado: codificações além de UTF-8 (um `RangeError`), `fatal: true`
(um `TypeError`) e `{ stream: true }`.

## crypto

`crypto.getRandomValues(array)` preenche no local um typed array de inteiros
com `arc4random_buf`, o CSPRNG da plataforma, e devolve-o: no máximo 65.536
bytes (`QuotaExceededError`), só arrays de inteiros (`TypeMismatchError`).
`crypto.randomUUID()` é um UUID versão 4 da RFC 9562. `crypto.subtle`
(hashing, assinatura, cifra) não existe.

## structuredClone

`structuredClone(value)` copia em profundidade: primitivos, objetos simples,
arrays, `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, typed arrays e
`DataView` (views de um mesmo buffer continuam a partilhar a sua cópia),
primitivos encaixotados e erros. Ciclos e referências partilhadas sobrevivem.
Uma instância de classe torna-se um objeto simples com as suas próprias
propriedades enumeráveis. Uma função ou um símbolo lança um `Error` com o
nome `DataCloneError`. A opção `transfer` não existe: os buffers são sempre
copiados.

## Intl

`Intl` é o do próprio Hermes, apoiado pela plataforma: Foundation no iOS,
`java.text` e ICU no Android. Ambos têm `Intl.Collator`, `Intl.DateTimeFormat`,
`Intl.NumberFormat` e `Intl.getCanonicalLocales`, e `toLocaleString`,
`toLocaleDateString`, `localeCompare` e `toLocaleUpperCase` formatam com
eles.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5); // '€1,234.50'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
new Intl.Collator('de').compare('ä', 'z'); // -1
```

Estes funcionam da mesma forma em ambos: o `style` `decimal`, `currency` e
`percent` de `NumberFormat`, os dígitos fracionários e significativos,
`currencyDisplay` e `resolvedOptions()`; `dateStyle`, `timeStyle`, cada opção
de campo, `hour12`, qualquer `timeZone` IANA, `formatToParts()` e
`resolvedOptions()` de `DateTimeFormat`; `sensitivity` e `numeric` de
`Collator`; e `supportedLocalesOf` de cada construtor. Os dados de locale das
plataformas diferem em pequenos pormenores, por isso não compare strings
formatadas entre elas: `currencyDisplay: 'name'` dá `2.00 euros` no iOS e
`Euro 2.00` no Android, `timeZoneName: 'short'` `GMT` no iOS e `UTC` no
Android.

O que não existe. O `lib` do TypeScript continua a declarar tudo isto, e um
ficheiro de declarações não o consegue remover (`src/ui/globals.d.ts`), por
isso passa na verificação de tipos e lança um `TypeError` num dispositivo:

- **`PluralRules`, `RelativeTimeFormat`, `ListFormat`, `Segmenter`,
  `DisplayNames`, `Locale`** e **`Intl.supportedValuesOf`**, em qualquer das
  plataformas. Verifique `'PluralRules' in Intl` antes de usar um.
- **`formatRange` e `formatRangeToParts` de `DateTimeFormat`**, em qualquer
  das duas.
- **BigInt**: `NumberFormat.format(10n)` lança `Cannot convert BigInt to
  number`; formate `Number(value)` ou os dígitos você mesmo.
- **Só no iOS**: o `formatToParts` de `NumberFormat` não existe; `notation:
  'compact'` e `signDisplay` são ignorados (`1,234`, `1`, onde o Android dá
  `1.2K`, `+1`); e `style: 'unit'` converte para as unidades do locale
  (`{ unit: 'kilometer' }` formata 5 como `3.107mi` em `en-US`), por isso não
  o use.

`test/shell-smoke.test.ts` verifica o subconjunto na shell de cada plataforma.
