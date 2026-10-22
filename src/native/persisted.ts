import Storage from '../../native/modules/storage/storage';
import type { Signal } from '../ui/reactivity';
import { check, type Schema } from './schema';
import { report, signal, warn } from './scope';
import * as secureStore from './secure-store';

export interface PersistedOptions<T> {
  /** The storage key the value lives under, as JSON. */
  key: string;
  /** What a stored value must be: anything else is a warning, and `initial`. */
  schema: Schema<T>;
  /** In the keychain, through secureStore, for small secrets. Its first read is asynchronous. */
  secure?: boolean;
}

// Signals whose state outlives the process (docs/storage.md#persisted).
// One signal per key, wherever it is made: every reader shares one value, and
// a component that sets up again finds the signal it had.
const made = new Map<string, Signal<unknown>>();

// The JSON each key last took in this task; it crosses when the task ends.
const pending = new Map<string, { key: string; text: string; secure: boolean }>();
let scheduled = false;

function flush(): void {
  const writes = [...pending.values()];
  const entries = writes
    .filter(({ secure }) => !secure)
    .map(({ key, text }): [string, string] => [key, text]);

  pending.clear();
  scheduled = false;

  if (entries.length)
    Storage.multiSet(entries).catch(
      report('persisted could not write ' + entries.map(([key]) => key).join(', ')),
    );

  for (const { key, text } of writes.filter(({ secure }) => secure))
    secureStore.set(key, text).catch(report('persisted("' + key + '") could not write'));
}

function store(id: string, write: { key: string; text: string; secure: boolean }): void {
  pending.set(id, write);

  if (scheduled) return;

  scheduled = true;
  void Promise.resolve().then(flush);
}

/** The stored JSON as `schema` outputs it; anything else warns and falls back to `initial`. */
function decode<T>(text: string | null, initial: T, schema: Schema<T>, subject: string): T {
  if (text === null) return initial;

  const fallback = 'using the initial value until the next write replaces it.';
  let stored: unknown;

  try {
    stored = JSON.parse(text);
  } catch {
    warn(subject + ': the stored value is not JSON; ' + fallback);

    return initial;
  }

  const result = check(schema, stored, subject);

  if (result.ok) return result.value;

  warn(subject + ": the stored value doesn't match its schema (" + result.issue + '); ' + fallback);

  return initial;
}

/**
 * A signal whose value survives the app's restarts. Its first read is
 * synchronous; each write lands at once in memory and on disk when the JS
 * task ends, in one transaction with the task's other writes.
 */
export function persisted<T>(initial: T, options: PersistedOptions<T>): Signal<T> {
  const { key, schema, secure = false } = options;
  const id = (secure ? 'secure:' : '') + key;
  const existing = made.get(id);

  // The map holds every key's signal; this key's was made for T.
  if (existing) return existing as never;

  const subject = 'persisted("' + key + '")';
  let cell: Signal<T> | null = null;
  let written = false;

  const open = (): Signal<T> => {
    if (cell) return cell;
    if (!secure) return (cell = signal(decode(Storage.getString(key), initial, schema, subject)));

    // The keychain answers on a background thread: `initial` until then.
    const opened = signal(initial);

    secureStore.get(key).then(
      (text) => {
        if (!written) opened.value = decode(text, initial, schema, subject);
      },
      report(subject + ' could not read the keychain'),
    );

    return (cell = opened);
  };

  const persistedSignal: Signal<T> = {
    get value() {
      return open().value;
    },
    set value(next) {
      const text = JSON.stringify(next);

      if (typeof text !== 'string')
        throw new TypeError(
          subject +
            ': the value must be JSON data (strings, numbers, booleans, null, arrays and plain objects), not ' +
            typeof next +
            '.',
        );

      written = true;

      if (cell) cell.value = next;
      else cell = signal(next);

      store(id, { key, text, secure });
    },
  };

  made.set(id, persistedSignal as Signal<unknown>);

  return persistedSignal;
}
