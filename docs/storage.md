# Storage

State that outlives the process, in the SQLite database both platforms
ship:

- [`persisted`](#persisted): a signal whose value survives restarts.
- [`db`](#database): typed tables, and queries whose rows are a signal that
  follows the table's writes.

Secrets go in [`secureStore`](secure-store.md), or a `persisted` signal
with `secure: true`. Under `persisted` sits a key/value store of strings,
[`storage`](#escape-hatch-keyvalue-functions), for the rare value a signal
doesn't fit.

## persisted

```tsx
import { persisted, type Schema } from 'kuito';

/** A Standard Schema from a type guard. An app passes Valibot's, Zod's or ArkType's instead. */
function schema<T>(test: (value: unknown) => value is T, expected: string): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'app',
      validate: (value) => (test(value) ? { value } : { issues: [{ message: expected }] }),
    },
  };
}

type Theme = 'light' | 'dark' | 'system';

const theme = persisted<Theme>('system', {
  key: 'theme',
  schema: schema(
    (value): value is Theme => value === 'light' || value === 'dark' || value === 'system',
    'expected light, dark or system',
  ),
});

theme.value; // 'dark', if the last run stored it
theme.value = 'light'; // on disk when the JS task ends
```

`persisted(initial, { key, schema })` is a `Signal` like `signal()`'s, read
and written the same way, anywhere: in a component, in a module, in a
background task.

- **The first read is synchronous.** It reads the key on the JS thread
  (`storage.peek`), so the first frame already shows the stored value. With
  nothing stored, the value is `initial`.
- **Writes are batched.** A write changes the value at once; when the JS
  task ends, every key written in it crosses to the module's background
  thread in one transaction (`storage.setMany`).
- **Values are JSON**, stored as text under `key`. A value JSON cannot hold
  (a function, `undefined`) throws at the write.
- **One key is one signal.** Every `persisted` call with a key returns the
  signal the first one made, so every component that names it shares it.
- **The stored value is checked** against `schema` when it is read. A value
  that doesn't match, or isn't JSON, is a LogBox warning, and the signal holds
  `initial` until the next write replaces it. It never throws.

`persisted(initial, { key, schema, secure: true })` keeps the value in the
keychain through [`secureStore`](secure-store.md), for small secrets such as
a token. The keychain answers on a background thread, so the signal holds
`initial` until it does, then the stored value; a write before then wins.
To tell "not read yet" from "nothing stored", start from `undefined`, which
JSON never stores:

```tsx
import { persisted, type Schema } from 'kuito';

const nullableString: Schema<string | null> = {
  '~standard': {
    version: 1,
    vendor: 'app',
    validate: (value) =>
      value === null || typeof value === 'string'
        ? { value }
        : { issues: [{ message: 'expected a string or null' }] },
  },
};

const token = persisted<string | null | undefined>(undefined, {
  key: 'token',
  schema: nullableString,
  secure: true,
});
// undefined: reading; null: signed out; a string: signed in.
```

## Schemas

A `schema` is any [Standard Schema](https://standardschema.dev): Valibot,
Zod and ArkType schemas all are, so an app brings the library it already
uses and Kuito depends on none. Kuito calls its `validate` with the data
it read, and uses the value it outputs, so a schema that transforms (a date
string into a `Date`) transforms stored data too. Stored data is read
synchronously, so a schema that validates asynchronously throws a
`TypeError`.

## Database

```tsx
import { db, List, Text, type Schema } from 'kuito';

/** A Standard Schema from a type guard. An app passes Valibot's, Zod's or ArkType's instead. */
function schema<T>(test: (value: unknown) => value is T, expected: string): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'app',
      validate: (value) => (test(value) ? { value } : { issues: [{ message: expected }] }),
    },
  };
}

type Track = { id: number; title: string; album: string | null; plays: number };

const field = (row: object, key: string, type: string, nullable = false) =>
  typeof Reflect.get(row, key) === type || (nullable && Reflect.get(row, key) === null);

const tracks = db.table(
  'tracks',
  schema(
    (row): row is Track =>
      typeof row === 'object' &&
      row !== null &&
      field(row, 'id', 'number') &&
      field(row, 'title', 'string') &&
      field(row, 'album', 'string', true) &&
      field(row, 'plays', 'number'),
    'expected a track',
  ),
);

function Played() {
  const top = db.query(tracks, { orderBy: { plays: 'desc' }, limit: 20 });

  return <List data={top.value} renderItem={({ item }) => <Text>{item.title}</Text>} />;
}

await tracks.insert({ id: 1, title: 'Intro', album: null, plays: 0 });
await tracks.update({ id: 1 }, { plays: 1 }); // `Played` shows the new order
await tracks.delete({ album: null });
```

`db.table(name, schema)` is a table the [migrations](#migrations) made, and
the schema of its rows. Its writes:

| Function                 | Notes                                                    |
| ------------------------ | -------------------------------------------------------- |
| `insert(row \| rows)`    | each row checked by the schema first; a mismatch rejects |
| `update(where, changes)` | sets `changes`' columns on the rows `where` matches      |
| `delete(where)`          | deletes the rows `where` matches; `{}` matches every row |

Each call is one transaction on the module's background thread: every row
lands, or none does, and its promise rejects with `ERR_STORAGE`. Calls run
in order, so a query after an awaited write reads it. `where` takes the
comparisons a query's does; [`db.transaction`](#transactions) lands writes
to several tables together.

`db.query(table, { where, orderBy, limit })` is a `ReadonlySignal` of the
rows those select, each as its schema outputs it:

- `where` matches rows whose columns pass each of its entries, all of them.
  A value is equality, and `null` matches `NULL`; an object compares:

  | Comparison           | Matches rows whose column                                    |
  | -------------------- | ------------------------------------------------------------ |
  | `{ gt: 18 }`, `gte`  | is greater than 18, or greater or equal                      |
  | `{ lt: 18 }`, `lte`  | is less than 18, or less or equal                            |
  | `{ not: 'a' }`       | isn't `'a'`: `NULL` isn't `'a'`; `{ not: null }` is non-NULL |
  | `{ in: ['a', 'b'] }` | is one of the list; `null` in it matches `NULL`, `[]` none   |
  | `{ like: 'In%' }`    | matches SQLite's `LIKE` pattern                              |

  Comparisons on one column all hold: `{ plays: { gte: 1, lt: 10 } }`.
  `gt`, `gte`, `lt` and `lte` take strings or numbers (strings compare by
  their bytes). In a `like` pattern `%` is any run of characters and `_`
  one, with no escape for a literal `%` or `_`; ASCII letters match either
  case. An object that compares nothing, such as `{ in: undefined }`,
  throws a `TypeError` rather than matching every row.

- `orderBy` sorts by its columns, first to last, each `'asc'` or `'desc'`.
- `limit` keeps the first rows.

```tsx
import { db, type Schema } from 'kuito';

/** A Standard Schema from a type guard. An app passes Valibot's, Zod's or ArkType's instead. */
function schema<T>(test: (value: unknown) => value is T, expected: string): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'app',
      validate: (value) => (test(value) ? { value } : { issues: [{ message: expected }] }),
    },
  };
}

type Track = { id: number; title: string; album: string | null; plays: number };

const field = (row: object, key: string, type: string, nullable = false) =>
  typeof Reflect.get(row, key) === type || (nullable && Reflect.get(row, key) === null);

const tracks = db.table(
  'tracks',
  schema(
    (row): row is Track =>
      typeof row === 'object' &&
      row !== null &&
      field(row, 'id', 'number') &&
      field(row, 'title', 'string') &&
      field(row, 'album', 'string', true) &&
      field(row, 'plays', 'number'),
    'expected a track',
  ),
);

const recent = db.query(tracks, {
  where: { plays: { gt: 0 }, album: { not: null }, title: { like: '%live%' } },
  orderBy: { plays: 'desc' },
  limit: 50,
});
const unplayed = db.count(tracks, { plays: 0 });
```

`db.count(table, where)` is a `ReadonlySignal` of how many rows `where`
matches; `{}`, or no `where`, counts every row.

The first read is synchronous, on the JS thread, so the first frame has the
rows. After each write to the table lands, a query or count that something
reads reads again on the background thread and updates: only what reads it
runs, with no re-plan. One nothing reads costs nothing until it is read
again.

A stored row its schema rejects is a LogBox warning, and left out of the
rows. Names are checked before anything crosses: a table or column is
letters, digits and `_`, and a column must be one of the table's as
`SELECT *` lists them (spelled the same, so not `rowid`), read from the
database once per table, so a typo throws a `TypeError` naming the table's
columns, and nothing an app passes runs as SQL. Every value, in a
write or a `where`, is a bound parameter, never part of the SQL. Values are
strings, numbers, booleans and `null`; SQLite has no boolean type, so a
boolean is stored as `1` or `0` and reads back as a number (a schema can turn
it back). There is no BLOB column: store files with
[`fileSystem`](file-system.md) and their paths here. Each value in an `in`
list is one parameter; SQLite before 3.32, which older Android versions
ship, takes at most 999 parameters in a statement.

### Transactions

```tsx
import { db, type Schema } from 'kuito';

/** A Standard Schema from a type guard. An app passes Valibot's, Zod's or ArkType's instead. */
function schema<T>(test: (value: unknown) => value is T, expected: string): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'app',
      validate: (value) => (test(value) ? { value } : { issues: [{ message: expected }] }),
    },
  };
}

type Track = { id: number; title: string; album: string | null; plays: number };

const field = (row: object, key: string, type: string, nullable = false) =>
  typeof Reflect.get(row, key) === type || (nullable && Reflect.get(row, key) === null);

const tracks = db.table(
  'tracks',
  schema(
    (row): row is Track =>
      typeof row === 'object' &&
      row !== null &&
      field(row, 'id', 'number') &&
      field(row, 'title', 'string') &&
      field(row, 'album', 'string', true) &&
      field(row, 'plays', 'number'),
    'expected a track',
  ),
);
type Album = { id: number; name: string };

const albums = db.table(
  'albums',
  schema(
    (row): row is Album =>
      typeof row === 'object' &&
      row !== null &&
      field(row, 'id', 'number') &&
      field(row, 'name', 'string'),
    'expected an album',
  ),
);

await db.transaction(() => {
  albums.insert({ id: 7, name: 'Live' });
  tracks.update({ album: 'live' }, { album: 'Live' });
  tracks.delete({ plays: 0, album: 'Live' });
});
```

`db.transaction(writes)` runs `writes` and lands every table write it makes,
across tables, in one transaction on the module's background thread: all of
them, or none. Each of those writes returns the transaction's promise, which
rejects with `ERR_STORAGE` when the database refuses one. A write that is
invalid before it crosses (a row the schema rejects, a column the table
lacks), or `writes` throwing, rejects it with that error, and nothing
crosses. A transaction inside another joins it and returns its promise;
when the inner one fails, the outer one does too, even if the outer
function catches.

`writes` is synchronous, and its type says so: a write after an `await`
would land on its own, outside the transaction. A function that returns a
promise rejects the transaction with a `TypeError`, and what it wrote
before its first `await` never crosses. Read what it needs first, with
`db.query`'s `value`, then write. Queries see the writes once the promise
resolves.

### Migrations

The tables come from `migrations` in `kuito.config.ts`, oldest first. Each
is an SQL statement, or a list of statements that apply together:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Tracks',
  ios: { bundleIdentifier: 'com.example.tracks' },
  android: { applicationId: 'com.example.tracks' },
  migrations: [
    'CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, album TEXT, plays INTEGER NOT NULL DEFAULT 0)',
    ['ALTER TABLE tracks ADD COLUMN rating INTEGER', 'CREATE INDEX tracks_plays ON tracks (plays)'],
  ],
} satisfies KuitoConfig;
```

The CLI writes them into each shell's bundle (`kuito-migrations.json`), and
the Storage module applies the ones a device hasn't run, in order, each in a
transaction, when the app first queries or writes a table. A table named
`kuito_migrations` keeps each one that ran. Migrations are append-only:
a migration that already ran and changed, or one removed, fails every query
and write with `ERR_STORAGE` saying which. A new migration takes a rebuild of
the shell, like any change to `kuito.config.ts`. Every environment shares
them, so an environment cannot set its own.

## Escape hatch: key/value functions

Persistent key-value storage for strings: a `Map` that survives restarts,
with `Map`'s verbs, plus a synchronous read for startup. `persisted` is built
on it and is what an app reaches for first: it types, validates and batches
the same writes. Use `storage` directly only where a signal doesn't fit,
such as listing every key or clearing them all.

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

| Function           | Runs on                        | Notes                                       |
| ------------------ | ------------------------------ | ------------------------------------------- |
| `peek(key)`        | the JS thread, synchronously   | `string \| null`                            |
| `get(key)`         | the module's background thread | `Promise<string \| null>`                   |
| `set(key, value)`  | background                     |                                             |
| `delete(key)`      | background                     |                                             |
| `keys()`           | background                     | in no particular order                      |
| `getMany(keys)`    | background                     | `[key, value \| null][]`, in `keys`' order  |
| `setMany(entries)` | background                     | one transaction: every entry lands, or none |
| `deleteMany(keys)` | background                     | one transaction                             |
| `clear()`          | background                     | removes every key `storage` holds           |

Values are strings. Storing anything else is the app's job:
`JSON.stringify` on the way in, `JSON.parse` on the way out. A value that
isn't a string rejects with `ERR_ARGUMENT`; a database failure rejects with
`ERR_STORAGE`.

Asynchronous calls run in order on one background thread, so `set`
followed by `get` reads the new value. `peek` runs on the JS thread
and sees every write whose promise has resolved; a write still in flight may
not be visible to it yet. Await the write before reading synchronously.

## Storage on disk

Both platforms keep one SQLite database, using the system's own SQLite:
the key/value table, `storage (key TEXT PRIMARY KEY, value TEXT)`, beside
the app's tables. Nothing is added to the app:

- iOS: `Application Support/Kuito/storage.sqlite`, through `libsqlite3`.
- Android: `databases/kuito-storage.db`, through `android.database.sqlite`.

SQLite instead of `UserDefaults` or `SharedPreferences`, which load the
whole file into memory and rewrite all of it on every change. Neither is
meant for more than settings. SQLite instead of one file per key, because
`setMany` is atomic and many small keys stay cheap. One database for both,
so a key and a table share the same durability.

**Durability.** The database runs in WAL mode with `synchronous=NORMAL`.
Once a write's promise resolves, the write survives the app being killed or
crashing. A power loss or OS crash may roll back the last few writes, but it
never corrupts the database.

**Size.** No quota beyond free disk space. Values must be under SQLite's 1 GB
limit. On Android, key/value reads use `simpleQueryForString`, not a cursor,
so values over the 2 MB `CursorWindow` limit read back whole; a query's rows
go through a cursor. Every value and row still crosses the host boundary as
JSON, so keep values small (kilobytes, not megabytes) and queries limited.
Store large blobs as files.

**Backup and reinstall.** The database is part of the app's data. iOS
includes it in iCloud and computer backups. Android includes it in Auto Backup
when the app allows backup. Uninstalling the app deletes it on both platforms.
Keep secrets in [`secureStore`](secure-store.md), not here: the file is
protected by the OS's file encryption, not encrypted by Kuito.
