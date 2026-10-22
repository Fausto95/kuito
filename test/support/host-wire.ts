// The native host's side of the kernel's batch, for tests: decodes what
// `__kuitoHostCommit` receives as native/shared/Wire.h does, naming views by
// their labels, and replays each record into a fake host's callbacks.
import { PROP_KEYS } from '../../src/runtime/protocol.generated.ts';
import { eventLayout, writeRecord } from '../../src/tests/events.ts';
import type { KuitoKernel } from './kuito-host.ts';

const PROP_NAMES = Object.keys(PROP_KEYS);

/** One edit of a native list's keys (src/runtime/key-diff.ts). */
export interface KeyEdit {
  op: 'insert' | 'remove' | 'move';
  index: number;
  key: string;
}

const KEY_EDITS = ['insert', 'remove', 'move'] as const;

export type HostRecord =
  | { op: 'create'; id: string; kind: string; parent: string; flattened: boolean }
  | { op: 'remove'; id: string }
  | { op: 'move'; id: string; parent: string; index: number }
  | { op: 'flatten'; id: string; flattened: boolean }
  /** `structured`: the value crossed as plain data, as an object prop's does, not as text. */
  | { op: 'prop'; id: string; name: string; value: unknown; structured: boolean }
  /** A list's keys as edits to the keys it had. */
  | { op: 'keys'; id: string; name: string; edits: KeyEdit[] }
  | { op: 'command'; id: string; name: string; argument: string }
  /** The UI-thread operations, as plain data. */
  | { op: 'ui'; operations: unknown[] }
  | { op: 'uiScript'; source: string; url: string }
  | { op: 'uiKernel'; hash: string }
  | { op: 'uiBundle'; hash: string; url: string };

/** What a fake host does with each record; ids are labels, '' for the root or the app. */
export interface FakeHost {
  createView?(id: string, kind: string, parent: string, flattened: boolean): void;
  /** A key diff reaches it applied: the list's whole keys. */
  setProp?(id: string, name: string, value: unknown): void;
  removeView?(id: string): void;
  moveView?(id: string, parent: string, index: number): void;
  setFlattened?(id: string, flattened: boolean): void;
  command?(id: string, name: string, argument: string): void;
  ui?(operations: unknown[]): void;
  uiScript?(source: string, url: string): void;
  uiKernel?(hash: string): void;
  uiBundle?(hash: string, url: string): void;
  /** Every batch, decoded, before its records replay. */
  commit?(records: HostRecord[]): void;
}

/** Every view a host's batches created, both ways. */
interface Names {
  labels: Map<number, string>;
  handles: Map<string, number>;
}

const SYSTEM_TARGETS = ['__kuito:keyboard', '__kuito:accessibility', '__kuito:devtools'];

/** The number each label last had, in any host: an event for a removed view still resolves. */
const lastHandles = new Map<string, number>();

