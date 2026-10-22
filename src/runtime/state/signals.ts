// The reactive graph: signal nodes, the write batch and what is being
// tracked now.
import type { ReactiveNode } from '../reactive-graph';
import type { AnySignal } from '../signals';
import type { RenderingContext } from './components';
import type { Cause } from './devtools';
import type { MotionRecord } from './motion';

/** Each signal's, computed's and platform source's node in the graph (src/runtime/reactive-graph.ts). */
export const signalNodes = new WeakMap<object, ReactiveNode>();

/** The variable each signal was declared as, which the compiler passes to state(). */
export const signalNames = new WeakMap<object, string>();

/**
 * Signal writes in progress (src/runtime/signals.ts): the watchers due once
 * the outermost write ends.
 */
export const signalBatch: {
  depth: number;
  /** A write outside any batch scheduled the flush that ends it. */
  scheduled: boolean;
  /**
   * Queued watchers, each once, in the order they were first queued, in
   * the first `queued` slots (src/runtime/reactive-graph.ts).
   */
  pending: (ReactiveNode | null)[];
  queued: number;
  /** The slots the last round drained, kept for the next: a flush allocates none. */
  spare: (ReactiveNode | null)[];
  /**
   * With devtools (src/runtime/update-causes.ts): the write each pending
   * watcher runs for, and the write being made. Null without them.
   */
  causes: Map<object, Cause> | null;
  writing: Cause | null;
  /** With devtools: hears every write, for the write log (src/runtime/write-log.ts). */
  onWrite: ((signal: AnySignal, value: unknown) => void) | null;
} = {
  depth: 0,
  scheduled: false,
  pending: [],
  queued: 0,
  spare: [],
  causes: null,
  writing: null,
  onWrite: null,
};

export const tracking: {
  /** Signals read by the expression being tracked into a list (readTracked). */
  collecting: Set<AnySignal> | null;
  /** The computed or watcher running now, which links what it reads (src/runtime/reactive-graph.ts). */
  sub: ReactiveNode | null;
  /** Runs started, so each has its own number. */
  runs: number;
  /** Motion values read by the expression being tracked. */
  motions: Set<MotionRecord> | null;
  rendering: RenderingContext | null;
  /** With devtools: the signal write the running listener or re-plan follows. */
  cause: Cause | null;
} = { collecting: null, sub: null, runs: 0, motions: null, rendering: null, cause: null };
