import { reportError } from './errors';
import { followExactly, makeWatcher, unlinkAll } from './reactive-graph';
import { readTracked } from './signals';
import type { HookRef } from './state/components';
import { isFunction, type AnyFunction } from './values';

export type LifecycleKind = 'mount' | 'cleanup' | 'effect' | 'watch';

/** Something a component owns for its lifetime: mounted on commit, disposed on removal. */
export interface Disposable {
  mount(): void;
  dispose(): void;
}

/** What an observer last saw: a watch compares against it for the instance's lifetime. */
export interface Seen {
  first: boolean;
  last: unknown;
}

export interface LifecycleRecord extends Disposable {
  hook: HookRef;
  kind: LifecycleKind;
  seen?: Seen;
}

export interface WatchOptions {
  immediate?: boolean;
}

/** Hands an error to a Catch around the hook's component; false when none is. */
export type Escalate = (error: unknown) => boolean;

const NO_CATCH: Escalate = () => false;

/** effect(fn) re-runs fn when what it read changes; watch(select, callback) compares values. */
function makeObserver(
  kind: 'effect' | 'watch',
  select: AnyFunction,
  callback: AnyFunction | undefined,
  options: WatchOptions | undefined,
  escalate: Escalate,
): Disposable & { seen: Seen } {
  let active = false;
  const seen: Seen = { first: true, last: undefined };
  let cleanup: AnyFunction | null = null;
  const watcher = makeWatcher(execute);

  function release() {
    unlinkAll(watcher);

    if (cleanup) {
      const prior = cleanup;

      cleanup = null;
      prior();
    }
  }

  function execute() {
    if (!active) return;

    release();

    try {
      observe();
    } catch (error) {
      if (!escalate(error)) throw error;
    }
  }

  function observe() {
    const tracked = readTracked(select);

    if (kind === 'effect') {
      if (isFunction(tracked.value)) cleanup = tracked.value;
    } else if (
      (seen.first && options?.immediate) ||
      (!seen.first && !Object.is(seen.last, tracked.value))
    ) {
      const result = callback?.(tracked.value, seen.first ? undefined : seen.last);

      if (isFunction(result)) cleanup = result;
    }

    seen.first = false;
    seen.last = tracked.value;

    // After the callback, as before it ran: what it writes does not run it again.
    followExactly(watcher, tracked.dependencies);
  }

  return {
    seen,
    mount() {
      active = true;
      execute();
    },
    dispose() {
      active = false;
      release();
    },
  };
}

/** mount(fn) may return its cleanup; cleanup(fn) runs on removal. */
function makeInstanceHook(
  kind: 'mount' | 'cleanup',
  fn: AnyFunction,
  escalate: Escalate,
): Disposable {
  let dispose: AnyFunction | null = null;

  return {
    mount() {
      if (kind === 'cleanup') {
        dispose = fn;

        return;
      }

      let result: unknown;

      try {
        result = fn();
      } catch (error) {
        if (!escalate(error)) throw error;
      }

      if (isFunction(result)) dispose = result;
    },
    dispose() {
      dispose?.();
    },
  };
}

export function makeLifecycle(
  kind: string,
  fn: AnyFunction,
  callback: AnyFunction | undefined,
  options: WatchOptions | undefined,
  escalate: Escalate = NO_CATCH,
): Disposable & { kind: LifecycleKind; seen?: Seen } {
  if (kind === 'effect')
    return { ...makeObserver('effect', fn, undefined, undefined, escalate), kind };

  if (kind === 'watch') return { ...makeObserver('watch', fn, callback, options, escalate), kind };

  if (kind === 'mount' || kind === 'cleanup')
    return { ...makeInstanceHook(kind, fn, escalate), kind };

  throw Error('Unknown lifecycle kind');
}

export function safeDispose(record: Disposable): void {
  try {
    record.dispose();
  } catch (error) {
    reportError('lifecycle cleanup failed', error);
  }
}
