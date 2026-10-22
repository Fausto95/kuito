# Offline notes

Notes written into the app's SQLite database first, so they exist with no network, then sent to a server. When the server cannot be reached, the notes stay on the phone and the screen says the sync failed.

**Use it for**

- A table with a query ordered by time, and counts of today's notes and the ones still waiting.
- A sync that replaces the waiting rows in one transaction, so a failure leaves them as they were.
- `Loading` while the sync runs, and `Catch` with a retry when it throws.

The whole screen is [demo/recipes/offline-notes.tsx](../../../../../demo/recipes/offline-notes.tsx). The `notes` table is a migration in [demo/kuito.config.ts](../../../../../demo/kuito.config.ts).

## Write locally, sync in one transaction

The schema is written by hand. Zod, Valibot or ArkType satisfy the same Standard Schema. SQLite stores `synced` as 0 or 1; the screen's schema accepts both.

```tsx
import { db, type Schema } from 'kuito';

type Note = { id: string; text: string; updatedAt: number; synced: boolean };

const note: Schema<Note> = {
  '~standard': {
    version: 1,
    vendor: 'offline-notes',
    validate: (value) =>
      typeof value === 'object' && value !== null
        ? { value: value as Note }
        : { issues: [{ message: 'expected a note' }] },
  },
};

const notes = db.table('notes', note);

export async function addNote(text: string) {
  await notes.insert({ id: crypto.randomUUID(), text, updatedAt: Date.now(), synced: false });
}

export async function replaceWith(kept: Note[], sentIds: string[]) {
  await db.transaction(() => {
    void notes.delete({ id: { in: sentIds } });
    void notes.delete({ synced: true });
    void notes.insert(kept);
  });
}
```

The screen reads `db.query(notes, { orderBy: { updatedAt: 'desc' } })` into a `List`, and `db.count` for the line under the title. `Sync` is a `resource` around `fetch`, wrapped in `Loading` and `Catch`.

The migration is one string in config:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Notes',
  ios: { bundleIdentifier: 'com.example.notes' },
  android: { applicationId: 'com.example.notes' },
  migrations: [
    'CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT NOT NULL, updatedAt INTEGER NOT NULL, synced INTEGER NOT NULL)',
  ],
} satisfies KuitoConfig;
```

## Related

- [Storage](../../../../../docs/storage.md#database): tables, queries, counts
- [Storage](../../../../../docs/storage.md#transactions): one transaction
- [Storage](../../../../../docs/storage.md#migrations): creating the table
