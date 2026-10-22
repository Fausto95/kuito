// AbortController and AbortSignal, the kernel's own on every host so fetch,
// tasks and listeners cancel the same way on Hermes and in tests.
import { host } from './host';
import { isFunction } from './values';

type AbortListener = (event: { type: 'abort'; target: AbortSignal }) => void;

/** Error-shaped, as Hermes has no DOMException: callers check `name`. */
export function abortError(name = 'AbortError', message = 'The operation was aborted.'): Error {
  const error = new Error(message);

  error.name = name;

  return error;
}

class KuitoAbortSignal implements AbortSignal {
  aborted = false;
  reason: unknown = undefined;
  onabort: AbortListener | null = null;
  private listeners: AbortListener[] = [];

  static abort(reason?: unknown): AbortSignal {
    const controller = new KuitoAbortController();

    controller.abort(reason);

    return controller.signal;
  }

  /** Aborts with a TimeoutError after `milliseconds`; needs the host's timers. */
  static timeout(milliseconds: number): AbortSignal {
    const controller = new KuitoAbortController();

    host.setTimeout(
      () => controller.abort(abortError('TimeoutError', 'The operation timed out.')),
      milliseconds,
    );

    return controller.signal;
  }

  addEventListener(type: 'abort', listener: AbortListener, options?: { once?: boolean }): void {
    if (type !== 'abort' || !isFunction(listener) || this.listeners.indexOf(listener) !== -1)
      return;

    if (!options?.once) {
      this.listeners.push(listener);

      return;
    }

    const once: AbortListener = (event) => {
      this.removeEventListener('abort', once);
      listener(event);
    };

    this.listeners.push(once);
  }

  removeEventListener(type: 'abort', listener: AbortListener): void {
    const index = type === 'abort' ? this.listeners.indexOf(listener) : -1;

    if (index !== -1) this.listeners.splice(index, 1);
  }

  throwIfAborted(): void {
    if (this.aborted) throw this.reason;
  }

  /** The controller's side: marks the signal and tells its listeners once. */
  fire(reason: unknown): void {
    if (this.aborted) return;

    this.aborted = true;
    this.reason = reason === undefined ? abortError() : reason;

    const event = { type: 'abort' as const, target: this };

    this.onabort?.(event);
    this.listeners.slice().forEach((listener) => listener(event));
    this.listeners.length = 0;
  }
}

class KuitoAbortController implements AbortController {
  readonly signal = new KuitoAbortSignal();

  abort(reason?: unknown): void {
    this.signal.fire(reason);
  }
}

export function installAbort(): void {
  host.AbortSignal = KuitoAbortSignal;
  host.AbortController = KuitoAbortController;
}
