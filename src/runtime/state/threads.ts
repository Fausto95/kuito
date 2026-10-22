// What crosses to the UI thread: compiler tags, remotes and the ids plans
// hold.
import type { Signal } from '../signals';
import { type AnyFunction, type PlainData, dict } from '../values';

/** A remote a plan points at its site's new function once it commits. */
export interface Rebind {
  id: number;
  fn: AnyFunction;
}

/** A compiler tag: the UI copy's id, the lazy captures, each capture's path and uses. */
export interface ThreadTag {
  id: string;
  captures: () => unknown;
  uses: unknown[];
}

export const threadTags = new WeakMap<object, ThreadTag>();
export const threadRejections = new WeakMap<object, string>();

/**
 * The app's UI bundle: its source, or, in a release build, the SHA-1 of the
 * source of the one its shell ships as bytecode.
 */
export type UIBundle = { source: string } | { hash: string };

/** A JS-thread function the UI thread calls by id; `site` is the gesture callback site it serves. */
export interface Remote {
  fn: AnyFunction;
  receiver: unknown;
  site: string | null;
}

/**
 * The ids a module's committed plan encoded for the UI thread. A remote or
 * signal lives while some module holds it (`threads.users`). Each branch
 * owner's ids are counted apart from the rest, so an id may appear more than
 * once; a re-planned branch trades exactly its own.
 */
export interface HeldIds {
  remotes: number[];
  signals: number[];
}

export const threads: {
  /** Operations for the UI runtime, sent with the next host batch. */
  queue: PlainData[];
  /** A task's end will send the queued operations. */
  scheduled: boolean;
  started: boolean;
  /** `url` names the bundle's script for DevTools. */
  bundle: { ui: UIBundle; revision: number; url: string };
  sentRevision: number;
  nextMotion: number;
  remotes: Map<number, Remote>;
  remoteIds: Map<AnyFunction, number>;
  /** The remote each gesture callback site calls, by `<gesture tag>:<callback>:<index>`. */
  remoteSites: Record<string, number>;
  signals: Map<number, Signal<unknown>>;
  signalIds: Map<object, number>;
  /** Ids ever given out, so neither kind of id is reused for another value. */
  next: { remote: number; signal: number };
  /** How many modules hold each id, by `r<id>` and `s<id>`. */
  users: Map<string, number>;
  /** What the plan being built encodes, which its module holds once it commits; `nested` is its branches'. */
  claiming: { remotes: Set<number>; signals: Set<number>; nested: HeldIds[] } | null;
  warned: Record<string, true>;
  /** Props each view has bound on the UI thread. */
  boundProps: Map<number, Record<string, true>>;
} = {
  queue: [],
  scheduled: false,
  started: false,
  bundle: { ui: { source: '' }, revision: 0, url: '' },
  sentRevision: 0,
  nextMotion: 0,
  remotes: new Map(),
  remoteIds: new Map(),
  remoteSites: dict<number>(),
  signals: new Map(),
  signalIds: new Map(),
  next: { remote: 0, signal: 0 },
  users: new Map(),
  claiming: null,
  warned: dict<true>(),
  boundProps: new Map(),
};
