/*
 * The graph signals notify through (docs/reactivity.md#how-updates-flow):
 * each read a reader depends on is one link, threaded on two intrusive
 * doubly linked lists, the source's readers and the reader's sources. A
 * reader that runs again walks its sources in read order and reuses each
 * link it meets, so a re-run that reads what it read before allocates
 * nothing, and a write walks its readers without copying them.
 *
 * The design follows alien-signals (https://github.com/stackblitz/alien-signals,
 * src/system.ts), MIT License, Copyright (c) 2024-present Johnson Chu.
 * Kuito's own: a link joins its source's readers only once the run that
 * made it has ended, and only while its reader is
 * watched; a computed nobody watches holds its sources but is not held by
 * them.
 */
import type { AnySignal } from './signals';
import { signalBatch, signalNodes, tracking } from './state/signals';
import { stats } from './state/stats';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

export const SIGNAL = 0;
export const COMPUTED = 1;
export const SOURCE = 2;
export const WATCHER = 3;

type NodeKind = typeof SIGNAL | typeof COMPUTED | typeof SOURCE | typeof WATCHER;

/** A computed is invalidated: a source changed since it last ran. */
export const STALE = 1;
/** A computed runs now: reading it again is a cycle. */
export const RUNNING = 1 << 1;
/** A computed has a value. */
export const COMPUTED_ONCE = 1 << 2;
/** A computed's last run threw: the next read runs it again. */
export const FAILED = 1 << 3;

/** A watcher is queued for the end of the batch. */
const QUEUED = 1 << 4;
/** A watcher's signal or source was written. */
const DIRTY = 1 << 5;
/** A computed a watcher reads was invalidated: it runs if its value changed. */
const PENDING = 1 << 6;
/** What the round of the flush running now owes the watcher: DIRTY and PENDING, moved. */
const DUE_DIRTY = 1 << 7;
const DUE_PENDING = 1 << 8;
/** A reader's links join their sources once its run has ended: some are not joined yet. */
const UNJOINED = 1 << 9;
/** A watcher that stopped: queued, it does not run. */
const DISPOSED = 1 << 10;
/** A reader's run read its sources in another order than the last. */
const REORDERED = 1 << 11;

/** A signal, computed, platform source or watcher: one shape for all, so reads stay monomorphic. */
export interface ReactiveNode {
  kind: NodeKind;
  flags: number;
  /** Counts the changes of its value. */
  version: number;
  /** Its readers, in the order they subscribed: the links `joined` its source's list. */
  subs: Link | null;
  subsTail: Link | null;
  subCount: number;
  /** What it read in its last run, in read order. */
  deps: Link | null;
  /** The last source its running run read: what follows it is not read yet. */
  depsTail: Link | null;
  /** The run that last read it: a second read in one run links once. */
  linkedRun: number;
  /** The run in progress, a number no other run has. */
  run: number;
  /** What app code holds: the signal, computed or source. Null for a watcher. */
  handle: AnySignal | null;
  /** A computed's or source's version made current (a computed runs if a source changed). */
  refresh: ((node: ReactiveNode) => void) | null;
  /** Its first reader came, its last went. */
  watch: ((node: ReactiveNode) => void) | null;
  unwatch: ((node: ReactiveNode) => void) | null;
  /** A watcher's work, when what it reads changed. */
  effect: ((node: ReactiveNode) => void) | null;
}

export interface Link {
  dep: ReactiveNode;
  sub: ReactiveNode;
  prevSub: Link | null;
  nextSub: Link | null;
  prevDep: Link | null;
  nextDep: Link | null;
  /** The source's version when its reader last read it. */
  seen: number;
  /** In its source's readers: the source notifies it. */
  joined: boolean;
}

export function makeNode(kind: NodeKind): ReactiveNode {
  return {
    kind,
    flags: 0,
    version: 0,
    subs: null,
    subsTail: null,
    subCount: 0,
    deps: null,
    depsTail: null,
    linkedRun: 0,
    run: 0,
    handle: null,
    refresh: null,
    watch: null,
    unwatch: null,
    effect: null,
  };
}

