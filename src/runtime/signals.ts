import { reportError } from './errors';
import {
  COMPUTED,
  COMPUTED_ONCE,
  FAILED,
  RUNNING,
  SIGNAL,
  SOURCE,
  STALE,
  dispose,
  drainRound,
  endRun,
  holdSources,
  link,
  makeNode,
  makeWatcher,
  owed,
  propagate,
  releaseSources,
  saw,
  sourcesChanged,
  startRun,
  type ReactiveNode,
} from './reactive-graph';
import { signalBatch, signalNodes, tracking } from './state/signals';
import { stats } from './state/stats';
import { holding } from './wire';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

export interface Signal<T = unknown> {
  value: T;
  /** Counts the changes of its value: a computed compares it to know it is current. */
  readonly version: number;
  readonly listenerCount: number;
  subscribe(listener: (value: T) => void): () => void;
}

/** Any signal, whatever its value type: what tracking and subscriptions hold. */
export interface AnySignal {
  readonly value: unknown;
  readonly version: number;
  readonly listenerCount: number;
  subscribe(listener: (value: unknown) => void): () => void;
}

export function isSignal(value: unknown): value is AnySignal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'subscribe' in value &&
    typeof value.subscribe === 'function'
  );
}

/**
 * A signal as an app hands one over: any object whose `value` is a getter.
 * Kernel signals, computeds and a module's own signals all are; plain data
 * never is. Reading its value tracks the kernel signals behind it.
 */
export function isSignalLike(value: unknown): value is { readonly value: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Object.getOwnPropertyDescriptor(value, 'value')?.get === 'function'
  );
}

/** Whether app code may write it: a signal, not a computed or a platform's read-only state. */
export function isWritable(signal: object): signal is { value: unknown } {
  return typeof Object.getOwnPropertyDescriptor(signal, 'value')?.set === 'function';
}

/** A value derived from signals, read like one and never written. */
export interface Computed<T = unknown> {
  readonly value: T;
  readonly version: number;
  readonly listenerCount: number;
  subscribe(listener: (value: T) => void): () => void;
}

/**
 * `node` was read: the running computed or watcher links it, a tracked
 * expression lists it. The link sees its version once `read` returns it.
 */
function tracked<T>(node: ReactiveNode, signal: AnySignal, read: () => T): T {
  const sub = tracking.sub;

  if (sub === null) {
    tracking.collecting?.add(signal);

    return read();
  }

  // Linked before the read: a reader of a computed that throws still follows it.
  link(node, sub, true);

  const value = read();

  saw(sub, node);

  return value;
}

export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const node = makeNode(SIGNAL);
  const read = () => value;
  const signal: Signal<T> = {
    get value() {
      return tracked(node, signal, read);
    },
    set value(next) {
      if (Object.is(next, value)) return;

      value = next;
      written(node, signal, next);
    },
    get version() {
      return node.version;
    },
    subscribe: (listener) => subscribe(node, () => listener(value)),
    get listenerCount() {
      return node.subCount;
    },
  };

  register(node, signal);

  return signal;
}

function register(node: ReactiveNode, signal: AnySignal): void {
  node.handle = signal;
  signalNodes.set(signal, node);
}

/** `listener` runs once per batch in which `node` changed, until the returned stop. */
function subscribe(node: ReactiveNode, listener: () => void): () => void {
  const watcher = makeWatcher(listener);

  startRun(watcher);
  link(node, watcher, true);
  endRun(watcher);

  return () => dispose(watcher);
}

/** `node` holds a new value: its readers learn it, with devtools along with the write behind it. */
function written(node: ReactiveNode, signal: AnySignal, value: unknown): void {
  node.version++;

  if (__KUITO_DEV__ && signalBatch.causes) {
    const outer = signalBatch.writing;

    signalBatch.writing = { signal, value };
    signalBatch.onWrite?.(signal, value);

    try {
      propagate(node);
    } finally {
      signalBatch.writing = outer;
    }
  } else propagate(node);

  if (signalBatch.depth === 0) scheduleFlush();
}

/**
 * A value computed from the signals `fn` reads: lazy (nothing runs before a
 * read), memoized (it runs again only once one of them changed) and tracked
 * (a read inside a binding depends on it). Glitch-free: a write marks it
 * stale at once, so a watcher the batch runs never sees it lag behind the
 * signals it derives from. It holds its sources only while it has readers.
 */
export function computed<T>(fn: () => T): Computed<T> {
  let value: T | undefined;
  const node = makeNode(COMPUTED);

  function current(): T {
    if (node.flags & RUNNING)
      throw new Error('A computed reads itself: its function reads its own value.');

    const ran = node.flags & COMPUTED_ONCE && !(node.flags & FAILED);

    // Watched and not invalidated, its sources are as it last read them.
    if (ran && node.subCount > 0 && !(node.flags & STALE)) return value as never;

    node.flags &= ~STALE;
    node.flags |= RUNNING;

    let next: T;

    try {
      // A source that throws here fails this computed too, until it runs.
      if (ran && !sourcesChanged(node)) return value as never;

      next = readInto(node, fn);
    } catch (error) {
      node.flags |= FAILED;

      throw error;
    } finally {
      node.flags &= ~RUNNING;
    }

    if (!(node.flags & COMPUTED_ONCE) || !Object.is(next, value)) node.version++;

    value = next;
    node.flags = (node.flags | COMPUTED_ONCE) & ~FAILED;
    // Last: a source that fails to start observing leaves the value it ran to.
    endRun(node);

    return next;
  }

  node.refresh = current;

  node.watch = () => {
    current();
    holdSources(node);
  };

  node.unwatch = releaseSources;

  const self: Computed<T> = {
    get value() {
      return tracked(node, self, current);
    },
    get version() {
      current();

      return node.version;
    },
    subscribe: (listener) => subscribe(node, () => listener(current())),
    get listenerCount() {
      return node.subCount;
    },
  };

  register(node, self);

  return self;
}