/** The kernel's batch as records, as native/shared/Wire.h decodes it. */
export function decodeBatch(
  buffer: ArrayBuffer,
  length: number,
  strings: string[],
  names: Names = { labels: new Map(), handles: new Map() },
): HostRecord[] {
  const labelOf = (id: number): string => {
    if (id === 0) return '';

    const label = names.labels.get(id);

    if (label === undefined) throw new Error('The batch names view ' + id + ' before creating it');

    return label;
  };
  const view = new DataView(buffer, 0, length);
  const records: HostRecord[] = [];
  let at = 0;
  const u8 = () => view.getUint8(at++);
  const u16 = () => ((at += 2), view.getUint16(at - 2, true));
  const u32 = () => ((at += 4), view.getUint32(at - 4, true));
  const f64 = () => ((at += 8), view.getFloat64(at - 8, true));
  const text = () => {
    const index = u32();

    if (index >= strings.length) throw new Error('No string ' + index);

    return strings[index];
  };
  const name = () => {
    const key = u16();

    return key === 0xffff ? text() : PROP_NAMES[key];
  };
  const value = (tag: number): unknown => {
    switch (tag) {
      case 0:
        return null;
      case 1:
        return f64();
      case 2:
        return false;
      case 3:
        return true;
      case 4:
        return text();
      // Plain data, as native/shared/Wire.h reads it: a count, then each field's name and value.
      case 7:
        return Object.fromEntries(Array.from({ length: u32() }, () => [text(), value(u8())]));
      case 8:
        return Array.from({ length: u32() }, () => value(u8()));
      default:
        throw new Error('Unknown value tag ' + tag);
    }
  };
  const edit = (): KeyEdit => {
    const op = KEY_EDITS[u8()];

    if (op === undefined) throw new Error('Unknown key edit');

    return { op, index: u32(), key: text() };
  };

  while (at < length) {
    const op = u8();

    switch (op) {
      case 1: {
        const id = u32();
        const parent = u32();
        const kind = text();
        const label = text();
        const flattened = u8() !== 0;

        names.labels.set(id, label);
        names.handles.set(label, id);
        lastHandles.set(label, id);
        records.push({ op: 'create', id: label, kind, parent: labelOf(parent), flattened });
        break;
      }
      case 2:
        records.push({ op: 'remove', id: labelOf(u32()) });
        break;
      case 3:
        records.push({ op: 'move', id: labelOf(u32()), parent: labelOf(u32()), index: u32() });
        break;
      case 4:
        records.push({ op: 'flatten', id: labelOf(u32()), flattened: u8() !== 0 });
        break;
      case 5: {
        const id = labelOf(u32());
        const prop = name();
        const tag = u8();

        if (tag === 6)
          records.push({ op: 'keys', id, name: prop, edits: Array.from({ length: u32() }, edit) });
        else
          records.push({
            op: 'prop',
            id,
            name: prop,
            value: value(tag),
            structured: tag === 7 || tag === 8,
          });

        break;
      }
      case 6:
        records.push({ op: 'command', id: labelOf(u32()), name: text(), argument: text() });
        break;
      case 7: {
        const operations = value(u8());

        if (!Array.isArray(operations)) throw new Error('UI operations come as a list');

        records.push({ op: 'ui', operations });
        break;
      }
      case 8:
        records.push({ op: 'uiScript', source: text(), url: text() });
        break;
      case 9:
        records.push({ op: 'uiKernel', hash: text() });
        break;
      case 10:
        records.push({ op: 'uiBundle', hash: text(), url: text() });
        break;
      default:
        throw new Error('Unknown operation ' + op);
    }
  }

  return records;
}

/** Applies `edits` as a native list does, rejecting one that does not fit the keys. */
function applyKeys(keys: readonly string[], edits: KeyEdit[]): string[] {
  const result = keys.slice();

  edits.forEach(({ op, index, key }) => {
    const at = result.indexOf(key);

    if (op === 'insert' ? at !== -1 : op === 'remove' ? at !== index : at === -1)
      throw new Error(`The list cannot ${op} ${key} at ${index}: its keys are ${result.join()}`);

    if (op !== 'insert') result.splice(at, 1);
    if (op !== 'remove') result.splice(index, 0, key);
  });

  return result;
}

/** Replays `record` into `fake`; `lists` holds each list's keys by `id.name`. */
function replay(fake: FakeHost, record: HostRecord, lists: Map<string, string[]>): void {
  switch (record.op) {
    case 'create':
      return fake.createView?.(record.id, record.kind, record.parent, record.flattened);
    case 'remove':
      [...lists.keys()]
        .filter((list) => list.startsWith(record.id + '.'))
        .forEach((list) => lists.delete(list));

      return fake.removeView?.(record.id);
    case 'move':
      return fake.moveView?.(record.id, record.parent, record.index);
    case 'flatten':
      return fake.setFlattened?.(record.id, record.flattened);
    case 'prop':
      lists.delete(record.id + '.' + record.name);

      return fake.setProp?.(record.id, record.name, record.value);
    case 'keys': {
      const list = record.id + '.' + record.name;
      const keys = applyKeys(lists.get(list) ?? [], record.edits);

      lists.set(list, keys);

      return fake.setProp?.(record.id, record.name, keys);
    }
    case 'command':
      return fake.command?.(record.id, record.name, record.argument);
    case 'ui':
      return fake.ui?.(record.operations);
    case 'uiScript':
      return fake.uiScript?.(record.source, record.url);
    case 'uiKernel':
      return fake.uiKernel?.(record.hash);
    case 'uiBundle':
      return fake.uiBundle?.(record.hash, record.url);
  }
}

