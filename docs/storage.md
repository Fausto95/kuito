# Save local data

Choose storage by how the data is used: persisted signals for preferences,
typed database tables for collections, string storage for explicit key/value
access, and secureStore for secrets.

| Data                                | API           | Example          |
| ----------------------------------- | ------------- | ---------------- |
| A setting the UI follows            | `persisted`   | Selected theme   |
| Records to filter and sort          | `db`          | Offline notes    |
| A string read or written explicitly | `storage`     | Last sync cursor |
| A small secret                      | `secureStore` | Session token    |
| A large document or media file      | `fileSystem`  | Downloaded audio |

## Save a sync cursor

```ts
import { storage } from 'kuito';

await storage.set('sync.cursor', 'page-12');
const cursor = await storage.get('sync.cursor'); // string | null
console.log(cursor ?? 'No previous sync');
await storage.delete('sync.cursor');
```

Values are strings. Serialize structured data explicitly and validate it when
reading. These values are not encrypted secrets. `peek` reads synchronously;
reserve it for small startup reads rather than a large loop on the JS thread.

## Read and write several keys together

```ts
import { storage } from 'kuito';

await storage.setMany([
  ['sync.cursor', 'page-12'],
  ['sync.finishedAt', String(Date.now())],
]);
const entries = await storage.getMany(['sync.cursor', 'sync.finishedAt']);
console.log(entries); // [key, value | null] pairs
const keys = await storage.keys();
console.log(keys);
await storage.deleteMany(['sync.cursor', 'sync.finishedAt']);
```

`setMany` writes its entries in one transaction. Await writes before depending
on them. `clear()` deletes all key/value entries; use a small known key set
when resetting only one feature.

## Persist a preference

```tsx
import { Text, Toggle, VStack, persisted, type Schema } from 'kuito';

const booleanSchema: Schema<boolean> = {
  '~standard': {
    version: 1,
    vendor: 'example',
    validate: (value) =>
      typeof value === 'boolean' ? { value } : { issues: [{ message: 'Expected boolean' }] },
  },
};

export function Preferences() {
  const wifiOnly = persisted(true, { key: 'downloads.wifiOnly', schema: booleanSchema });
  return (
    <VStack gap={12}>
      <Toggle label="Download on Wi-Fi only" checked={wifiOnly} />
      <Text>{wifiOnly.value ? 'Wi-Fi only' : 'Any connection'}</Text>
    </VStack>
  );
}
```

The first read loads stored JSON synchronously. Invalid stored data falls back
to the initial value and reports a warning. Writes update the UI immediately
and batch persistence at the end of the JS task. Calls with the same key share
one signal. Schemas must validate synchronously.

With `secure: true`, reads are asynchronous and the signal initially holds its
fallback. Use an explicit loading sentinel when that distinction matters.

## Tables and migrations

Use [database tables](database.md) for queryable records. Define migrations in
`kuito.config.ts`; keep them ordered and append new migrations instead of
rewriting ones already shipped. A table schema validates data but does not
create its SQL table. See [files](file-system.md) for large payloads and
[secure storage](secure-store.md) for authentication-protected values.
