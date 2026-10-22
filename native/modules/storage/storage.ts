import { defineModule, fn } from '../../../src/native/define-module';
import type { Json } from '../../../src/native/modules';

/** A statement and the values bound to its `?`s: strings, numbers and null. */
export type SqlStatement = { sql: string; params: Json[] };

/** A query's result: column names once, then each row's values in their order. */
export type SqlRows = { columns: string[]; rows: Json[][] };

// Persistent key-value storage for strings, and the app's SQLite database:
// one database file in the app's own data on iOS and Android
// (docs/storage.md). Every call shares one connection, so the JS thread's
// synchronous reads see every write whose promise resolved.
export default defineModule('Storage', {
  /** The value under `key`, read on the JS thread. */
  getString: fn.sync<(key: string) => string | null>(),
  getItem: fn.background<(key: string) => Promise<string | null>>(),
  setItem: fn.background<(key: string, value: string) => Promise<void>>(),
  removeItem: fn.background<(key: string) => Promise<void>>(),
  getAllKeys: fn.background<() => Promise<string[]>>(),
  /** Each key's value, in the keys' order. */
  multiGet: fn.background<(keys: string[]) => Promise<Array<string | null>>>(),
  /** `[key, value]` pairs, in one transaction. */
  multiSet: fn.background<(entries: string[][]) => Promise<void>>(),
  multiRemove: fn.background<(keys: string[]) => Promise<void>>(),
  clear: fn.background<() => Promise<void>>(),
  /** Runs a query on the JS thread: a first read with no frame between. */
  select: fn.sync<(sql: string, params: Json[]) => SqlRows>(),
  selectAsync: fn.background<(sql: string, params: Json[]) => Promise<SqlRows>>(),
  /** Runs every statement in one transaction, after the migrations. */
  write: fn.background<(statements: SqlStatement[]) => Promise<void>>(),
  ios: { class: 'KuitoStorageModule' },
  android: { class: 'dev.kuito.runtime.modules.storage.KuitoStorageModule' },
});
