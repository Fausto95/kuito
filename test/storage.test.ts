import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// storage, persisted, db and secureStore as an app calls them, against a fake
// platform that answers like the iOS and Android modules: an in-memory table
// and a SQLite database for Storage, one table per service for secureStore.

type Entry = [string, string | null];

type Signal<T> = { value: T };

type Track = { id: number; title: string; album: string | null; plays: number };

/** A column's value, or comparisons such as `{ gt: 1 }`. */
type Where = { [K in keyof Track]?: Track[K] | Record<string, unknown> };

interface Table {
  readonly name: string;
  insert(rows: Track | Track[]): Promise<void>;
  update(where: Where, changes: Partial<Track>): Promise<void>;
  delete(where: Where): Promise<void>;
}

type QueryOptions = {
  where?: Where;
  orderBy?: { [K in keyof Track]?: 'asc' | 'desc' };
  limit?: number;
};

interface Apis {
  storage: {
    peek(key: string): string | null;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
    getMany(keys: string[]): Promise<Entry[]>;
    setMany(entries: [string, string][]): Promise<void>;
    deleteMany(keys: string[]): Promise<void>;
    clear(): Promise<void>;
  };
  secureStore: {
    get(key: string, options?: object): Promise<string | null>;
    set(key: string, value: unknown, options?: object): Promise<void>;
    delete(key: string, options?: object): Promise<void>;
  };
  persisted<T>(initial: T, options: { key: string; schema: unknown; secure?: boolean }): Signal<T>;
  db: {
    table(name: string, schema: unknown): Table;
    query(table: Table, options?: QueryOptions): { readonly value: Track[] };
    count(table: Table, where?: Where): { readonly value: number };
    transaction(write: () => unknown): Promise<void>;
  };
  /** A Standard Schema from a check returning the issue, or null. */
  schema(check: (value: unknown) => string | null): unknown;
  watch<T>(
    source: { readonly value: T },
    fn: (next: T) => void,
    options?: { immediate?: boolean },
  ): unknown;
  /** The fixture's schema for strings. */
  text: unknown;
  tracks: Table;
  /** Every track by id: what the fixture's App renders. */
  recent: { readonly value: Track[] };
}

