// The write log (docs/devtools.md#components-panel): with devtools, the
// kernel keeps the last writes of each component state signal for the
// panel's History.
import { show, signalRef } from './devtools-graph';
import type { HistoryEntry } from './devtools-protocol';
import type { AnySignal } from './signals';
import type { HookSlot } from './state/components';
import { devtools } from './state/devtools';
import { stateStore } from './state/modules';
import { signalBatch } from './state/signals';
import { own } from './values';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

/** Writes kept; older ones are dropped. */
const KEPT = 500;

/**
 * A module's `state()` signals. Tasks', motion values' and refs' are left
 * out: their writes come from what they run, not from the app.
 */
export function noteStates(module: string, hooks: Record<string, HookSlot>): void {
  if (!__KUITO_DEV__ || !signalBatch.causes) return;

  Object.keys(hooks).forEach((name) => {
    const slot = hooks[name];
    const key = module + ':' + slot.states[0];

    if (slot.kind === 'state' && own(stateStore, key)) devtools.states.add(stateStore[key]);
  });
}

/** Every signal write, with devtools (src/runtime/signals.ts); state signals' are kept. */
export function recordWrite(signal: AnySignal, value: unknown): void {
  if (!devtools.states.has(signal)) return;

  devtools.history.push({ index: devtools.writes++, signal, value });
  if (devtools.history.length > KEPT) devtools.history.shift();
}

export function history(): { writes: HistoryEntry[]; dropped: number } {
  return {
    writes: devtools.history.map(({ index, signal, value }) => {
      const { name, owner } = signalRef(signal);

      return { index, name, owner, value: show(value) };
    }),
    dropped: devtools.writes - devtools.history.length,
  };
}
