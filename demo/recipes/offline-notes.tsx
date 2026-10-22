import {
  Button,
  Catch,
  HStack,
  List,
  Loading,
  SafeArea,
  Spinner,
  Text,
  TextField,
  VStack,
  db,
  resource,
  signal,
  task,
  type Schema,
} from 'kuito';

/**
 * Notes written into the app's SQLite database first, so they work offline,
 * then sent to a server: the sync loads under Loading, and when the server
 * can't be reached Catch says so while the notes stay usable.
 * The `notes` table comes from a migration in kuito.config.ts.
 */
export type Note = { id: string; text: string; updatedAt: number; synced: boolean };

// Replace with your server. This one doesn't exist, so on a device the
// recipe shows its offline path.
export const NOTES_API = 'https://notes.example.com/notes';

/** The note in `value`, or what is wrong with it. SQLite keeps `synced` as 0 or 1. */
function readNote(value: unknown): Note | string {
  if (typeof value !== 'object' || value === null) return 'expected a note';

  const [id, text, updatedAt, synced] = ['id', 'text', 'updatedAt', 'synced'].map((key) =>
    Reflect.get(value, key),
  );

  if (typeof id !== 'string') return 'expected an id string';
  if (typeof text !== 'string') return 'expected a text string';
  if (typeof updatedAt !== 'number') return 'expected updatedAt in milliseconds';
  if (![true, false, 0, 1].includes(synced)) return 'expected synced to be a boolean';

  return { id, text, updatedAt, synced: synced === true || synced === 1 };
}

/** A Standard Schema written by hand; Valibot, Zod or ArkType would do as well. */
const note: Schema<Note> = {
  '~standard': {
    version: 1,
    vendor: 'offline-notes',
    validate: (value) => {
      const result = readNote(value);

      return typeof result === 'string' ? { issues: [{ message: result }] } : { value: result };
    },
  },
};

const notes = db.table('notes', note);

/** Sends the notes written offline, then keeps the server's list as the synced notes. */
function Sync() {
  const waiting = db.query(notes, { where: { synced: false } });
  const sync = resource(async ({ signal }) => {
    const sent = waiting.value;
    const response = await fetch(NOTES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sent),
      signal,
    });

    if (!response.ok) throw new Error(`the server answered ${response.status}`);

    const body: unknown = await response.json();
    const server = Array.isArray(body)
      ? body.map((each) => readNote({ ...each, synced: true }))
      : [];
    const kept = server.filter((each): each is Note => typeof each !== 'string');

    // All or nothing: a failure leaves the offline notes as they were.
    await db.transaction(() => {
      void notes.delete({ id: { in: sent.map((each) => each.id) } });
      void notes.delete({ synced: true });
      void notes.insert(kept);
    });

    return kept.length;
  });

  return <Text color="#8e8e93">{`Synced ${sync.data.value ?? 0} notes`}</Text>;
}

export default function OfflineNotes() {
  const newest = db.query(notes, { orderBy: { updatedAt: 'desc' } });
  const waiting = db.count(notes, { synced: false });
  const today = db.count(notes, { updatedAt: { gte: new Date().setHours(0, 0, 0, 0) } });
  const draft = signal('');
  const add = task(async (_, text: string) => {
    await notes.insert({ id: crypto.randomUUID(), text, updatedAt: Date.now(), synced: false });
    draft.value = '';
  });

  return (
    <SafeArea flex={1} backgroundColor="#ffffff">
      <VStack padding={16} gap={8}>
        <Text fontSize={22} fontWeight="bold">
          Notes
        </Text>
        <Catch
          fallback={(error, retry) => (
            <HStack gap={8}>
              <Text flexShrink={1} color="#c4302b">{`Offline: ${String(error)}`}</Text>
              <Button onPress={retry}>Sync again</Button>
            </HStack>
          )}
        >
          <Loading fallback={<Spinner />}>
            <Sync />
          </Loading>
        </Catch>
        <Text color="#8e8e93">{`${today.value} today, ${waiting.value} waiting to sync`}</Text>
        <HStack gap={8}>
          <TextField flex={1} value={draft} placeholder="Write a note" label="New note" />
          <Button disabled={draft.value.trim() === ''} onPress={() => void add.run(draft.value)}>
            Add
          </Button>
        </HStack>
      </VStack>
      <List
        flex={1}
        data={newest}
        empty={<Text padding={16}>No notes yet</Text>}
        renderItem={({ item }) => (
          <HStack padding={16} gap={8}>
            <Text flex={1}>{item.text}</Text>
            <Text color="#8e8e93">{item.synced ? 'synced' : 'on this phone'}</Text>
          </HStack>
        )}
      />
    </SafeArea>
  );
}
