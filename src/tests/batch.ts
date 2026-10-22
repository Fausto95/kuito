// The kernel's batches as the shells decode and check them: Wire.h and
// ViewTable in the host's WebAssembly module (native/headless/BatchWasm.cpp).
import type { Native } from './wasm.ts';

/** One edit of a list's keys (docs/lists.md#keys). */
export interface KeyEdit {
  op: 'insert' | 'remove' | 'move';
  index: number;
  key: string;
}

/** A prop's value, typed by its manifest kind as native/shared/Mutation.h's Value. */
export type PropValue =
  | { type: 'null'; value: null }
  | { type: 'number'; value: number | null }
  | { type: 'boolean'; value: boolean }
  | { type: 'text' | 'json'; value: string }
  /** Its index among the prop's manifest values, and the value as written. */
  | { type: 'enum'; value: string; index: number }
  /** 0xRRGGBBAA. */
  | { type: 'color'; value: number }
  | { type: 'keys'; value: KeyEdit[] }
  /** A structured prop's value as the kernel wrote it, checked against its schema. */
  | { type: 'struct'; value: unknown };

/** One view mutation, as native/shared/Mutation.h has it; views by number, 0 the root. */
export type Mutation =
  | { op: 'create'; id: number; parent: number; kind: string; label: string; flattened: boolean }
  | { op: 'remove'; id: number }
  | { op: 'move'; id: number; parent: number; index: number }
  | { op: 'flatten'; id: number; flattened: boolean }
  | ({ op: 'prop'; id: number; name: string } & PropValue)
  | { op: 'command'; id: number; name: string; argument: string }
  /** The UI-thread operations, as plain data. */
  | { op: 'ui'; operations: unknown[] }
  | { op: 'uiScript'; source: string; url: string }
  /** Load the UI kernel the host ships, if it is the one `hash` names. */
  | { op: 'uiKernel'; hash: string }
  /** Load the app's UI bundle the host ships, if it is the one `hash` names. */
  | { op: 'uiBundle'; hash: string; url: string };

/** A recorded batch as a shell with no JS replays it. */
export interface ReplayBatch {
  /** When the runtime committed it, since it started. */
  ms: number;
  mutations: Mutation[];
}

const encoder = new TextEncoder();

/** `strings` as BatchWasm.cpp reads them: a count, then each length and its UTF-8. */
function packStrings(strings: readonly string[]): Uint8Array {
  const encoded = strings.map((text) => encoder.encode(text));
  const bytes = new Uint8Array(4 + encoded.reduce((total, text) => total + 4 + text.length, 0));
  const view = new DataView(bytes.buffer);
  let at = 4;

  view.setUint32(0, encoded.length, true);

  for (const text of encoded) {
    view.setUint32(at, text.length, true);
    bytes.set(text, at + 4);
    at += 4 + text.length;
  }

  return bytes;
}

// The module's JSON is its own output: it is trusted as these types.
function result<T>(native: Native, ok: number): T {
  const text = native.read(native.exports.resultPointer(), native.exports.resultLength());

  if (!ok) throw new Error(text);

  return JSON.parse(text) as T;
}

/**
 * A batch `__kuitoHostCommit` received, decoded and checked against every
 * batch `native` decoded before it. Throws the shell's message for a batch
 * a device would reject, and the views stay as they were.
 */
export function decodeBatch(
  native: Native,
  buffer: ArrayBuffer,
  length: number,
  strings: readonly string[],
): Mutation[] {
  return native.withBytes(new Uint8Array(buffer, 0, length), (bytes, size) =>
    native.withBytes(packStrings(strings), (packed, packedSize) =>
      result<Mutation[]>(native, native.exports.decode(bytes, size, packed, packedSize)),
    ),
  );
}

/** A `.krec` file's view batches, without the UI thread's (native/shared/Recording.h). */
export function replayBatches(native: Native, file: Uint8Array): ReplayBatch[] {
  return native.withBytes(file, (bytes, size) =>
    result<ReplayBatch[]>(native, native.exports.replay(bytes, size)),
  );
}
