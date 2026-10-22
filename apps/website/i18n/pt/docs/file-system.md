# fileSystem

Ficheiros na sandbox da aplicação: ler e escrever texto ou
base64, inspecionar, criar, mover, copiar e eliminar, e transmitir downloads e
uploads de e para o disco com progresso e cancelamento.

```tsx
import { fileSystem } from 'kuito';

const notes = fileSystem.documents + 'notes.txt';

await fileSystem.write(notes, 'hello');
await fileSystem.write(notes, ' world', { append: true });
await fileSystem.read(notes); // 'hello world'
await fileSystem.info(notes); // { exists: true, uri, isDirectory: false, size: 11, modificationTime }
await fileSystem.delete(notes);

const photo = fileSystem.download(url, fileSystem.cache + 'photo.jpg', {
  headers: { Authorization: 'Bearer …' },
  onProgress: ({ bytes, total }) => console.log(bytes, total),
});

const { uri } = await photo; // or photo.cancel()

<Image src={{ uri }} />;
```

## Diretórios e URIs

| Diretório   | iOS               | Android                       | Notas                                             |
| ----------- | ----------------- | ----------------------------- | ------------------------------------------------- |
| `documents` | `Documents/`      | `Context.filesDir`            | mantido até a aplicação o eliminar                |
| `cache`     | `Library/Caches/` | `Context.cacheDir`            | o sistema pode limpá-lo quando o espaço escasseia |
| `bundle`    | o bundle `.app`   | `asset:///`, os assets do APK | só de leitura                                     |

Cada um é um URI `file://` terminado em `/`, pelo que um nome se lhe acrescenta.
Todos os caminhos atravessam como URI, e os URIs que o `fileSystem` devolve são
os que `<Image src>` aceita. Os diretórios são lidos uma vez, de forma síncrona.

No Android o bundle não é um diretório em disco: os URIs `asset:///` funcionam
com `read`, `info`, `list` e como origem de `copy` (copie um
asset para fora para o enviar ou mostrar numa `Image`). O tamanho em `info` de um
asset comprimido é `-1`.

## Funções

| Função                                       | Notas                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read(uri, { encoding, position, length })`  | `encoding` é `'utf8'` (predefinição) ou `'base64'`; `position` e `length` leem um intervalo de bytes, só em base64                                    |
| `write(uri, contents, { encoding, append })` | substitui o ficheiro atomicamente, ou acrescenta-lhe                                                                                                  |
| `info(uri)`                                  | `{ exists: false, uri }` ou `{ exists: true, uri, isDirectory, size, modificationTime }` (segundos); o tamanho de um diretório é o dos seus ficheiros |
| `exists(uri)`                                | `info(uri).exists`                                                                                                                                    |
| `createDirectory(uri, { intermediates })`    | falha se o pai não existir, salvo com `intermediates`, ou se já houver algo nesse sítio                                                               |
| `delete(uri, { idempotent })`                | um ficheiro, ou um diretório com o seu conteúdo; falha se não houver nada nesse sítio, salvo com `idempotent`                                         |
| `move(from, to)`, `copy(from, to)`           | substituem o que estiver em `to`; `copy` aceita também diretórios                                                                                     |
| `list(uri)`                                  | os nomes das entradas, ordenados                                                                                                                      |
| `download(url, to, { headers, onProgress })` | resolve `{ uri, status, headers, mimeType }`                                                                                                          |
| `upload(url, from, options)`                 | resolve `{ status, headers, body }` qualquer que seja o estado                                                                                        |

Tudo exceto os diretórios corre na thread de segundo plano do módulo, por
ordem, pelo que uma escrita seguida de uma leitura vê a escrita. Os erros de
argumentos (uma codificação diferente de utf8 ou base64, um intervalo de bytes
sem base64, um caminho que não é um URI `file://`) são `TypeError`s antes de
algo atravessar. A plataforma rejeita com:

| Código          | Significado                                                          |
| --------------- | -------------------------------------------------------------------- |
| `ERR_SANDBOX`   | O URI está fora da sandbox, ou uma escrita visa o bundle.            |
| `ERR_NOT_FOUND` | Não há nada no URI, ou o diretório pai de uma escrita não existe.    |
| `ERR_ENCODING`  | Uma leitura utf8 de um ficheiro que não é UTF-8; leia-o como base64. |
| `ERR_HTTP`      | Um download respondeu fora de 200–299. Nada é escrito.               |
| `ERR_CANCELED`  | A transferência foi cancelada.                                       |
| `ERR_NETWORK`   | A transferência falhou pelo caminho: sem ligação, um timeout, TLS.   |

## A sandbox

As leituras ficam dentro dos diretórios de documentos, cache e bundle; as
escritas, movimentos e eliminações apenas dentro dos diretórios de documentos e
cache, e nunca os próprios diretórios. `..` é resolvido antes da verificação (no
Android, as ligações simbólicas também), pelo que um URI não consegue sair. Tudo
o resto rejeita com `ERR_SANDBOX` antes de o sistema de ficheiros ser tocado.

## Downloads e uploads

`download` e `upload` devolvem a promise do seu resultado com um método
`cancel()`; cancelar rejeita a transferência com `ERR_CANCELED`. Correm no
mesmo host HTTP que `fetch` ([APIs web](web-apis.md#fetch)): a sandbox do
módulo resolve primeiro o ficheiro (uma chamada síncrona `sandboxed`, que
rejeita com `ERR_SANDBOX` ou `ERR_NOT_FOUND`), e depois os bytes fluem nas
threads de rede da plataforma (a fila do delegate do `URLSession` no iOS, a do
OkHttp no Android) diretamente de e para o disco: nem um corpo nem um ficheiro
passa pelo JavaScript ou pela thread de UI. Por isso os downloads não enviam
cookies nem usam cache HTTP, tal como `fetch` não o faz.

- Um download aterra ao lado do seu destino e só o substitui quando todo o
  corpo chegou, pelo que um download falhado ou cancelado deixa o ficheiro
  antigo. O seu diretório pai tem de existir. Os redirecionamentos são seguidos.
- Um upload envia o ficheiro como corpo inteiro (`uploadType: 'binary'`, a
  predefinição, com `mimeType` como `Content-Type`) ou como um campo de um
  formulário `multipart/form-data` (`uploadType: 'multipart'`, com `fieldName`,
  `mimeType` e `parameters` enviados antes dele). `method` é `POST`, `PUT` ou
  `PATCH`. Os campos do formulário e o cabeçalho da parte do ficheiro são
  construídos em JavaScript; o host envia-os, depois o ficheiro a partir do
  disco, e por fim a fronteira de fecho. No iOS esse corpo é composto primeiro
  num ficheiro temporário, pelo que um upload grande nunca fica em memória.
- `onProgress` recebe `{ bytes, total }`, com `total` a `null` quando o
  servidor não envia um comprimento. Cada transferência ouve apenas o seu
  próprio progresso, no máximo a cada 100 ms mais a contagem final. Sem
  `onProgress` a plataforma não envia nenhum.
- Um reload ou o fecho da aplicação cancela todas as transferências.

## Dados binários e a fronteira JSON

Os argumentos e os resultados de um módulo nativo atravessam a fronteira do host
como strings, números e JSON, nunca como bytes ([módulos nativos](native-modules.md#wire-format)),
pelo que os dados binários atravessam como base64: 4/3 dos bytes, guardados
numa string JavaScript (dois bytes por carácter no Hermes), mais a cópia do lado
nativo. Um ficheiro de 10 MB lido como base64 custa cerca de 27 MB em JavaScript
e outro tanto em trânsito. Mantenha os dados binários grandes fora da fronteira:

- Mova bytes entre a rede e o disco com `download` e `upload`, entre ficheiros
  com `copy` e `move`, e mostre imagens por URI.
- Quando o JavaScript tiver de ver os bytes, leia-os em blocos:
  `read(uri, { encoding: 'base64', position, length })` e
  `write(uri, chunk, { encoding: 'base64', append: true })`. Blocos com um
  múltiplo de 3 bytes codificam sem padding, pelo que o seu base64 se junta.

## Ainda não

- Downloads em segundo plano que continuam com a aplicação suspensa, e retomar
  um download cancelado.
- URIs `content://` dos seletores do Android, e o contentor de grupo de
  aplicações do iOS.
- Hashes (`md5`) em `info`.