/** A watcher runs `effect` once per batch in which something it reads changed. */
export function makeWatcher(effect: (node: ReactiveNode) => void): ReactiveNode {
  const node = makeNode(WATCHER);

  node.effect = effect;

  return node;
}

const watched = (node: ReactiveNode) =>
  node.kind === WATCHER ? (node.flags & DISPOSED) === 0 : node.subCount > 0;

// --- Runs ---------------------------------------------------------------------

/** `sub` starts a run: it reads its sources again, from the first. */
export function startRun(sub: ReactiveNode): void {
  sub.run = ++tracking.runs;
  sub.depsTail = null;
}

/** The running reader `sub` read `dep`: the link it had for that read, or a new one. */
export function link(dep: ReactiveNode, sub: ReactiveNode, refreshSeen: boolean): void {
  const prev = sub.depsTail;

  if (prev !== null && prev.dep === dep) return;
  if (dep.linkedRun === sub.run) return;

  // Runs are numbered as they start, so a later number is a run nested in
  // this one: it read `dep` after this run may have. Only then is the
  // rare walk back over what this run read needed.
  const nested = dep.linkedRun > sub.run;

  dep.linkedRun = sub.run;

  if (nested)
    for (let each = prev; each !== null; each = each.prevDep) if (each.dep === dep) return;

  const next = prev === null ? sub.deps : prev.nextDep;
  let found = next;

  while (found !== null && found.dep !== dep) found = found.nextDep;

  if (found !== null) {
    // Read in another order: it keeps its place among its source's readers.
    if (found !== next) {
      unthreadDep(found);
      threadDep(found, prev, next);
      sub.flags |= REORDERED;
    }

    if (refreshSeen) found.seen = dep.version;
    sub.depsTail = found;

    return;
  }

  const made: Link = {
    dep,
    sub,
    prevSub: null,
    nextSub: null,
    prevDep: null,
    nextDep: null,
    seen: dep.version,
    joined: false,
  };

  threadDep(made, prev, next);
  sub.depsTail = made;
  sub.flags |= UNJOINED;
}

/** What `sub` just read of `dep`, once the read returned: the version it now holds. */
export function saw(sub: ReactiveNode, dep: ReactiveNode): void {
  const last = sub.depsTail;

  if (last !== null && last.dep === dep) last.seen = dep.version;
}

function threadDep(link: Link, prev: Link | null, next: Link | null): void {
  const sub = link.sub;

  link.prevDep = prev;
  link.nextDep = next;

  if (prev === null) sub.deps = link;
  else prev.nextDep = link;

  if (next !== null) next.prevDep = link;
}

function unthreadDep(link: Link): void {
  const { prevDep, nextDep, sub } = link;

  if (prevDep === null) sub.deps = nextDep;
  else prevDep.nextDep = nextDep;

  if (nextDep !== null) nextDep.prevDep = prevDep;

  link.prevDep = null;
  link.nextDep = null;
}

/**
 * `sub`'s run ended: the sources it no longer read let it go, then the
 * ones it read for the first time take it, in read order, if it is watched.
 * `keep` drops a link it read but must not follow. Whether its sources
 * changed.
 */
export function endRun(sub: ReactiveNode, keep?: (dep: ReactiveNode) => boolean): boolean {
  const tail = sub.depsTail;
  let stale = tail === null ? sub.deps : tail.nextDep;
  let changed = (sub.flags & (UNJOINED | REORDERED)) !== 0;

  sub.flags &= ~REORDERED;

  if (tail === null) sub.deps = null;
  else tail.nextDep = null;

  while (stale !== null) {
    const next = stale.nextDep;

    leave(stale);
    stale = next;
    changed = true;
  }

  if (keep) {
    for (let each = sub.deps; each !== null;) {
      const next = each.nextDep;

      if (!keep(each.dep)) {
        if (sub.depsTail === each) sub.depsTail = each.prevDep;
        unthreadDep(each);
        leave(each);
        changed = true;
      }

      each = next;
    }
  }

  if (sub.flags & UNJOINED && watched(sub)) joinAll(sub);

  return changed;
}

