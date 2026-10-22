// The host batch: every view mutation of a job, written as records into one
// ArrayBuffer and sent with one `__kuitoHostCommit` call, which C++ decodes
// once into typed mutations (native/shared/Wire.h, docs/native-scheduling.md).
// A commit (src/runtime/transaction.ts) sends its records alone, so a batch
// the host rejects is exactly the commit to undo; other writes wait for the
// scope around them (an event) to end, or go at once outside one.
import type { KeyEdit } from './key-diff';
import { appendOperations, operationsSent } from './operations';
import { PROP_KEYS } from './protocol.generated';
import { wire } from './state/batch';
import { stats } from './state/stats';
import { isPlainData, own } from './values';

declare global {
  /** One job's view mutations: `buffer`'s first `byteLength` bytes, naming `strings` by index. */
  var __kuitoHostCommit: (buffer: ArrayBuffer, byteLength: number, strings: string[]) => void;
}

/** Record types; native/shared/Mutation.h's Op. */
const Op = {
  Create: 1,
  Remove: 2,
  Move: 3,
  Flatten: 4,
  Prop: 5,
  Command: 6,
  UI: 7,
  UIScript: 8,
  UIKernel: 9,
  UIBundle: 10,
} as const;

/** Value tags; native/shared/Wire.h's RawValue::Tag. Json (5) is only in older recordings. */
const Tag = {
  Null: 0,
  Number: 1,
  False: 2,
  True: 3,
  Text: 4,
  Keys: 6,
  Struct: 7,
  List: 8,
} as const;

/** Key edits; native/shared/Mutation.h's KeyEdit::Op. */
const Edit = { insert: 0, remove: 1, move: 2 } as const;

/** A prop the manifest does not list goes by name. */
const NAMED = 0xffff;

function reserve(bytes: number): DataView {
  const needed = wire.length + bytes;

  if (needed > wire.buffer.byteLength) {
    const grown = new ArrayBuffer(Math.max(needed, wire.buffer.byteLength * 2));

    new Uint8Array(grown).set(new Uint8Array(wire.buffer, 0, wire.length));
    wire.buffer = grown;
    wire.view = new DataView(grown);
  }

  return wire.view;
}

function u8(value: number): void {
  reserve(1).setUint8(wire.length, value);
  wire.length += 1;
}

function u16(value: number): void {
  reserve(2).setUint16(wire.length, value, true);
  wire.length += 2;
}

function u32(value: number): void {
  reserve(4).setUint32(wire.length, value, true);
  wire.length += 4;
}

function f64(value: number): void {
  reserve(8).setFloat64(wire.length, value, true);
  wire.length += 8;
}

function text(value: string): void {
  u32(wire.strings.push(value) - 1);
}

function key(name: string, named: boolean): void {
  if (!named && own(PROP_KEYS, name)) return u16(PROP_KEYS[name]);

  u16(NAMED);
  text(name);
}

function value(raw: unknown, name: string): void {
  if (raw === null || raw === undefined) return u8(Tag.Null);
  if (typeof raw === 'boolean') return u8(raw ? Tag.True : Tag.False);

  if (typeof raw === 'number') {
    u8(Tag.Number);

    return f64(raw);
  }

  if (typeof raw === 'string') {
    u8(Tag.Text);

    return text(raw);
  }

  if (typeof raw === 'object') return plain(raw, name, 0);

  throw new TypeError('Native prop ' + name + ' cannot take a ' + typeof raw);
}

/** Deeper than this, C++ refuses the batch (native/shared/Wire.h). */
const PLAIN_DEPTH = 64;

/**
 * Plain data, field by field, as JSON would hold it and C++ reads it once
 * (docs/native-scheduling.md): an object's undefined fields are left out, an
 * array's undefined items and a number JSON cannot hold are null.
 */
function plain(raw: unknown, name: string, depth: number): void {
  if (raw === null || raw === undefined) return u8(Tag.Null);
  if (typeof raw === 'boolean') return u8(raw ? Tag.True : Tag.False);

  if (typeof raw === 'number') {
    if (!isFinite(raw)) return u8(Tag.Null);

    u8(Tag.Number);

    return f64(raw);
  }

  if (typeof raw === 'string') {
    u8(Tag.Text);

    return text(raw);
  }

  if (typeof raw !== 'object' || depth >= PLAIN_DEPTH)
    throw new TypeError(
      name +
        ' takes plain data: ' +
        (depth >= PLAIN_DEPTH ? 'it nests too deep' : 'not a ' + typeof raw),
    );

  if (Array.isArray(raw)) {
    const items: readonly unknown[] = raw;

    u8(Tag.List);
    u32(items.length);

    // By index, not forEach: a hole is null, as JSON writes it, and the count stays true.
    for (let index = 0; index < items.length; index++) plain(items[index], name, depth + 1);

    return;
  }

  if (!isPlainData(raw))
    throw new TypeError(name + ' takes plain data: not an object with a prototype');

  const keys = Object.keys(raw).filter((key) => raw[key] !== undefined);

  u8(Tag.Struct);
  u32(keys.length);

  keys.forEach((key) => {
    text(key);
    plain(raw[key], name, depth + 1);
  });
}

