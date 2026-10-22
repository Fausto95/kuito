import Storage from '../../native/modules/storage/storage';

/** A key and its value, or `null` when nothing is stored under it. */
export type StorageEntry = [key: string, value: string | null];

/** A value SQLite stores and binds: booleans cross as 1 and 0. */
export type SqlValue = string | number | null;

export type SqlStatement = { sql: string; params: SqlValue[] };

// Persistent key-value storage for strings, a `Map` that survives restarts: a
// SQLite table in the app's own data on iOS and Android (docs/storage.md).

/** The value under `key`, or `null`. */
export const get = (key: string): Promise<string | null> => Storage.getItem(key);

export const set = (key: string, value: string): Promise<void> => Storage.setItem(key, value);

const remove = (key: string): Promise<void> => Storage.removeItem(key);

export { remove as delete };

export const keys = (): Promise<string[]> => Storage.getAllKeys();

export const clear = (): Promise<void> => Storage.clear();

export const getMany = (keys: string[]): Promise<StorageEntry[]> =>
  Storage.multiGet(keys).then((values) =>
    keys.map((key, index): StorageEntry => [key, values[index] ?? null]),
  );

/** Writes every entry in one transaction: all of them land, or none. */
export const setMany = (entries: [key: string, value: string][]): Promise<void> =>
  Storage.multiSet(entries);

export const deleteMany = (keys: string[]): Promise<void> => Storage.multiRemove(keys);

/**
 * The value under `key`, or `null`, read synchronously on the JS thread: for
 * small reads at startup. It sees every write whose promise resolved.
 */
export const peek = (key: string): string | null => Storage.getString(key);
