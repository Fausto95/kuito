# Query a local database

Use db for structured offline records that need filtering, sorting and reactive
counts. Queries return read-only signals that update after table writes.

## Create a table with a migration

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Library',
  ios: { bundleIdentifier: 'com.example.library' },
  android: { applicationId: 'com.example.library' },
  migrations: [
    'CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, album TEXT, plays INTEGER NOT NULL)',
  ],
} satisfies KuitoConfig;
```

## Render a query and update its rows

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

The schema validates each row. This example includes a small Standard Schema
validator so it has no schema-library dependency. Use the equivalent schema
from your chosen library in an app.

## Choose and change records

`query(table, { where, orderBy, limit })` returns the matching rows. Conditions
on different columns are combined. A scalar means equality; comparison objects
support `gt`, `gte`, `lt`, `lte`, `not`, `in` and SQL `like`. `null` matches SQL
NULL. `count(table, where)` returns a reactive count.

`insert`, `update` and `delete` return promises. A write is transactional and
queries refresh after it commits. An empty `where` matches every row; construct
deletion filters deliberately. Use `db.transaction` when several SQL statements
must commit together. Query order is only guaranteed when you specify orderBy.

Append migrations in config as the schema evolves. Keep existing migration
positions stable for installations that already applied them.

See [Save local data](storage.md) for preferences, string storage and secrets.
