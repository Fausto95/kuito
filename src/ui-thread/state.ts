// The UI-thread kernel's one store. Every module reads and writes its state
// here; the JS-thread kernel's state lives in src/runtime/state/.
import type { Runner } from './animation';
import { eventBuffer } from '../runtime/event-records';
import { dict } from '../runtime/values';

/** What UI-thread code sees: `.value` reads track, writes notify. */
export interface MotionRef {
  value: unknown;
}

export interface MotionRecord {
  id: string;
  value: unknown;
  /** The last JS-thread write applied, so JS reads know when the mirror caught up. */
  js: number;
  ref: MotionRef;
  /** The JS thread never reads it: an exiting view's own prop values. */
  internal: boolean;
  /** The gesture field it follows, if any. */
  following: { gesture: number; field: string; home: unknown } | null;
  dependents: Set<Binding>;
  animation: Animating | null;
}

/** A motion value's animation; it starts on the first frame after it is set. */
export interface Animating {
  /** One runner for a number, one per channel for a color. */
  runners: Runner[];
  started: boolean;
  /** What it interrupted, which it may continue from (a spring's velocity). */
  previous: Runner[] | null;
}

/**
 * A value computed on the UI thread from motion values: a native prop, or a
 * motion value following another source (`write` sets it).
 */
export interface Binding {
  key: string;
  view: number;
  prop: string;
  evaluate: () => unknown;
  reads: Set<MotionRecord>;
  write: ((value: unknown) => void) | null;
}

export interface Handler {
  fn: (argument: unknown) => unknown;
  /** The event field passed instead of the event (a field's text), or fields passed as one object. */
  field: string | readonly string[] | null;
  /** The event goes on to the JS thread after it: the UI thread only follows it. */
  passes?: boolean;
}

export type Factory = (captures: unknown[]) => (...args: unknown[]) => unknown;

/** The UI functions being decoded, outermost first, each set once made: what `$r` names. */
export const making: Array<{ id: string; fn: ((...args: unknown[]) => unknown) | null }> = [];

export const motions = dict<MotionRecord>();
export const motionRefs = new WeakMap<object, MotionRecord>();
export const bindings = dict<Binding>();
export const handlers = dict<Handler>();
export const functions = dict<Factory>();
/** Functions the latest UI bundle defined; a `sweep` drops the rest. */
export const defined = new Set<string>();
/** Dev builds: where each UI function is in the app, `file:line:column`, by id. */
export const locations = dict<string>();
/** Dev builds: the id of the UI function each decoded function was made from. */
export const madeFrom = new WeakMap<object, string>();
/** The motion values following each gesture, by the gesture's id. */
export const gestureFollowers = new Map<number, Set<MotionRecord>>();
/** Motion values the JS thread follows: a JS-thread binding reads them. */
export const watched = new Set<string>();

export const pending = {
  /** Bindings to run: one of the motion values they read changed. */
  dirty: new Set<Binding>(),
  /** Motion values to mirror to the JS thread. */
  changed: new Set<MotionRecord>(),
  /** Of those, the ones UI-thread code wrote: watchers on the JS thread hear of these. */
  movedHere: new Set<MotionRecord>(),
  /** Watched values moved here since the last frame, the latest of each, encoded for the JS thread. */
  forJs: new Map<string, unknown>(),
  /** What each binding that ran moved this flush: how a cycle is found. */
  moves: new Map<Binding, Set<MotionRecord>>(),
  /** Native props to write, last write per prop. */
  props: new Map<number, Map<string, unknown>>(),
  /** Work for once the props are written: letting exited views go. */
  afterFlush: [] as Array<() => void>,
};

export const tracking: { reading: Binding | null } = { reading: null };

/** Motion values with an animation running. */
export const animating = new Set<MotionRecord>();

/** The user's motion preference, as the JS thread reports it. */
export const motionSettings = { reduceMotion: false };

/**
 * Dev builds: the app code's UI-thread time in the frame being built
 * (budget.ts). `start` is when its first entry began; `costs` holds each piece
 * of app code's share.
 */
export const frameTime = {
  start: -Infinity,
  depth: 0,
  /** What the app code running now spent so far in the app code it called. */
  called: 0,
  reported: false,
  /** By place in the app, or by what it is to its view when its place is unknown. */
  costs: new Map<string, { what: string; place: string | undefined; ms: number }>(),
};

/** What the UI kernel did, counted since it loaded: a shell reads it after each call. */
export const work = {
  /** JSON it parsed: a module view's event payloads a handler here took. */
  jsonParses: 0,
};

/** The reusable record a typed event's numbers arrive in (docs/events.md#typed-events). */
export const eventNumbers = eventBuffer();

/** `json` parsed, counted as having crossed into the UI kernel. */
export function parseJson(json: string): unknown {
  work.jsonParses++;

  return JSON.parse(json);
}

/** Dev builds: the places a frame over budget was blamed on, reported once each. */
export const overBudget = new Set<string>();

export function clearState(): void {
  [motions, bindings, handlers].forEach((store: Record<string, unknown>) => {
    Object.keys(store).forEach((key) => {
      delete store[key];
    });
  });

  watched.clear();
  overBudget.clear();
  gestureFollowers.clear();
  animating.clear();
  pending.dirty.clear();
  pending.changed.clear();
  pending.movedHere.clear();
  pending.moves.clear();
  pending.forJs.clear();
  pending.props.clear();
  pending.afterFlush.length = 0;
}