function joinAll(sub: ReactiveNode): void {
  for (let each = sub.deps; each !== null; each = each.nextDep) if (!each.joined) join(each);

  // Cleared last: a computed's first read that throws while it joins leaves the rest to join next time.
  sub.flags &= ~UNJOINED;
}

/** The link joins its source's readers; a source's first reader watches it. */
function join(link: Link): void {
  const dep = link.dep;

  if (dep.subCount === 0) dep.watch?.(dep);
  // A stale computed's version is not yet the one its new reader will see.
  else if (dep.flags & STALE) dep.refresh?.(dep);

  link.prevSub = dep.subsTail;
  link.nextSub = null;

  if (dep.subsTail === null) dep.subs = link;
  else dep.subsTail.nextSub = link;

  dep.subsTail = link;
  dep.subCount++;
  link.joined = true;
  // What the reader saw is what the source holds once it is watched.
  link.seen = dep.version;
  stats.total.subscriptionsCreated++;
}

/** The link leaves its source's readers, if it had joined them; a source's last reader lets it go. */
function leave(link: Link): void {
  if (!link.joined) return;

  const { dep, prevSub, nextSub } = link;

  if (prevSub === null) dep.subs = nextSub;
  else prevSub.nextSub = nextSub;

  if (nextSub === null) dep.subsTail = prevSub;
  else nextSub.prevSub = prevSub;

  link.prevSub = null;
  link.nextSub = null;
  link.joined = false;
  dep.subCount--;
  stats.total.subscriptionsDestroyed++;

  if (dep.subCount === 0) dep.unwatch?.(dep);
}

/** A computed gained its first reader: it follows its sources. */
export function holdSources(node: ReactiveNode): void {
  node.flags |= UNJOINED;
  joinAll(node);
}

/** A computed lost its last reader: its sources no longer hold it, though it still reads them. */
export function releaseSources(node: ReactiveNode): void {
  for (let each = node.deps; each !== null; each = each.nextDep) leave(each);
  node.flags |= UNJOINED;
}

/** Every source `sub` reads lets it go, and it forgets them. */
export function unlinkAll(sub: ReactiveNode): void {
  let each = sub.deps;

  sub.deps = null;
  sub.depsTail = null;
  sub.flags &= ~UNJOINED;

  while (each !== null) {
    const next = each.nextDep;

    leave(each);
    each.prevDep = null;
    each.nextDep = null;
    each = next;
  }
}

/** The watcher stops: it lets go of its sources, and a run it was queued for does not happen. */
export function dispose(watcher: ReactiveNode): void {
  if (watcher.flags & DISPOSED) return;

  watcher.flags |= DISPOSED;
  unlinkAll(watcher);
}

/** The signals `sub` follows, in read order. */
export function signalsOf(sub: ReactiveNode): AnySignal[] {
  const signals: AnySignal[] = [];

  for (let each = sub.deps; each !== null; each = each.nextDep)
    if (each.dep.handle) signals.push(each.dep.handle);

  return signals;
}

/** Whether `sub` follows `signal`. */
export function followsSignal(sub: ReactiveNode, signal: AnySignal): boolean {
  for (let each = sub.deps; each !== null; each = each.nextDep)
    if (each.dep.handle === signal) return true;

  return false;
}

/**
 * The watcher follows exactly `deps`, in that order: a source it already
 * followed keeps its place among that source's readers and what it saw of
 * it, unless nothing is queued for it.
 */
export function followExactly(watcher: ReactiveNode, signals: readonly AnySignal[]): void {
  const refreshSeen = (watcher.flags & QUEUED) === 0;

  startRun(watcher);
  signals.forEach((signal) => link(nodeOf(signal), watcher, refreshSeen));
  endRun(watcher);
}

export function nodeOf(signal: AnySignal): ReactiveNode {
  const node = signalNodes.get(signal);

  if (!node) throw new TypeError('Only a Kuito signal, computed or source can be followed');

  return node;
}