/** The app's SQLite database as the shells keep it, with the fixture's migration applied. */
function database() {
  const sqlite = new DatabaseSync(':memory:');

  sqlite.exec(
    'CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, album TEXT, plays INTEGER NOT NULL DEFAULT 0)',
  );

  return sqlite;
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-storage-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/storage-app.tsx');

function storage(table = new Map<string, string>(), sqlite = database()): FakeModule {
  const text = (value: unknown) => {
    if (typeof value !== 'string') throw { code: 'ERR_ARGUMENT', message: 'expected a string' };

    return value;
  };
  const select = (sql: unknown, params: unknown) => {
    const statement = sqlite.prepare(text(sql));

    statement.setReturnArrays(true);

    return {
      columns: statement.columns().map(({ name }) => name),
      rows: statement.all(...(params as SQLInputValue[])),
    };
  };

  return {
    functions: {
      getString: { thread: 'js', run: (key) => table.get(text(key)) ?? null },
      getItem: { thread: 'background', run: (key) => table.get(text(key)) ?? null },
      setItem: {
        thread: 'background',
        run(key, value) {
          table.set(text(key), text(value));
        },
      },
      removeItem: {
        thread: 'background',
        run(key) {
          table.delete(text(key));
        },
      },
      getAllKeys: { thread: 'background', run: () => [...table.keys()] },
      multiGet: {
        thread: 'background',
        run: (keys) => (keys as string[]).map((key) => table.get(key) ?? null),
      },
      multiSet: {
        thread: 'background',
        run(entries) {
          for (const [key, value] of entries as [string, string][]) table.set(key, value);
        },
      },
      multiRemove: {
        thread: 'background',
        run(keys) {
          for (const key of keys as string[]) table.delete(key);
        },
      },
      clear: {
        thread: 'background',
        run() {
          table.clear();
        },
      },
      select: { thread: 'js', run: select },
      selectAsync: { thread: 'background', run: select },
      write: {
        thread: 'background',
        run(statements) {
          sqlite.exec('BEGIN');

          try {
            for (const { sql, params } of statements as { sql: string; params: SQLInputValue[] }[])
              sqlite.prepare(sql).run(...params);

            sqlite.exec('COMMIT');
          } catch (error) {
            sqlite.exec('ROLLBACK');
            throw { code: 'ERR_STORAGE', message: (error as Error).message };
          }
        },
      },
    },
  };
}

type Request = { key: string; value?: string; service: string };

function secureStore(items = new Map<string, string>()): FakeModule {
  const id = ({ service, key }: Request) => `${service}/${key}`;

  return {
    functions: {
      getItem: {
        thread: 'background',
        run: (request) => items.get(id(request as Request)) ?? null,
      },
      setItem: {
        thread: 'background',
        run(request) {
          items.set(id(request as Request), String((request as Request).value));
        },
      },
      deleteItem: {
        thread: 'background',
        run(request) {
          items.delete(id(request as Request));
        },
      },
    },
  };
}

async function apis(modules: Record<string, FakeModule> = {}) {
  const native = fakeModules({ Storage: storage(), SecureStore: secureStore(), ...modules });
  const warnings: string[] = [];
  /** The text the fixture's App shows, as the host last received it. */
  const shown: unknown[] = [];
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp(_id: string, name: string, value: unknown) {
        if (name === 'text') shown.push(value);
      },
      removeView() {},
      __kuitoHostLog(level: string, message: string) {
        if (level === 'warn') warnings.push(message);
      },
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);
  // What the tests call, apart from the App's first render.
  native.calls.length = 0;

  /** Settles the queued native calls, then lets the promises run. */
  const flush = async () => {
    native.flush();
    await new Promise<void>((done) => setTimeout(done, 0));
  };

  /** Settles native calls until none is left: a settled call may queue the next. */
  const settle = async () => {
    await new Promise<void>((done) => setTimeout(done, 0));

    for (let round = 0; native.waiting; round++) {
      if (round === 10) throw new Error('native calls kept queueing more');

      await flush();
    }
  };

  const scope: Apis = kernel as never;

  /** Starts `call`, settles what it queued, and returns its result. */
  async function run<T>(call: () => Promise<T>): Promise<T> {
    const [result] = await Promise.all([call(), flush()]);

    return result;
  }

  return {
    ...native,
    ...scope,
    kernel: kernel.__kuito,
    warnings,
    shown,
    run,
    settle,
  };
}

test('storage writes, reads back and removes strings', async () => {
  const app = await apis();

  await app.run(() => app.storage.set('theme', 'dark'));
  assert.equal(await app.run(() => app.storage.get('theme')), 'dark');
  assert.equal(await app.run(() => app.storage.get('missing')), null);

  await app.run(() => app.storage.delete('theme'));
  assert.equal(await app.run(() => app.storage.get('theme')), null);
});

test('storage.peek reads synchronously, without a promise', async () => {
  const app = await apis({ Storage: storage(new Map([['session', '{"user":42}']])) });

  assert.equal(app.storage.peek('session'), '{"user":42}');
  assert.equal(app.storage.peek('missing'), null);

  assert.deepEqual(data(app.calls), [
    { module: 'Storage', method: 'getString', args: ['session'] },
    { module: 'Storage', method: 'getString', args: ['missing'] },
  ]);
});

test('storage reads and writes many entries in one call', async () => {
  const app = await apis();

  await app.run(() =>
    app.storage.setMany([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]),
  );

  assert.deepEqual(data(await app.run(() => app.storage.getMany(['a', 'c', 'z']))), [
    ['a', '1'],
    ['c', '3'],
    ['z', null],
  ]);

  await app.run(() => app.storage.deleteMany(['a', 'b']));
  assert.deepEqual(data(await app.run(() => app.storage.keys())), ['c']);

  await app.run(() => app.storage.clear());
  assert.deepEqual(data(await app.run(() => app.storage.keys())), []);

  assert.equal(
    app.calls.filter((call) => call.method === 'multiSet').length,
    1,
    'multiSet crosses once',
  );
});

test('a value that is not a string rejects before it crosses', async () => {
  const app = await apis();

  await assert.rejects(
    app.run(() => app.storage.set('count', 3 as never)),
    {
      name: 'NativeModuleError',
      code: 'ERR_ARGUMENT',
      message: /Storage\.setItem argument 2 must be a string/,
    },
  );

  assert.ok(!app.calls.some(({ method }) => method === 'setItem'), 'nothing crossed');
});

