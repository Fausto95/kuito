// The offline notes recipe on the headless host, over a real SQLite database
// (Node's node:sqlite) standing in for the platform's.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { assert, press, render, screen, test, type, within, type FetchRequest } from 'kuito/tests';
import OfflineNotes, { NOTES_API } from './offline-notes';

// The migration kuito.config.ts runs on a device.
const sqlite = new DatabaseSync(':memory:');

sqlite.exec(
  'CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT NOT NULL, updatedAt INTEGER NOT NULL, synced INTEGER NOT NULL)',
);

type Statement = { sql: string; params: SQLInputValue[] };

function select(sql: string, params: SQLInputValue[]) {
  const statement = sqlite.prepare(sql);

  statement.setReturnArrays(true);

  return { columns: statement.columns().map(({ name }) => name), rows: statement.all(...params) };
}

const Storage = {
  select,
  selectAsync: select,
  write(statements: Statement[]) {
    sqlite.exec('BEGIN');

    try {
      statements.forEach(({ sql, params }) => sqlite.prepare(sql).run(...params));
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw Object.assign(new Error(String(error)), { code: 'ERR_STORAGE' });
    }
  },
};

let online = false;

/** The server: down while `online` is false, else it keeps what it is sent beside a note of its own. */
const kept = [{ id: 'server-1', text: 'Written on the web', updatedAt: 1 }];

function notesServer({ url, body }: FetchRequest) {
  if (!online) return { status: 503 };

  assert.equal(url, NOTES_API);
  kept.push(...(JSON.parse(body ?? '[]') as typeof kept));

  return { body: JSON.stringify(kept) };
}

const options = { modules: { Storage }, fetch: notesServer };
const row = (text: string) => screen.getByText(text).parent ?? screen.getByText(text);

test('a note written offline is kept on the phone, and the screen says the sync failed', async () => {
  online = false;
  await render(<OfflineNotes />, options);

  assert.ok(screen.getByText('Offline: Error: the server answered 503'));
  assert.ok(screen.getByText('No notes yet'));

  await type(screen.getByRole('textbox', { name: 'New note' }), 'Buy milk');
  await press(screen.getByText('Add'));

  assert.ok(within(row('Buy milk')).getByText('on this phone'));
  assert.ok(screen.getByText('1 today, 1 waiting to sync'));
});

test('Sync again sends the waiting notes and keeps the server’s list', async () => {
  online = false;
  await render(<OfflineNotes />, options);
  await type(screen.getByRole('textbox', { name: 'New note' }), 'Call the plumber');
  await press(screen.getByText('Add'));

  online = true;
  await press(screen.getByText('Sync again'));

  assert.ok(screen.getByText(`Synced ${kept.length} notes`));
  assert.ok(screen.getByText(/, 0 waiting to sync$/));

  ['Call the plumber', 'Written on the web'].forEach((text) =>
    assert.ok(within(row(text)).getByText('synced')),
  );

  assert.equal(screen.queryByText(/Offline/), null);
});
