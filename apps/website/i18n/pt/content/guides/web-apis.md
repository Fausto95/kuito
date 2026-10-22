# Web APIs

As aplicações Kuito correm no Hermes, que tem a linguagem JavaScript e `Intl`, mas nenhum dos globais de um browser. O Kuito inclui uma única biblioteca padrão que se comporta da mesma forma no iOS e no Android: os globais abaixo, mais `Headers` e `console`, que chega ao LogBox e ao `kuito dev`. O que não está aqui listado não existe.

## fetch

`fetch(url, { method, headers, body, signal })` resolve assim que o estado e os cabeçalhos da resposta chegam; `ok` diz se foi 200-299. Rejeita com um `TypeError` quando o pedido falha pelo caminho, e com a razão do sinal quando é abortado. `body` é uma string, um `ArrayBuffer`, um typed array ou `URLSearchParams`; envie JSON como `JSON.stringify(value)` com um content type. A resposta tem `status`, `ok`, `url`, `headers`, `arrayBuffer()`, `text()`, `json()` e `chunks(onChunk)`, a leitura em streaming no lugar da Streams API.

```tsx
const response = await fetch('https://example.com/logo.png', {
  headers: { Authorization: `Bearer ${token}` },
  signal,
});

response.status; // 200
const bytes = await response.arrayBuffer();
```

Não existe: cookies, uma política de redirecionamento (os redirecionamentos são sempre seguidos; `response.url` diz onde acabou), `response.body`, `ReadableStream`, `Request`, `FormData`, `Blob` e uma cache HTTP.

## WebSocket

`new WebSocket(url, protocols?)` liga-se a um URL `ws:` ou `wss:`. Tem `readyState`, `protocol`, `send(data)`, `close(code?, reason?)`, os quatro handlers `on...` e `addEventListener`. Uma ligação que falha ou cai recebe um evento `error`, depois um `close` com o código 1006 e `wasClean: false`. `binaryType` é sempre `'arraybuffer'`, e não são enviados cookies.

```tsx
const socket = new WebSocket('wss://chat.example.com', ['v2']);

socket.onopen = () => socket.send(JSON.stringify({ hello: true }));
socket.onmessage = ({ data }) => console.log(data); // a string, or an ArrayBuffer
socket.onclose = ({ code, reason, wasClean }) => {};
```

## AbortController, temporizadores e performance

`new AbortController()` tem um `signal` e `abort(reason?)`. Sem razão, a razão é um `Error` chamado `AbortError`; verifique `error.name`, já que o Hermes não tem `DOMException`. `AbortSignal.timeout(ms)` cria um que aborta com um `Error` chamado `TimeoutError`. As tarefas e os recursos passam o seu próprio sinal: entregue-o ao `fetch` e sair do ecrã cancela o pedido.

`setTimeout` e `setInterval` devolvem um número; `clearTimeout` e `clearInterval` cancelam qualquer um dos dois. `queueMicrotask(callback)` executa `callback` depois do job atual e antes do próximo temporizador ou evento. `performance.now()` são milissegundos fracionários desde que o runtime JS arrancou, no relógio monotónico da plataforma; o resto do User Timing não existe.

## URL e codificação de texto

`new URL(url, base?)` analisa como o padrão WHATWG URL faz; cada parte pode ser definida e `searchParams` é vivo em ambos os sentidos. Esquemas personalizados e URLs `file:` funcionam. Um URL inválido lança um `TypeError`. Não suportado: nomes de domínio internacionalizados (passe a forma punycode `xn--`), a forma abreviada de IPv4, `URL.createObjectURL` e URLs blob. `URLSearchParams` tem os métodos padrão; `toString()` é `application/x-www-form-urlencoded`.

`TextEncoder` e `TextDecoder` convertem apenas UTF-8; os bytes inválidos descodificam como U+FFFD. Não suportado: outras codificações, `fatal: true` e `{ stream: true }`.

## crypto e structuredClone

`crypto.getRandomValues(array)` preenche um typed array de inteiros no lugar com o CSPRNG da plataforma. `crypto.randomUUID()` é um UUID de versão 4. `crypto.subtle` não existe.

`structuredClone(value)` copia em profundidade, ciclos incluídos: objetos simples, arrays, `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer`, typed arrays e erros. Uma função ou um símbolo lança um `Error` chamado `DataCloneError`. A opção `transfer` não existe.

## Intl

`Intl` é o do próprio Hermes, suportado pela plataforma: `Intl.Collator`, `Intl.DateTimeFormat` e `Intl.NumberFormat`. Os dados de locale das plataformas diferem em pequenos detalhes, por isso não compare strings formatadas entre elas.

```tsx
new Intl.NumberFormat('de-DE').format(1234.5); // '1.234,5'
new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(0)); // 'January 1, 1970'
```

Não existe, embora a `lib` do TypeScript ainda o declare: `PluralRules`, `RelativeTimeFormat`, `ListFormat`, `Segmenter`, `DisplayNames`, `Locale` e a formatação de BigInt. Verifique `'PluralRules' in Intl` antes de usar um. Apenas no iOS, o `formatToParts` de `NumberFormat` não existe, e `notation: 'compact'` e `signDisplay` são ignorados.

## Em profundidade

[Web APIs](../../../../docs/web-apis.md) cobre todas as opções e membros de cada global, `Headers`, o streaming com `chunks`, como os pedidos passam para a plataforma e os smoke tests que verificam cada entrada num dispositivo.
