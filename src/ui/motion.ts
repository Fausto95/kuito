import type { Animation } from '../runtime/animation-specs';
import type { Derived, Readable } from '../runtime/derived';
import type { GestureSource } from '../runtime/gesture-specs';

export { clamp, interpolate } from '../runtime/derived';
export type { Derived, Extrapolate, InterpolateOptions } from '../runtime/derived';

/**
 * A value that moves every frame: scroll offsets, gestures, animations.
 *
 * Read and write `.value` anywhere. Props and handlers that use a motion value
 * run on the UI thread when the compiler can place them there, so moving it
 * never waits for JavaScript and never re-renders a component. Use `signal()`
 * for values components react to.
 */
export interface Motion<T> {
  get value(): T;
  /** A value moves there now; an animation (timing, spring, decay, ...) moves it there. */
  set value(next: T | Animation<T>);
  /**
   * Moves with `source` on the UI thread, with no code: a gesture's field
   * (`drag.x`), another motion value or a derived one. Null stops it.
   */
  follows(source: GestureSource | Readable<T> | null): this;
  /** A value computed from this one, on the UI thread. */
  map<U>(fn: (value: T) => U): Derived<U>;
}

/**
 * Create an instance-local motion value during component initialization.
 * In a native module's spec, `motion<T>()` declares one the platform writes
 * (docs/native-modules.md#motion-values).
 */
export function motion<T>(): Motion<T | null>;
export function motion<T>(initial: T, name?: string): Motion<T>;

export function motion<T>(initial?: T, name?: string): Motion<T | undefined> {
  if (!globalThis.__kuito) throw new Error('motion() must run inside a Kuito component');

  return globalThis.__kuito.useMotion(initial, name);
}

/**
 * What a Scroll or a List moves as it scrolls, every frame on the UI thread
 * (docs/motion.md#motion-sources). Only the view writes them: follow them,
 * map them or bind props to them.
 */
export interface ScrollMotion {
  /** Points along the view's axis from the start of its content, within its scroll range. */
  readonly offset: Motion<number>;
  /** Points per second toward the content's end; 0 once it has been still for 1/30 s, and for a first move from rest. */
  readonly velocity: Motion<number>;
  /** Points pulled past an end, negative before the start; 0 within the range. */
  readonly overscroll: Motion<number>;
}

/**
 * What a Sheet moves as it is dragged and snaps, every frame on the UI
 * thread (docs/motion.md#motion-sources).
 */
export interface SheetMotion {
  /** Points the sheet stands over the screen's bottom. */
  readonly height: Motion<number>;
  /** Where that is between its lowest snap point (0) and its highest (1); below 0 dragged toward closing. */
  readonly progress: Motion<number>;
}

/** Create, during component initialization, the motion values a Sheet moves; give it to one Sheet's `motion` prop. */
export function sheetMotion(name?: string): SheetMotion {
  if (!globalThis.__kuito) throw new Error('sheetMotion() must run inside a Kuito component');

  return globalThis.__kuito.useMotionSource('Sheet', name);
}

/**
 * Create, during component initialization, the motion values a Scroll or a
 * List moves as it scrolls; give it to one view's `motion` prop.
 *
 *   const feed = scrollMotion();
 *   <Box opacity={interpolate(feed.offset, [0, 120], [1, 0])} />
 *   <Scroll motion={feed}>…</Scroll>
 */
export function scrollMotion(name?: string): ScrollMotion {
  if (!globalThis.__kuito) throw new Error('scrollMotion() must run inside a Kuito component');

  return globalThis.__kuito.useMotionSource('Scroll', name);
}