test('secureStore stores, reads and deletes secrets', async () => {
  const app = await apis();

  await app.run(() => app.secureStore.set('token', 's3cret'));
  assert.equal(await app.run(() => app.secureStore.get('token')), 's3cret');

  await app.run(() => app.secureStore.delete('token'));
  assert.equal(await app.run(() => app.secureStore.get('token')), null);
});

test('secureStore sends one request with every option, defaults filled in', async () => {
  const app = await apis();

  await app.run(() => app.secureStore.set('token', 's3cret'));

  await app.run(() =>
    app.secureStore.get('token', {
      keychainService: 'auth',
      keychainAccessible: 'afterFirstUnlock',
      requireAuthentication: true,
      authenticationPrompt: 'Unlock your account',
    }),
  );

  assert.deepEqual(data(app.calls), [
    {
      module: 'SecureStore',
      method: 'setItem',
      args: [
        {
          key: 'token',
          value: 's3cret',
          service: 'app',
          accessible: 'whenUnlocked',
          requireAuthentication: false,
          prompt: null,
        },
      ],
    },
    {
      module: 'SecureStore',
      method: 'getItem',
      args: [
        {
          key: 'token',
          service: 'auth',
          accessible: 'afterFirstUnlock',
          requireAuthentication: true,
          prompt: 'Unlock your account',
        },
      ],
    },
  ]);
});

test('secureStore services keep separate secrets under one key', async () => {
  const app = await apis();

  await app.run(() => app.secureStore.set('token', 'a', { keychainService: 'one' }));
  await app.run(() => app.secureStore.set('token', 'b', { keychainService: 'two' }));

  assert.equal(await app.run(() => app.secureStore.get('token', { keychainService: 'one' })), 'a');

  assert.equal(await app.run(() => app.secureStore.get('token')), null);
});

test('an invalid key or value rejects before anything crosses', async () => {
  const app = await apis();
  const invalid = (pattern: RegExp) => (error: Error) => {
    assert.equal(error.name, 'TypeError');
    assert.match(error.message, pattern);

    return true;
  };

  await assert.rejects(app.secureStore.get(''), invalid(/secureStore: invalid key ""/));

  await assert.rejects(
    app.secureStore.set('my token', 'x'),
    invalid(/invalid key "my token".*letters, digits/),
  );

  await assert.rejects(
    app.secureStore.set('token', 42),
    invalid(/secureStore\.set: the value must be a string/),
  );

  await assert.rejects(
    app.secureStore.delete('token', { keychainService: 'a b' }),
    invalid(/invalid keychainService "a b"/),
  );

  assert.deepEqual(app.calls, []);
});

test('persisted reads its stored value synchronously, on the JS thread', async () => {
  const app = await apis({ Storage: storage(new Map([['theme', '"dark"']])) });
  const theme = app.persisted('system', { key: 'theme', schema: app.text });

  assert.equal(theme.value, 'dark');

  assert.ok(
    app.calls.some(
      ({ method, args }) => method === 'getString' && JSON.stringify(args) === '["theme"]',
    ),
  );

  assert.ok(!app.queued.some(({ args }) => args[0] === 'theme'), 'nothing waits on a promise');
});

test('persisted holds its initial value until something is stored', async () => {
  const app = await apis();

  assert.equal(app.persisted('system', { key: 'theme', schema: app.text }).value, 'system');
});

test('persisted batches the writes of one task into one transaction', async () => {
  const table = new Map<string, string>();
  const app = await apis({ Storage: storage(table) });
  const theme = app.persisted('system', { key: 'theme', schema: app.text });
  const language = app.persisted('en', { key: 'language', schema: app.text });

  theme.value = 'light';
  theme.value = 'dark';
  language.value = 'pt';

  assert.equal(theme.value, 'dark', 'a read sees the write at once');
  assert.deepEqual(app.queued, [], 'nothing crosses before the task ends');

  await app.settle();

  assert.deepEqual(data(app.queued), [
    {
      module: 'Storage',
      method: 'multiSet',
      args: [
        [
          ['theme', '"dark"'],
          ['language', '"pt"'],
        ],
      ],
    },
  ]);

  assert.equal(table.get('theme'), '"dark"');
});