const CALLBACKS = [
  'createView',
  'setProp',
  'removeView',
  'moveView',
  'setFlattened',
  'command',
  'ui',
  'uiScript',
  'uiKernel',
  'uiBundle',
  'commit',
] as const;

/**
 * Makes `host` a kernel host: its fake callbacks (createView, setProp, ...)
 * leave it, and its `__kuitoHostCommit` replays each batch into them, record
 * by record, with views named by label. A callback that throws rejects the
 * batch, as the native host rejects one it cannot take. Returns `host` itself,
 * so a test that keeps it sees the kernel's globals on it.
 */
export function hosting<H extends FakeHost & object>(
  host: H,
): Omit<H, (typeof CALLBACKS)[number]> & {
  __kuitoHostCommit(buffer: ArrayBuffer, length: number, strings: string[]): void;
} {
  const fake: FakeHost = {};
  const names: Names = { labels: new Map(), handles: new Map() };
  const lists = new Map<string, string[]>();

  CALLBACKS.forEach((name) => {
    if (!(name in host)) return;

    Object.assign(fake, { [name]: Reflect.get(host, name) });
    Reflect.deleteProperty(host, name);
  });

  return Object.assign(host, {
    __kuitoHostCommit(buffer: ArrayBuffer, length: number, strings: string[]) {
      const records = decodeBatch(buffer, length, strings, names);

      fake.commit?.(records);
      records.forEach((record) => replay(fake, record, lists));
    },
  });
}

/** The number the host knows view `label` by, while it lives or after it went. */
export function handleOf(kuito: KuitoKernel, label: string): number {
  const handle = kuito.view(label)?.handle ?? lastHandles.get(label);

  if (handle === undefined) throw new Error('No view ' + label + ' was ever created');

  return handle;
}

/**
 * Sends a native event written `<label>.<event>`, with \x1f and its payload
 * as JSON when it carries one. `__kuito:keyboard.<event>` and the other
 * system targets, and `__kuito.ui`, are the app's events (handle 0). An
 * event the manifest lays out goes as a shell sends it, in its typed record
 * (docs/events.md#typed-events), any field the test leaves out as 0, false or
 * empty text; a module view's own, and the UI thread's messages, go as JSON.
 */
export function nativeEvent(kuito: KuitoKernel, message: string): unknown {
  const separator = message.indexOf('\u001f');
  const key = separator === -1 ? message : message.slice(0, separator);
  const payload = separator === -1 ? undefined : message.slice(separator + 1);

  if (key === '__kuito.ui') return kuito.dispatch(0, 'ui', payload);

  const dot = key.lastIndexOf('.');
  const target = key.slice(0, dot);
  const system = SYSTEM_TARGETS.indexOf(target) !== -1;
  const handle = system ? 0 : handleOf(kuito, target);
  const event = system ? key.slice('__kuito:'.length) : key.slice(dot + 1);
  const kind = system ? null : kuito.view(target)?.kind;
  const layout = kind === undefined ? null : eventLayout(kind, event);

  if (layout === null) return kuito.dispatch(handle, event, payload);

  const fields: unknown = payload === undefined ? {} : JSON.parse(payload);

  if (typeof fields !== 'object' || fields === null) throw new TypeError('A payload is an object');

  return kuito.dispatchRecord(
    handle,
    event,
    layout,
    writeRecord(layout, fields as Record<string, unknown>, kuito.eventNumbers, { zero: true }),
  );
}
