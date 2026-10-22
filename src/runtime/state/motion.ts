// Motion values as the JS thread knows them.
import type { Signal } from '../signals';
import { dict } from '../values';

/** What app code holds: `.value` reads and writes from the JS thread. */
export interface MotionHandle {
  value: unknown;
  follows(source: unknown): MotionHandle;
  map(fn: unknown): unknown;
}

/** What a motion value follows: a gesture's field, or another source. */
export type Following = { gesture: number; field: string } | { source: unknown } | null;

/**
 * A motion value as the JS thread knows it. The UI thread owns the value; the
 * JS thread keeps its own last write, numbered, until the mirror catches up.
 */
export interface MotionRecord {
  id: string;
  handle: MotionHandle;
  value: unknown;
  version: number;
  /** Ticks when the value changes, for JS-thread bindings that read it. */
  changed: Signal<number>;
  ticks: number;
  watched: boolean;
  /** Its first value: where a gesture's release takes it back. */
  home: unknown;
  following: Following;
  /** Without a UI runtime: stops the JS thread following its source. */
  unfollow: (() => void) | null;
  /** A value the platform writes: what starts it, the first time the app uses it. */
  start: (() => void) | null;
}

export const motions = dict<MotionRecord>();

export const motionHandles = new WeakMap<object, MotionRecord>();
export const motionSignals = new WeakSet<object>();