test('a persisted value survives a relaunch', async () => {
  const table = new Map<string, string>();
  const sqlite = database();
  const first = await apis({ Storage: storage(table, sqlite) });

  first.persisted({ volume: 0.5 }, { key: 'player', schema: first.schema(() => null) }).value = {
    volume: 0.8,
  };

  await first.settle();

  const relaunched = await apis({ Storage: storage(table, sqlite) });
  const player = relaunched.persisted(
    { volume: 0.5 },
    { key: 'player', schema: relaunched.schema(() => null) },
  );

  assert.deepEqual(data(player.value), { volume: 0.8 });
});

test('one key is one signal, wherever it is made', async () => {
  const app = await apis();
  const options = { key: 'theme', schema: app.text };

  assert.equal(app.persisted('system', options), app.persisted('system', options));
});

test('a stored value its schema rejects is a warning, and the initial value', async () => {
  const app = await apis({
    Storage: storage(
      new Map([
        ['theme', '42'],
        ['broken', '{"unterminated'],
      ]),
    ),
  });
  const theme = app.persisted('system', { key: 'theme', schema: app.text });
  const broken = app.persisted('fallback', { key: 'broken', schema: app.text });

  assert.equal(theme.value, 'system');
  assert.equal(broken.value, 'fallback');
  assert.equal(app.warnings.length, 2);
  assert.match(app.warnings[0], /persisted\("theme"\).*schema.*expected a string.*initial value/);
  assert.match(app.warnings[1], /persisted\("broken"\).*not JSON/);
});

test('a value JSON cannot hold throws at the write', async () => {
  const app = await apis();
  const theme = app.persisted<unknown>('system', { key: 'theme', schema: app.schema(() => null) });

  assert.throws(
    () => (theme.value = undefined),
    (error: Error) =>
      error.name === 'TypeError' && /persisted\("theme"\).*JSON/.test(error.message),
  );
});

test('a schema that validates asynchronously throws at the read', async () => {
  const app = await apis({ Storage: storage(new Map([['theme', '"dark"']])) });
  const schema = {
    '~standard': { version: 1, vendor: 'test', validate: async (value: unknown) => ({ value }) },
  };

  assert.throws(
    () => app.persisted('system', { key: 'theme', schema }).value,
    (error: Error) => error.name === 'TypeError' && /synchronous/.test(error.message),
  );
});

test('a secure persisted value loads from secureStore, and writes there', async () => {
  const items = new Map([['app/token', '"abc"']]);
  const app = await apis({ SecureStore: secureStore(items) });
  const token = app.persisted<string | null>(null, {
    key: 'token',
    schema: app.schema(() => null),
    secure: true,
  });

  assert.equal(token.value, null, 'the keychain answers on a background thread');
  await app.settle();
  assert.equal(token.value, 'abc');

  token.value = 'xyz';
  await app.settle();

  assert.equal(items.get('app/token'), '"xyz"');
  assert.ok(!app.calls.some(({ module }) => module === 'Storage'), 'secrets stay out of storage');
});

test('a secure write before the keychain answers wins over the stored value', async () => {
  const items = new Map([['app/token', '"old"']]);
  const app = await apis({ SecureStore: secureStore(items) });
  const token = app.persisted<string | null>(null, {
    key: 'token',
    schema: app.schema(() => null),
    secure: true,
  });

  void token.value;
  token.value = 'new';
  await app.settle();

  assert.equal(token.value, 'new');
  assert.equal(items.get('app/token'), '"new"');
});

const ROWS: Track[] = [
  { id: 1, title: 'Intro', album: 'One', plays: 3 },
  { id: 2, title: 'Outro', album: 'One', plays: 9 },
  { id: 3, title: 'Single', album: null, plays: 1 },
];

test('a query reads its rows synchronously at the first read', async () => {
  const sqlite = database();
  const insert = sqlite.prepare('INSERT INTO tracks (id, title, album, plays) VALUES (?, ?, ?, ?)');

  for (const { id, title, album, plays } of ROWS) insert.run(id, title, album, plays);

  const app = await apis({ Storage: storage(new Map(), sqlite) });

  assert.deepEqual(
    (data(app.recent.value) as Track[]).map((row) => row.title),
    ['Intro', 'Outro', 'Single'],
  );

  assert.deepEqual(app.shown, ['Intro,Outro,Single'], 'the first frame has the rows');
});

