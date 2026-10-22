# storage

Estado que sobrevive ao processo, na base de dados SQLite que ambas as
plataformas incluem. Três camadas, cada uma construída sobre a de baixo:

- [`persisted`](#persisted): um sinal cujo valor sobrevive a reinícios.
- [`db`](#database): tabelas tipadas, e consultas cujas linhas são um sinal
  que acompanha as escritas na tabela.
- [`storage`](#keyvalue-functions): um `Map` de strings que sobrevive a
  reinícios, onde `persisted` guarda.

Os segredos vão para [`secureStore`](secure-store.md), ou para um sinal
`persisted` com `secure: true`.

## persisted

```tsx
import { persisted } from 'kuito';
import * as v from 'valibot';

const theme = persisted<'light' | 'dark' | 'system'>('system', {
  key: 'theme',
  schema: v.picklist(['light', 'dark', 'system']),
});

theme.value; // 'dark', if the last run stored it
theme.value = 'light'; // on disk when the JS task ends
```

`persisted(initial, { key, schema })` é um `Signal` como o de `signal()`,
lido e escrito da mesma forma, em qualquer lado: num componente, num módulo,
numa tarefa em segundo plano.

- **A primeira leitura é síncrona.** Lê a chave na thread de JS
  (`storage.peek`), pelo que o primeiro frame já mostra o valor guardado. Sem
  nada guardado, o valor é `initial`.
- **As escritas são agrupadas.** Uma escrita muda o valor de imediato; quando
  a tarefa de JS termina, todas as chaves escritas nela atravessam para a
  thread em segundo plano do módulo numa única transação (`storage.setMany`).
- **Os valores são JSON**, guardados como texto sob `key`. Um valor que o
  JSON não consegue representar (uma função, `undefined`) lança uma exceção
  na escrita.
- **Uma chave é um sinal.** Cada chamada a `persisted` com uma chave devolve
  o sinal que a primeira criou, pelo que todos os componentes que a nomeiam o
  partilham.
- **O valor guardado é verificado** contra `schema` quando é lido. Um valor
  que não corresponde, ou que não é JSON, é um aviso no LogBox, e o sinal
  mantém `initial` até a escrita seguinte o substituir. Nunca lança uma
  exceção.

`persisted(initial, { key, schema, secure: true })` guarda o valor na
keychain através de [`secureStore`](secure-store.md), para pequenos segredos
como um token. A keychain responde numa thread em segundo plano, pelo que o
sinal mantém `initial` até ela responder, e depois o valor guardado; uma
escrita antes disso prevalece. Para distinguir "ainda não lido" de "nada
guardado", comece de `undefined`, que o JSON nunca guarda:

```tsx
const token = persisted<string | null | undefined>(undefined, {
  key: 'token',
  schema: v.nullable(v.string()),
  secure: true,
});
// undefined: reading; null: signed out; a string: signed in.
```

## Schemas

Um `schema` é qualquer [Standard Schema](https://standardschema.dev): os
schemas Valibot, Zod e ArkType são-no todos, pelo que uma app traz a
biblioteca que já usa e o Kuito não depende de nenhuma. O Kuito chama o seu
`validate` com os dados que leu, e usa o valor que ele produz, pelo que um
schema que transforma (uma string de data num `Date`) transforma também os
dados guardados. Os dados guardados são lidos de forma síncrona, pelo que um
schema que valida de forma assíncrona lança um `TypeError`.

## Base de dados

```tsx
import { db, List, Text } from 'kuito';
import * as v from 'valibot';

const tracks = db.table(
  'tracks',
  v.object({ id: v.number(), title: v.string(), album: v.nullable(v.string()), plays: v.number() }),
);

function Played() {
  const top = db.query(tracks, { orderBy: { plays: 'desc' }, limit: 20 });

  return <List data={top.value} renderItem={({ item }) => <Text>{item.title}</Text>} />;
}

await tracks.insert({ id: 1, title: 'Intro', album: null, plays: 0 });
await tracks.update({ id: 1 }, { plays: 1 }); // `Played` shows the new order
await tracks.delete({ album: null });
```

`db.table(name, schema)` é uma tabela que as [migrações](#migrations)
criaram, e o schema das suas linhas. As suas escritas:

| Função                   | Notas                                                                  |
| ------------------------ | ---------------------------------------------------------------------- |
| `insert(row \| rows)`    | cada linha é verificada primeiro pelo schema; uma discrepância rejeita |
| `update(where, changes)` | define as colunas de `changes` nas linhas a que `where` corresponde    |
| `delete(where)`          | apaga as linhas a que `where` corresponde; `{}` corresponde a todas    |

Cada chamada é uma transação na thread em segundo plano do módulo: todas as
linhas ficam gravadas, ou nenhuma, e a sua promessa rejeita com
`ERR_STORAGE`. As chamadas correm por ordem, pelo que uma consulta depois de
uma escrita aguardada lê-a.

`db.query(table, { where, orderBy, limit })` é um `ReadonlySignal` das linhas
que estes selecionam, cada uma como o seu schema a produz:

- `where` corresponde às linhas cujas colunas são iguais aos seus valores,
  todas elas; `null` corresponde a `NULL`.
- `orderBy` ordena pelas suas colunas, da primeira à última, cada uma `'asc'`
  ou `'desc'`.
- `limit` mantém as primeiras linhas.

A primeira leitura é síncrona, na thread de JS, pelo que o primeiro frame tem
as linhas. Depois de cada escrita na tabela ficar gravada, uma consulta que
algo lê volta a ler na thread em segundo plano e atualiza-se: só corre o que
a lê, sem novo planeamento. Uma consulta que nada lê não custa nada até
voltar a ser lida.

Uma linha guardada que o seu schema rejeita é um aviso no LogBox, e fica de
fora das linhas. Os nomes são verificados antes de algo atravessar a
fronteira: uma tabela ou coluna é composta por letras, dígitos e `_`, pelo
que nada do que uma app passa corre como SQL. Os valores são strings,
números, booleanos e `null`; o SQLite não tem tipo booleano, pelo que um
booleano é guardado como `1` ou `0` e lê-se de volta como número (um schema
pode convertê-lo de novo). Não há coluna BLOB: guarde os ficheiros com
[`fileSystem`](file-system.md) e os seus caminhos aqui.

### Migrações

As tabelas vêm de `migrations` em `kuito.config.ts`, da mais antiga à mais
recente. Cada uma é uma instrução SQL, ou uma lista de instruções que se
aplicam em conjunto:

```ts
export default {
  // …
  migrations: [
    'CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, album TEXT, plays INTEGER NOT NULL DEFAULT 0)',
    ['ALTER TABLE tracks ADD COLUMN rating INTEGER', 'CREATE INDEX tracks_plays ON tracks (plays)'],
  ],
} satisfies KuitoConfig;
```

A CLI escreve-as no bundle de cada shell (`kuito-migrations.json`), e o
módulo Storage aplica as que um dispositivo ainda não correu, por ordem, cada
uma numa transação, quando a app consulta ou escreve pela primeira vez numa
tabela. Uma tabela chamada `kuito_migrations` regista cada uma que correu.
As migrações são apenas acrescentadas: uma migração que já correu e mudou, ou
uma que foi removida, faz falhar todas as consultas e escritas com
`ERR_STORAGE` a dizer qual. Uma migração nova exige reconstruir a shell, como
qualquer alteração a `kuito.config.ts`. Todos os ambientes as partilham, pelo
que um ambiente não pode definir as suas.

## Funções chave/valor

Armazenamento persistente de chave-valor para strings: um `Map` que sobrevive
a reinícios, com os verbos de `Map`, mais uma leitura síncrona para o
arranque. `persisted` é construído sobre ele.

```tsx
import { storage } from 'kuito';

// Synchronous: runs on the JS thread, so the first render can use it.
const theme = storage.peek('theme') ?? 'system';

await storage.set('theme', 'dark');
await storage.get('theme'); // 'dark'
await storage.setMany([
  ['user', JSON.stringify({ id: 42 })],
  ['seenOnboarding', 'true'],
]);
await storage.getMany(['user', 'missing']); // [['user', '{"id":42}'], ['missing', null]]
await storage.keys();
await storage.deleteMany(['user']);
await storage.delete('theme');
await storage.clear();
```

| Função             | Corre em                             | Notas                                                       |
| ------------------ | ------------------------------------ | ----------------------------------------------------------- |
| `peek(key)`        | na thread de JS, de forma síncrona   | `string \| null`                                            |
| `get(key)`         | na thread em segundo plano do módulo | `Promise<string \| null>`                                   |
| `set(key, value)`  | segundo plano                        |                                                             |
| `delete(key)`      | segundo plano                        |                                                             |
| `keys()`           | segundo plano                        | sem ordem definida                                          |
| `getMany(keys)`    | segundo plano                        | `[key, value \| null][]`, pela ordem de `keys`              |
| `setMany(entries)` | segundo plano                        | uma transação: todas as entradas ficam gravadas, ou nenhuma |
| `deleteMany(keys)` | segundo plano                        | uma transação                                               |
| `clear()`          | segundo plano                        | remove todas as chaves que `storage` guarda                 |

Os valores são strings. Guardar qualquer outra coisa é tarefa da app:
`JSON.stringify` à entrada, `JSON.parse` à saída. Um valor que não é uma
string rejeita com `ERR_ARGUMENT`; uma falha da base de dados rejeita com
`ERR_STORAGE`.

As chamadas assíncronas correm por ordem numa única thread em segundo plano,
pelo que `set` seguido de `get` lê o novo valor. `peek` corre na thread de JS
e vê todas as escritas cuja promessa já resolveu; uma escrita ainda em curso
pode ainda não lhe ser visível. Aguarde a escrita antes de ler de forma
síncrona.

## Armazenamento em disco

Ambas as plataformas mantêm uma única base de dados SQLite, usando o SQLite
do próprio sistema: a tabela chave/valor, `storage (key TEXT PRIMARY KEY, value TEXT)`,
ao lado das tabelas da app. Nada é acrescentado à app:

- iOS: `Application Support/Kuito/storage.sqlite`, através de `libsqlite3`.
- Android: `databases/kuito-storage.db`, através de `android.database.sqlite`.

SQLite em vez de `UserDefaults` ou `SharedPreferences`, que carregam o
ficheiro inteiro para memória e o reescrevem todo a cada alteração. Nenhum
deles se destina a mais do que definições. SQLite em vez de um ficheiro por
chave, porque `setMany` é atómico e muitas chaves pequenas continuam baratas.
Uma base de dados para ambos, para que uma chave e uma tabela partilhem a
mesma durabilidade.

**Durabilidade.** A base de dados corre em modo WAL com `synchronous=NORMAL`.
Assim que a promessa de uma escrita resolve, a escrita sobrevive se a app for
terminada ou falhar. Uma falha de energia ou do SO pode reverter as últimas
escritas, mas nunca corrompe a base de dados.

**Tamanho.** Sem quota além do espaço livre em disco. Os valores têm de ficar
abaixo do limite de 1 GB do SQLite. No Android, as leituras chave/valor usam
`simpleQueryForString`, não um cursor, pelo que valores acima do limite de
2 MB do `CursorWindow` são lidos de volta inteiros; as linhas de uma consulta
passam por um cursor. Cada valor e linha atravessa ainda assim a fronteira do
host como JSON, por isso mantenha os valores pequenos (kilobytes, não
megabytes) e as consultas limitadas. Guarde blobs grandes como ficheiros.

**Cópia de segurança e reinstalação.** A base de dados faz parte dos dados da
app. O iOS inclui-a nas cópias de segurança do iCloud e do computador. O
Android inclui-a no Auto Backup quando a app permite cópias de segurança.
Desinstalar a app apaga-a em ambas as plataformas. Guarde os segredos em
[`secureStore`](secure-store.md), não aqui: o ficheiro é protegido pela
encriptação de ficheiros do SO, não encriptado pelo Kuito.
