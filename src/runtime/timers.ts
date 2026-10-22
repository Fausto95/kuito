// Timers over the host's one-shot native timer, and microtasks over Hermes'
// promise queue, which the host drains after every job.
import { host } from './host';
import { isFunction } from './values';

type SetTimer = (id: number, delay: number, callback: () => void) => void;

const delayOf = (delay: unknown) => Math.max(0, Number(delay) || 0);

function requireFunction(callback: unknown, name: string): void {
  if (!isFunction(callback)) throw TypeError(`${name} requires a function`);
}

export function installTimers(setTimer: SetTimer): void {
  /** Timeouts and intervals share ids, as on the web: either clear cancels either. */
  let serial = 0;

  host.setTimeout = <A extends unknown[]>(
    callback: (...args: A) => void,
    delay?: number,
    ...args: A
  ) => {
    requireFunction(callback, 'setTimeout');

    const id = ++serial;

    setTimer(id, delayOf(delay), () => callback(...args));

    return id;
  };

  host.setInterval = <A extends unknown[]>(
    callback: (...args: A) => void,
    delay?: number,
    ...args: A
  ) => {
    requireFunction(callback, 'setInterval');

    const id = ++serial;
    const milliseconds = delayOf(delay);
    // Re-armed before the callback runs, so one that throws keeps repeating
    // and one that clears itself cancels the next run.
    const tick = () => {
      setTimer(id, milliseconds, tick);
      callback(...args);
    };

    setTimer(id, milliseconds, tick);

    return id;
  };

  host.clearTimeout = host.clearInterval = (id) => {
    host.__kuitoHostClearTimer?.(Number(id));
  };
}

export function installMicrotasks(): void {
  // An error thrown here reaches the LogBox as an unhandled rejection.
  host.queueMicrotask = (callback) => {
    requireFunction(callback, 'queueMicrotask');
    void Promise.resolve().then(callback);
  };
}