test('a query follows writes to its table, without a re-plan', async () => {
  const app = await apis();
  const replans = app.kernel.stats().replans;

  await app.run(() => app.tracks.insert(ROWS));
  await app.settle();

  assert.deepEqual(app.shown.slice(-1), ['Intro,Outro,Single']);

  await app.run(() => app.tracks.update({ id: 2 }, { title: 'Finale' }));
  await app.settle();
  assert.deepEqual(app.shown.slice(-1), ['Intro,Finale,Single']);

  await app.run(() => app.tracks.delete({ album: null }));
  await app.settle();
  assert.deepEqual(app.shown.slice(-1), ['Intro,Finale']);

  assert.equal(app.kernel.stats().replans, replans, 'only the text binding ran');

  assert.ok(
    app.calls.some(({ method }) => method === 'selectAsync'),
    'refreshes read on the background thread',
  );
});

test('a query filters, orders and limits', async () => {
  const app = await apis();

  await app.run(() => app.tracks.insert(ROWS));

  const played = app.db.query(app.tracks, {
    where: { album: 'One' },
    orderBy: { plays: 'desc' },
    limit: 1,
  });
  const single = app.db.query(app.tracks, { where: { album: null } });

  assert.deepEqual(data(played.value), [ROWS[1]]);
  assert.deepEqual(data(single.value), [ROWS[2]]);
});

test('a write is one transaction: every row lands, or none', async () => {
  const app = await apis();

  await app.run(() => app.tracks.insert(ROWS));
  assert.equal(app.calls.filter(({ method }) => method === 'write').length, 1);

  await assert.rejects(
    app.run(() => app.tracks.insert([{ id: 4, title: 'New', album: null, plays: 0 }, ROWS[0]])),
    (error: Error & { code?: string }) => error.code === 'ERR_STORAGE',
  );

  assert.equal(app.db.query(app.tracks).value.length, 3, 'the new row rolled back');
});

test('a write to one table leaves the queries of another alone', async () => {
  const sqlite = database();

  sqlite.exec('CREATE TABLE albums (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');

  const app = await apis({ Storage: storage(new Map(), sqlite) });
  const albums = app.db.table(
    'albums',
    app.schema(() => null),
  );

  void app.recent.value;
  await app.run(() => albums.insert({ id: 1, name: 'One' } as never));
  await app.settle();

  assert.ok(!app.calls.some(({ method }) => method === 'selectAsync'));
});

test('a stored row its schema rejects is a warning, and left out', async () => {
  const sqlite = database();

  sqlite.exec("INSERT INTO tracks (id, title, album, plays) VALUES (1, 'Fine', NULL, 0)");
  sqlite.exec("INSERT INTO tracks (id, title, album, plays) VALUES (2, 'Odd', NULL, 'many')");

  const app = await apis({ Storage: storage(new Map(), sqlite) });

  assert.deepEqual(
    (data(app.recent.value) as Track[]).map((row) => row.id),
    [1],
  );

  assert.equal(app.warnings.length, 1);
  assert.match(app.warnings[0], /db\.query\("tracks"\): 1 row.*expected a track.*left out/);
});

test('an invalid row, value or name throws before anything crosses', async () => {
  const app = await apis();
  const invalid = (pattern: RegExp) => (error: Error) => {
    assert.equal(error.name, 'TypeError');
    assert.match(error.message, pattern);

    return true;
  };

  await assert.rejects(
    app.tracks.insert({ id: 1, title: 2 } as never),
    invalid(/tracks\.insert: row 1 doesn't match the table's schema: expected a track/),
  );

  await assert.rejects(
    app.tracks.update({ id: 1 }, { title: {} } as never),
    invalid(/tracks\.update: "title" must be a string, number, boolean or null/),
  );

  assert.throws(
    () =>
      app.db.table(
        'tracks; DROP TABLE tracks',
        app.schema(() => null),
      ),
    invalid(/db\.table: "tracks; DROP TABLE tracks" is not a table name/),
  );

  assert.throws(
    () => app.db.query(app.tracks, { where: { 'id = 1 OR 1': 1 } as never }),
    invalid(/db\.query: "id = 1 OR 1" is not a column name/),
  );

  assert.ok(!app.calls.some(({ method }) => method === 'write'));
});

