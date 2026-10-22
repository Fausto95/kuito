import { Text, db, persisted, secureStore, storage, watch, type Schema } from 'kuito';

/** A Standard Schema of its own, as an app would bring one from a validation library. */
function schema<T>(check: (value: unknown) => string | null): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => {
        const issue = check(value);

        return issue === null ? { value: value as T } : { issues: [{ message: issue }] };
      },
    },
  };
}

const text = schema<string>((value) => (typeof value === 'string' ? null : 'expected a string'));

type Track = { id: number; title: string; album: string | null; plays: number };

const track = schema<Track>((value) => {
  const row = value as Partial<Track>;

  return typeof row === 'object' &&
    row !== null &&
    typeof row.id === 'number' &&
    typeof row.title === 'string' &&
    (row.album === null || typeof row.album === 'string') &&
    typeof row.plays === 'number'
    ? null
    : 'expected a track';
});

const tracks = db.table('tracks', track);
const recent = db.query(tracks, { orderBy: { id: 'asc' } });

// The test drives the APIs as an app would, from inside the kernel.
Object.assign(globalThis, {
  db,
  persisted,
  schema,
  secureStore,
  storage,
  text,
  tracks,
  recent,
  watch,
});

export default function App() {
  return <Text>{recent.value.map((row) => row.title).join(',')}</Text>;
}
