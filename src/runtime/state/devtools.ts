// What the devtools see of the kernel.
import type { AnySignal } from '../signals';
import { dict } from '../values';

/** The Components panel's view of the kernel (src/runtime/devtools.ts). */
export interface DevtoolsState {
  connected: boolean;
  /** A sync of the tree is queued for the end of the task. */
  scheduled: boolean;
  /** The panel waits for a tap on the device to select a view. */
  inspecting: boolean;
  /** Component ids by instance key (`<module>:<path>`), stable while the instance lives. */
  ids: Record<string, number>;
  nextId: number;
  /** The tree the panel has, as JSON. */
  tree: string;
  /** Signal ids, given as the panel first sees each signal. */
  signalIds: WeakMap<object, number>;
  nextSignal: number;
  /** The shell highlights updated views: each update's cause crosses with it. */
  updates: boolean;
  /** The write behind each view prop's last update, while a panel or the highlighter watches. */
  causes: Map<number, Record<string, Cause>>;
  /** The `state()` signals whose writes the log keeps (src/runtime/write-log.ts). */
  states: WeakSet<object>;
  /** The last writes of state signals, oldest first, and how many were ever made. */
  history: { index: number; signal: AnySignal; value: unknown }[];
  writes: number;
}

/** A signal write, as the devtools name it: the signal and the value written. */
export interface Cause {
  signal: AnySignal;
  value: unknown;
}

export const devtools: DevtoolsState = {
  connected: false,
  scheduled: false,
  inspecting: false,
  ids: dict<number>(),
  nextId: 1,
  tree: '',
  signalIds: new WeakMap(),
  nextSignal: 1,
  updates: false,
  causes: new Map(),
  states: new WeakSet(),
  history: [],
  writes: 0,
};
