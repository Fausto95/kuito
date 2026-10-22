# Save notes before syncing

Write notes locally before contacting the server so editing works offline. Mark acknowledged versions as synced without overwriting a newer local edit.

## Create the table

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

Migrations run as part of native app setup. Append future migrations rather than editing one already shipped.

## Validate and write notes

```tsx
import { db, type Schema } from 'kuito';

type Note = { id: string; text: string; updatedAt: number; synced: boolean };

const note: Schema<Note> = {
  '~standard': {
    version: 1,
    vendor: 'offline-notes',
    validate: (value) => {
      if (typeof value !== 'object' || value === null)
        return { issues: [{ message: 'expected a note' }] };
      const { id, text, updatedAt, synced } = value as Record<string, unknown>;
      if (
        typeof id !== 'string' ||
        typeof text !== 'string' ||
        typeof updatedAt !== 'number' ||
        !Number.isFinite(updatedAt) ||
        ![true, false, 0, 1].includes(synced as number | boolean)
      ) {
        return { issues: [{ message: 'invalid note fields' }] };
      }
      return { value: { id, text, updatedAt, synced: synced === true || synced === 1 } };
    },
  },
};

const notes = db.table('notes', note);

export async function addNote(text: string) {
  await notes.insert({ id: crypto.randomUUID(), text, updatedAt: Date.now(), synced: false });
}

// Call only after the server acknowledges these exact versions.
export async function markSynced(sent: Note[]) {
  await db.transaction(() => {
    for (const note of sent)
      void notes.update({ id: note.id, updatedAt: note.updatedAt }, { synced: true });
  });
}
```

SQLite stores booleans as 0/1; the schema normalizes them back to booleans and checks every field. `markSynced` matches both ID and version timestamp, so an edit made during an upload remains unsynced.

Read the list with `db.query(notes, { orderBy: { updatedAt: 'desc' } })` and pending count with `db.count(notes, { synced: false })`. Send pending versions through an async task and call `markSynced` after the server acknowledges them. Failed requests leave local notes intact. A real sync service also needs a defined conflict and deletion policy.

See [database](database.md) for queries and synchronous transaction callbacks, and [async actions](async.md) for retries and error UI.