/** Whether a source of `sub` changed since `sub` last saw it: a computed among them runs to know. */
export function sourcesChanged(sub: ReactiveNode): boolean {
  for (let each = sub.deps; each !== null; each = each.nextDep) {
    const dep = each.dep;

    dep.refresh?.(dep);
    if (dep.version !== each.seen) return true;
  }

  return false;
}

// --- Writes -------------------------------------------------------------------

/** `node`'s value changed: computeds that read it are stale at once, watchers queue. */
export function propagate(node: ReactiveNode): void {
  for (let each = node.subs; each !== null; each = each.nextSub) {
    const sub = each.sub;

    if (sub.kind === COMPUTED) invalidate(sub);
    else queue(sub, DIRTY);
  }
}

/** Glitch-free: a read right after the write, and whatever the batch runs, runs it again. */
function invalidate(node: ReactiveNode): void {
  if (node.flags & STALE) return;

  node.flags |= STALE;

  for (let each = node.subs; each !== null; each = each.nextSub) {
    const sub = each.sub;

    if (sub.kind === COMPUTED) invalidate(sub);
    else queue(sub, PENDING);
  }
}

/** Queued twice in a batch, a watcher runs once. */
function queue(watcher: ReactiveNode, why: number): void {
  watcher.flags |= why;

  const { causes, writing: cause } = signalBatch;

  if (__KUITO_DEV__ && causes && cause && !causes.has(watcher)) causes.set(watcher, cause);

  if (watcher.flags & QUEUED) return;

  watcher.flags |= QUEUED;
  signalBatch.pending[signalBatch.queued++] = watcher;
}

/**
 * The watchers queued now, each once; one queued again while they run waits
 * for the next round. `run` runs each whose sources did change.
 */
export function drainRound(run: (watcher: ReactiveNode) => void): void {
  const due = signalBatch.pending;
  const count = signalBatch.queued;

  signalBatch.pending = signalBatch.spare;
  signalBatch.queued = 0;

  // Index loops over slots that are cleared, never truncated: an engine may
  // give a truncated array's storage back, and growing it again allocates.
  for (let index = 0; index < count; index++) {
    const watcher = due[index];

    if (watcher) {
      const why = watcher.flags & (DIRTY | PENDING);

      watcher.flags = (watcher.flags & ~(QUEUED | DIRTY | PENDING)) | (why << 2);
    }
  }

  try {
    for (let index = 0; index < count; index++) {
      const watcher = due[index];

      if (watcher) run(watcher);
    }
  } finally {
    for (let index = 0; index < count; index++) {
      const watcher = due[index];

      if (watcher) watcher.flags &= ~(DUE_DIRTY | DUE_PENDING);
      due[index] = null;
    }

    signalBatch.spare = due;
  }
}

/**
 * Whether the round owes `watcher` a run: one of its signals was written,
 * or a computed it reads now holds another value than it last saw.
 */
export function owed(watcher: ReactiveNode): boolean {
  const due = watcher.flags & (DUE_DIRTY | DUE_PENDING);

  if (watcher.flags & DISPOSED || !due) return false;

  let changed = (due & DUE_DIRTY) !== 0;

  // Every computed it reads is brought up to what it sees now, even when a
  // written signal decides the run: the next check compares against it.
  for (let each = watcher.deps; each !== null; each = each.nextDep) {
    const dep = each.dep;

    if (dep.kind !== COMPUTED) continue;

    if (dep.flags & STALE && !refreshed(dep)) {
      changed = true;
      continue;
    }

    if (dep.version !== each.seen) changed = true;
    each.seen = dep.version;
  }

  return changed;
}

/**
 * Whether a stale computed ran again without throwing. One that throws owes
 * its reader a run: the reader reads it there and the error is reported
 * with the reader's, instead of ending the flush.
 */
function refreshed(dep: ReactiveNode): boolean {
  try {
    dep.refresh?.(dep);

    return true;
  } catch {
    return false;
  }
}
