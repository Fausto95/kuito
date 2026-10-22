import { reportError } from './errors';
import type { Disposable, Escalate } from './lifecycle';
import type { Signal } from './signals';
import type { HookRef } from './state/components';
import { renderedErrors } from './state/modules';
import { isFunction } from './values';

export type TaskPolicy = 'replace' | 'drop';

export interface TaskOptions {
  policy?: TaskPolicy;
}

export interface AsyncRecord extends Disposable {
  running: Signal<boolean>;
  data: Signal<unknown>;
  error: Signal<unknown>;
  run(...args: unknown[]): Promise<unknown>;
  refresh(...args: unknown[]): Promise<unknown>;
  cancel(reason?: unknown): void;
  hook: HookRef;
}

interface StateApi {
  state<T>(key: string, initial: T): Signal<T>;
}

/** The suffix of the state that says whether a resource has had a result: a Loading waits on it. */
export const SETTLED = ':settled';

/** The state keys a task or resource hook holds. */
export function asyncStateKeys(key: string): string[] {
  return [key + ':running', key + ':data', key + ':error', key + SETTLED];
}

/**
 * task()/resource() state: running, data and error signals plus a run that
 * cancels (replace) or reuses (drop) the request in flight. No I/O or async
 * execution occurs while preparing a patch: work starts on mount.
 *
 * A task's failure is its caller's: `run()` rejects, as `refresh()` does. The
 * load a resource starts on mount has no caller: unless what its component
 * renders reads `error`, its failure goes to the Catch around the component,
 * or to the reporting seam without one.
 */
export function createAsyncRecord(
  api: StateApi,
  hook: HookRef,
  work: unknown,
  options: TaskOptions | undefined,
  autoStart: boolean,
  escalate: Escalate,
): AsyncRecord {
  if (!isFunction(work)) throw new TypeError('task() requires a function');

  const task = work;

  const policy: unknown = options?.policy || 'replace';

  if (policy !== 'replace' && policy !== 'drop')
    throw new Error('Unknown task policy: ' + String(policy));

  const [runningKey, dataKey, errorKey, settledKey] = asyncStateKeys(hook.key);
  const running = api.state(runningKey, false);
  const data = api.state<unknown>(dataKey, undefined);
  const error = api.state<unknown>(errorKey, null);
  // A task has nothing to wait for until it is run; a resource loads on mount.
  const settled = api.state(settledKey, !autoStart);
  let active = false;
  let version = 0;
  let controller: AbortController | null = null;
  let inFlight: Promise<unknown> | null = null;
  // A read of `error` that waits on another state (`running ? … : error ? …`)
  // is linked only while it does not wait, so readers are noted when seen.
  const noteReaders = () => {
    if (error.listenerCount > 0) renderedErrors.add(error);
  };

  function settle() {
    running.value = false;
    controller = null;
    inFlight = null;
  }

  function cancel(reason?: unknown) {
    ++version;
    controller?.abort(reason);
    controller = null;
    inFlight = null;

    if (active) {
      running.value = false;
      settled.value = true;
    }
  }

  /** `automatic`: the load a resource starts on mount, which no caller awaits. */
  function start(automatic: boolean, args: unknown[]): Promise<unknown> {
    if (!active) return Promise.reject(new Error('Async task is not mounted'));

    if (policy === 'drop' && inFlight) return inFlight;

    controller?.abort();

    const current = ++version;
    const abort = new AbortController();
    const live = () => active && !abort.signal.aborted && current === version;

    controller = abort;
    running.value = true;
    error.value = null;

    const promise = Promise.resolve()
      .then(() => (live() ? task({ signal: abort.signal }, ...args) : undefined))
      .then(
        (value) => {
          if (live()) {
            data.value = value;
            settled.value = true;
            settle();
          }

          return value;
        },
        (reason: unknown) => {
          if (live()) {
            error.value = reason;
            settled.value = true;
            settle();

            noteReaders();

            if (automatic && !renderedErrors.has(error) && !escalate(reason))
              reportError(
                'resource ' + hook.key + ' failed; read its error, or put a Catch around it',
                reason,
              );
          }

          throw reason;
        },
      );

    inFlight = promise;

    return promise;
  }

  function run(...args: unknown[]): Promise<unknown> {
    return start(false, args);
  }

  return {
    running,
    data,
    error,
    run,
    refresh: run,
    cancel,
    hook,
    mount() {
      active = true;
      noteReaders();

      if (autoStart)
        void Promise.resolve().then(() => {
          // The error signal exposes the failure, or the Catch or the reporting seam does.
          if (active) start(true, []).catch(() => undefined);
        });
    },
    dispose() {
      active = false;
      ++version;
      controller?.abort();
      settle();
    },
  };
}
