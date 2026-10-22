// The host batch being written, the commit it carries, and the record
// typed events arrive in.
import { eventBuffer } from '../event-records';

/** The reusable record a typed event's numbers arrive in (docs/events.md#typed-events). */
export const eventNumbers = eventBuffer();

/**
 * The commit batch open on the host (src/runtime/transaction.ts): how to undo
 * what it changed in kernel state, the keys of each store it journaled, and
 * what waits until it lands.
 */
export const commit: {
  open: boolean;
  undo: (() => void)[];
  journaled: Map<object, Set<unknown>>;
  landed: (() => void)[];
} = {
  open: false,
  undo: [],
  journaled: new Map(),
  landed: [],
};

/**
 * The host batch being written (src/runtime/wire.ts): records in `buffer`'s
 * first `length` bytes, naming `strings` by index. `holding` counts the scopes
 * that send it when they end; a write outside every scope sends it at once.
 */
export const wire: {
  buffer: ArrayBuffer;
  view: DataView;
  length: number;
  strings: string[];
  holding: number;
} = (() => {
  const buffer = new ArrayBuffer(16384);

  return { buffer, view: new DataView(buffer), length: 0, strings: [], holding: 0 };
})();