/** Evaluate `expression` as `sub`'s run: it links what it reads. The caller ends the run (endRun). */
export function readInto<T>(sub: ReactiveNode, expression: () => T): T {
  const outerSub = tracking.sub;
  const outerCollecting = tracking.collecting;

  startRun(sub);
  tracking.sub = sub;
  tracking.collecting = null;
  stats.total.thunkEvaluations++;

  try {
    return expression();
  } finally {
    tracking.sub = outerSub;
    tracking.collecting = outerCollecting;
  }
}

const endBatch = () => {};
const flushScheduled = () => batch(endBatch);
const runScheduled = () => {
  signalBatch.scheduled = false;
  holding(flushScheduled);
};

/**
 * A write outside any batch (code after an `await`, a timer) opens one that
 * ends on the next microtask: every write until then reaches its readers
 * once, and the host in one batch. App code never batches by hand.
 */
function scheduleFlush(): void {
  if (signalBatch.scheduled) return;

  signalBatch.scheduled = true;
  void Promise.resolve().then(runScheduled);
}

/**
 * Run `write`, then run each watcher of the signals it wrote once, after
 * the outermost batch ends: a watcher of two written signals sees both
 * values. A watcher that throws is reported; the others still run.
 */
export function batch<T>(write: () => T): T {
  signalBatch.depth++;

  try {
    return write();
  } finally {
    if (signalBatch.depth === 1) flush();

    signalBatch.depth--;
  }
}

function flush() {
  while (signalBatch.queued > 0) drainRound(runWatcher);
}

function runWatcher(watcher: ReactiveNode): void {
  const cause = __KUITO_DEV__ ? (signalBatch.causes?.get(watcher) ?? null) : null;

  if (__KUITO_DEV__) signalBatch.causes?.delete(watcher);

  // Not if it stopped since, or a computed it reads came back to what it saw.
  if (!owed(watcher)) return;

  const outer = tracking.cause;

  tracking.cause = cause;

  try {
    watcher.effect?.(watcher);
  } catch (error) {
    reportError('signal listener failed', error);
  } finally {
    tracking.cause = outer;
  }
}

export interface Tracked<T> {
  value: T;
  dependencies: AnySignal[];
}

/** Evaluate `expression` without recording what it reads: nothing re-runs when that changes. */
export function untracked<T>(expression: () => T): T {
  const outerSub = tracking.sub;
  const outerCollecting = tracking.collecting;

  tracking.sub = null;
  tracking.collecting = null;

  try {
    return expression();
  } finally {
    tracking.sub = outerSub;
    tracking.collecting = outerCollecting;
  }
}

/** Evaluate `expression`, recording every signal it reads. */
export function readTracked<T>(expression: () => T): Tracked<T> {
  const outerSub = tracking.sub;
  const outerCollecting = tracking.collecting;
  const dependencies = new Set<AnySignal>();

  tracking.sub = null;
  tracking.collecting = dependencies;
  stats.total.thunkEvaluations++;

  try {
    return { value: expression(), dependencies: Array.from(dependencies) };
  } finally {
    tracking.sub = outerSub;
    tracking.collecting = outerCollecting;
  }
}

/**
 * A signal over state the platform owns: `observe` starts following it when
 * the first reader comes and returns how to stop when the last one leaves,
 * so nothing is observed natively while nobody watches. Unobserved, a read
 * asks `read()`, which keeps it current without a reader.
 */
export function createSource<T>(
  read: () => T,
  observe: (set: (value: T) => void) => () => void,
): Signal<T> {
  const node = makeNode(SOURCE);
  let observed: { value: T; stop: () => void } | null = null;
  // What an unobserved read last returned: a reader may hold it.
  let seen: { value: T } | null = null;
  // Unobserved, a read is the only way to see a change, so it counts one.
  const readUnobserved = () => {
    const value = read();

    if (seen && !Object.is(seen.value, value)) node.version++;

    seen = { value };

    return value;
  };
  const readNow = () => (observed ? observed.value : readUnobserved());

  node.refresh = () => {
    if (!observed) readUnobserved();
  };

  node.watch = () => {
    if (!observed) {
      const started: { value: T; stop: () => void } = { value: read(), stop: () => {} };

      observed = started;

      started.stop = observe((value) => {
        if (observed !== started || Object.is(value, started.value)) return;

        started.value = value;
        written(node, signal, value);
      });
    }

    // The platform's thread moves on while JS runs: a reader that read the
    // state before observing started hears the state it started from,
    // once the commit that subscribed it has landed.
    if (seen && observed && !Object.is(seen.value, observed.value)) {
      const from = observed;

      seen = null;
      void Promise.resolve().then(() => written(node, signal, from.value));
    }
  };

  // A binding re-tracking drops its link and links again in the same task:
  // stop only if nobody came back by then.
  node.unwatch = () => {
    const leaving = observed;

    if (!leaving) return;

    void Promise.resolve().then(() => {
      if (node.subCount > 0 || observed !== leaving) return;

      observed = null;
      seen = { value: leaving.value };
      leaving.stop();
    });
  };

  const signal: Signal<T> = {
    get value() {
      return tracked(node, signal, readNow);
    },
    get version() {
      if (!observed) readUnobserved();

      return node.version;
    },
    set value(_next) {
      throw new TypeError('A signal of platform state is read-only');
    },
    subscribe: (listener) =>
      subscribe(node, () => {
        if (observed) listener(observed.value);
      }),
    get listenerCount() {
      return node.subCount;
    },
  };

  register(node, signal);

  return signal;
}