test('a where compares, matches a list and a pattern', async () => {
  const app = await apis();

  await app.run(() => app.tracks.insert(ROWS));

  const ids = (where: Where) =>
    (data(app.db.query(app.tracks, { where, orderBy: { id: 'asc' } }).value) as Track[]).map(
      (row) => row.id,
    );

  assert.deepEqual(ids({ plays: { gt: 3 } }), [2]);
  assert.deepEqual(ids({ plays: { gte: 3 } }), [1, 2]);
  assert.deepEqual(ids({ plays: { gte: 1, lt: 9 } }), [1, 3], 'comparisons on a column all hold');
  assert.deepEqual(ids({ plays: { lte: 3 }, album: 'One' }), [1]);
  assert.deepEqual(ids({ album: { not: null } }), [1, 2]);
  assert.deepEqual(ids({ album: { not: 'One' } }), [3], 'NULL is not "One"');
  assert.deepEqual(ids({ id: { in: [3, 1] } }), [1, 3]);
  assert.deepEqual(ids({ album: { in: ['Two', null] } }), [3], 'null in a list matches NULL');
  assert.deepEqual(ids({ id: { in: [] } }), [], 'an empty list matches no row');
  assert.deepEqual(ids({ title: { like: '%tro' } }), [1, 2]);
  assert.deepEqual(ids({ title: { like: "x' OR 1 = 1 --" } }), [], 'a pattern is a value');
});

test('where values are bound, never written into the SQL', async () => {
  const app = await apis();

  void app.db.query(app.tracks, {
    where: { title: { like: 'In%', not: 'Outro' }, id: { in: [1, 2] }, plays: { gt: 7 } },
  }).value;

  const select = app.calls.find(
    ({ method, args }) => method === 'select' && /WHERE/.test(String(args[0])),
  );

  assert.ok(select, 'the query read synchronously');
  assert.doesNotMatch(String(select.args[0]), /In%|Outro|7/);
  assert.deepEqual(select.args[1], ['In%', 'Outro', 1, 2, 7]);
});

test('a count follows writes to its table', async () => {
  const app = await apis();
  const all = app.db.count(app.tracks);
  const played = app.db.count(app.tracks, { plays: { gt: 2 } });
  const seen: number[] = [];

  assert.equal(all.value, 0);
  app.watch(played, (count) => seen.push(count), { immediate: true });

  await app.run(() => app.tracks.insert(ROWS));
  await app.settle();

  assert.equal(all.value, 3);
  assert.deepEqual(seen, [0, 2]);

  await app.run(() => app.tracks.delete({ id: 2 }));
  await app.settle();

  assert.deepEqual(seen, [0, 2, 1]);
});

test('a transaction lands the writes of several tables together', async () => {
  const sqlite = database();

  sqlite.exec('CREATE TABLE albums (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');

  const app = await apis({ Storage: storage(new Map(), sqlite) });
  const albums = app.db.table(
    'albums',
    app.schema(() => null),
  );
  const albumCount = app.db.count(albums);

  void app.recent.value;
  void albumCount.value;

  await app.run(() =>
    app.db.transaction(() => {
      void albums.insert({ id: 1, name: 'One' } as never);
      void app.tracks.insert(ROWS);
      void app.tracks.update({ id: 3 }, { album: 'One' });
    }),
  );

  await app.settle();

  assert.equal(app.calls.filter(({ method }) => method === 'write').length, 1, 'one transaction');
  assert.deepEqual(app.shown.slice(-1), ['Intro,Outro,Single']);
  assert.equal(albumCount.value, 1);
  assert.equal(app.db.count(app.tracks, { album: 'One' }).value, 3);

  await assert.rejects(
    app.run(() =>
      app.db.transaction(() => {
        void albums.insert({ id: 2, name: 'Two' } as never);
        void app.tracks.insert(ROWS[0]);
      }),
    ),
    (error: Error & { code?: string }) => error.code === 'ERR_STORAGE',
  );

  assert.equal(app.db.count(albums).value, 1, "the album rolled back with the track's failure");
});

test('a write in a transaction settles with the transaction', async () => {
  const app = await apis();
  let insert: Promise<void> | undefined;

  const done = app.db.transaction(() => {
    insert = app.tracks.insert(ROWS);
  });

  assert.equal(insert, done);
  await app.run(() => done);
  assert.equal(app.db.count(app.tracks).value, 3);
});

