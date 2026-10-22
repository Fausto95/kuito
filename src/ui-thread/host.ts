/**
 * What the native UI runtime provides. It runs on the platform UI thread, in a
 * Hermes runtime of its own; values are scalars and plain data, which C++
 * reads as it is (native/shared/PlainValue.h), never as JSON.
 */
declare global {
  /** `view` is the view's number, as the JS thread's kernel sends it. */
  var __kuitoUISetProp: (view: number, prop: string, value: unknown) => void;
  /** A message for the JS thread's kernel, which gets it as the app's `ui` event. */
  var __kuitoUISendEvent: (message: Record<string, unknown>) => void;
  /**
   * The latest value of a motion value, for lock-free reads on the JS thread;
   * `js` is the JS-thread write it includes.
   */
  var __kuitoUIMirror: (id: string, value: unknown, js: number) => void;
  /** A number's latest value, without JSON; `js` is the JS-thread write it includes. */
  var __kuitoUIMirrorNumber: (id: string, value: number, js: number) => void;
  var __kuitoUILog: (level: string, message: string, stack: string) => void;
  /** Runs a module's main-thread function `id` on this thread; a failure throws. */
  var __kuitoUIHostCall: (id: number, ...args: unknown[]) => unknown;
  /** Calls `__kuitoUI.frame` on the next display frame, once. */
  var __kuitoUIRequestFrame: () => void;
  /** Milliseconds on a monotonic clock: what dev builds time UI-thread code with. */
  var __kuitoUINow: () => number;
}

export const host = globalThis;