/** Sends the batch unless a scope holds it. */
function written(): void {
  if (wire.holding === 0) sendBatch();
}

/** `parent` 0 is the screen's root; `label` names the view in native errors. */
export function writeCreate(
  id: number,
  parent: number,
  kind: string,
  label: string,
  flattened: boolean,
): void {
  u8(Op.Create);
  u32(id);
  u32(parent);
  text(kind);
  text(label);
  u8(flattened ? 1 : 0);
  written();
}

export function writeRemove(id: number): void {
  u8(Op.Remove);
  u32(id);
  written();
}

export function writeMove(id: number, parent: number, index: number): void {
  u8(Op.Move);
  u32(id);
  u32(parent);
  u32(index);
  written();
}

export function writeFlatten(id: number, flattened: boolean): void {
  u8(Op.Flatten);
  u32(id);
  u8(flattened ? 1 : 0);
  written();
}

/** `named` sends the prop by name even when the manifest has a key for it. */
export function writeProp(id: number, name: string, raw: unknown, named = false): void {
  stats.total.sendPropCalls++;
  u8(Op.Prop);
  u32(id);
  key(name, named);
  value(raw, name);
  written();
}

/** A list's keys as edits to the keys it was sent last (docs/lists.md#keys). */
export function writeKeys(id: number, name: string, edits: KeyEdit[]): void {
  stats.total.sendPropCalls++;
  u8(Op.Prop);
  u32(id);
  key(name, false);
  u8(Tag.Keys);
  u32(edits.length);

  edits.forEach((edit) => {
    u8(Edit[edit.op]);
    u32(edit.index);
    text(edit.key);
  });

  written();
}

/** `id` 0 addresses the app rather than one view. */
export function writeCommand(id: number, name: string, argument: string): void {
  u8(Op.Command);
  u32(id);
  text(name);
  text(argument);
  written();
}

export function writeUIScript(source: string, url: string): void {
  u8(Op.UIScript);
  text(source);
  text(url);
}

/** Loads the UI kernel the host ships, which must be the one `hash` names (native/shared/UIKernel.h). */
export function writeUIKernel(hash: string): void {
  u8(Op.UIKernel);
  text(hash);
}

/** Loads the app's UI bundle the host ships, which must be the one `hash` names (native/shared/UIKernel.h). */
export function writeUIBundle(hash: string, url: string): void {
  u8(Op.UIBundle);
  text(hash);
  text(url);
}

/** UI-thread operations as plain data (src/runtime/thread-wire.ts encodes what JSON could not hold). */
export function writeUI(operations: readonly unknown[]): void {
  u8(Op.UI);
  plain(operations, 'UI operations', 0);
}

/** Where the batch ends now, for `truncateBatch`. */
export function batchMark(): { length: number; strings: number } {
  return { length: wire.length, strings: wire.strings.length };
}

/** Drops what was written since `mark`: an aborted commit's records. */
export function truncateBatch(mark: { length: number; strings: number }): void {
  wire.length = mark.length;
  wire.strings.length = mark.strings;
}

/**
 * Sends the batch, with the UI-thread operations queued so far after the view
 * mutations they refer to, unless `withOperations` is false. Throws what the
 * host throws for a rejected batch, with the batch dropped and those
 * operations still queued.
 */
export function sendBatch(withOperations = true): void {
  const operations = withOperations ? appendOperations() : null;

  if (wire.length === 0) return;

  const { buffer, length, strings } = wire;

  wire.length = 0;
  wire.strings = [];
  globalThis.__kuitoHostCommit(buffer, length, strings);
  operationsSent(operations);
}

/**
 * Runs `work` with every write it makes sent once, when the outermost such
 * scope ends. A throw drops what the outermost scope wrote, as the host drops
 * a job that throws.
 */
export function holding<T>(work: () => T): T {
  const mark = batchMark();
  let result: T;

  wire.holding++;

  try {
    result = work();
  } catch (error) {
    if (wire.holding === 1) truncateBatch(mark);

    throw error;
  } finally {
    wire.holding--;
  }

  if (wire.holding === 0) sendBatch();

  return result;
}