test('a transaction that fails before it crosses writes nothing', async () => {
  const app = await apis();
  const invalid = (pattern: RegExp) => (error: Error) => {
    assert.match(error.message, pattern);

    return true;
  };

  await assert.rejects(
    app.db.transaction(() => {
      void app.tracks.insert(ROWS[0]);
      void app.tracks.insert({ id: 4, title: 4 } as never);
    }),
    invalid(/tracks\.insert: row 1 doesn't match the table's schema/),
  );

  await assert.rejects(
    app.db.transaction(() => {
      void app.tracks.insert(ROWS[0]);
      throw new Error('changed my mind');
    }),
    invalid(/changed my mind/),
  );

  await assert.rejects(
    app.db.transaction(async () => {
      void app.tracks.insert(ROWS[0]);
    }),
    invalid(/db\.transaction: .*synchronous/),
  );

  assert.ok(!app.calls.some(({ method }) => method === 'write'));
});

test('a transaction inside a transaction joins it', async () => {
  const app = await apis();
  let inner: Promise<void> | undefined;

  const outer = app.db.transaction(() => {
    void app.tracks.insert(ROWS[0]);

    inner = app.db.transaction(() => {
      void app.tracks.insert(ROWS[1]);
    });
  });

  assert.equal(inner, outer);
  await app.run(() => outer);
  assert.equal(app.calls.filter(({ method }) => method === 'write').length, 1);
  assert.equal(app.db.count(app.tracks).value, 2);
});

test("a column the table doesn't have, or a bad comparison, throws before anything crosses", async () => {
  const app = await apis();
  const invalid = (pattern: RegExp) => (error: Error) => {
    assert.equal(error.name, 'TypeError');
    assert.match(error.message, pattern);

    return true;
  };

  assert.throws(
    () => app.db.query(app.tracks, { where: { plys: 1 } as never }),
    invalid(/db\.query: tracks has no column "plys"; its columns are id, title, album, plays/),
  );

  assert.throws(
    () => app.db.query(app.tracks, { orderBy: { ploys: 'asc' } as never }),
    invalid(/tracks has no column "ploys"/),
  );

  assert.throws(
    () => app.db.count(app.tracks, { plays: { between: [1, 2] } } as never),
    invalid(/db\.count: "plays" compares with gt, gte, lt, lte, not, in or like, not "between"/),
  );

  assert.throws(
    () => app.db.query(app.tracks, { where: { plays: { gt: null } } }),
    invalid(/db\.query: "plays" gt needs a string or number, not null/),
  );

  assert.throws(
    () => app.db.query(app.tracks, { where: { id: { in: 1 } } }),
    invalid(/db\.query: "id" in needs a list/),
  );

  assert.throws(
    () => app.db.query(app.tracks, { where: { plays: { like: 1 } } }),
    invalid(/db\.query: "plays" like needs a string pattern/),
  );

  await assert.rejects(
    app.tracks.update({ id: 1 }, { rating: 5 } as never),
    invalid(/tracks\.update: tracks has no column "rating"/),
  );

  await assert.rejects(
    app.tracks.delete({ albm: null } as never),
    invalid(/tracks\.delete: tracks has no column "albm"/),
  );

  assert.ok(!app.calls.some(({ method }) => method === 'write'));
});

test('a comparison that compares nothing throws, rather than matching every row', async () => {
  const app = await apis();

  await app.run(() => app.tracks.insert(ROWS));

  await assert.rejects(
    app.run(() => app.tracks.delete({ id: { in: undefined } })),
    (error: Error) =>
      error.name === 'TypeError' && /tracks\.delete: "id" compares nothing/.test(error.message),
  );

  assert.throws(
    () => app.db.query(app.tracks, { where: { plays: {} } }),
    /db\.query: "plays" compares nothing/,
  );

  assert.throws(
    () => app.db.query(app.tracks, { where: { plays: { toString: 1 } } }),
    /"plays" compares with gt, .* not "toString"/,
  );

  assert.equal(app.db.count(app.tracks).value, 3);
});

test('a failed transaction inside another fails both, even when caught', async () => {
  const app = await apis();
  let inner: Promise<void> | undefined;

  const outer = app.db.transaction(() => {
    void app.tracks.insert(ROWS[0]);

    inner = app.db.transaction(() => {
      void app.tracks.insert(ROWS[1]);
      throw new Error('inner gave up');
    });
  });

  assert.equal(inner, outer, 'the inner transaction rejects with the outer one, not throws');
  await assert.rejects(outer, /inner gave up/);
  assert.ok(!app.calls.some(({ method }) => method === 'write'));
});
