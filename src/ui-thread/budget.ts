// Dev builds time the app's UI-thread code. It runs on the main thread, so
// what it takes, the frame being built loses: a frame over the budget is
// reported, blamed on the code that took the most of it, once per place in
// the app. Only app code counts: the kernel's own work, like applying the
// operations that mount a screen, is Kuito's to keep quick, and a report has
// to name code the app can change. Release builds drop all of it
// (src/dev/kernel.ts).
import { host } from './host';
import { frameTime, locations, madeFrom, overBudget } from './state';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

/**
 * Milliseconds of UI-thread code one frame may run. A 120 Hz frame lasts
 * 8.3 ms; applying the JS thread's batches may take 4 of them
 * (FrameHandoff.h), and layout and the platform's commit need the rest.
 */
const BUDGET_MS = 4;
/** Entries that start within one 120 Hz frame of the first are that frame's. */
const FRAME_MS = 1000 / 120;

/** App code as reports name it: what it is to its view, and its place in the app. */
export interface Source {
  what: string;
  /** `file:line:column`, unknown for a function the compiler did not place. */
  place: string | undefined;
}

/** An entry from the platform: the app code it runs counts toward its frame's time. */
export function measured<A extends unknown[], R>(entry: (...args: A) => R): (...args: A) => R {
  if (!__KUITO_DEV__) return entry;

  return (...args: A): R => {
    // An entry the platform makes while another runs is counted by that one.
    if (frameTime.depth) return entry(...args);

    const start = host.__kuitoUINow();

    if (start - frameTime.start >= FRAME_MS) {
      frameTime.start = start;
      frameTime.reported = false;
      frameTime.costs.clear();
    }

    frameTime.depth++;
    frameTime.called = 0;

    try {
      return entry(...args);
    } finally {
      frameTime.depth--;

      if (!frameTime.reported) reportFrame();
    }
  };
}

/** A decoded UI-thread function, `what` it is to its view, as dev reports name it. */
function describe(fn: object, what: string): Source {
  const id = madeFrom.get(fn);
  const location = id === undefined ? undefined : locations[id];

  return { what, place: location };
}

/** App code, as a view runs it: timed, in dev builds, as `what`. */
export function appFunction(value: unknown, what: string): (...args: unknown[]) => unknown {
  if (typeof value !== 'function') throw new TypeError(what + ' must be a UI-thread function');

  if (!__KUITO_DEV__) return (...args: unknown[]): unknown => Reflect.apply(value, undefined, args);

  const source = describe(value, what);

  return (...args: unknown[]): unknown => timed(source, value as never, args);
}

/**
 * Dev builds: calls app code, its time blamed on `source`'s place. App code it
 * calls, like a map a binding reads, is blamed for its own time, not twice.
 */
function timed(source: Source, fn: (...args: unknown[]) => unknown, args: unknown[]): unknown {
  const start = host.__kuitoUINow();
  const outer = frameTime.called;

  frameTime.called = 0;

  try {
    return Reflect.apply(fn, undefined, args);
  } finally {
    // One handler in many rows is one piece of code, at one place.
    const key = source.place ?? source.what;
    const cost = frameTime.costs.get(key);
    const elapsed = host.__kuitoUINow() - start;
    const ms = elapsed - frameTime.called;

    frameTime.called = outer + elapsed;

    if (cost) cost.ms += ms;
    else frameTime.costs.set(key, { ...source, ms });
  }
}

/** Reports the frame once its app code ran past the budget, blaming the code that took the most. */
function reportFrame(): void {
  let spent = 0;
  let culprit: (Source & { ms: number }) | undefined;

  for (const cost of frameTime.costs.values()) {
    spent += cost.ms;

    if (!culprit || cost.ms > culprit.ms) culprit = cost;
  }

  if (spent <= BUDGET_MS || !culprit) return;

  frameTime.reported = true;

  const key = culprit.place ?? culprit.what;

  if (overBudget.has(key)) return;

  overBudget.add(key);

  const { what, place, ms } = culprit;

  host.__kuitoUILog(
    'warn',
    `A frame ran ${round(spent)} ms of UI-thread code, over its ${BUDGET_MS} ms budget; ` +
      `${round(ms)} ms of it in ${place ? what + ' at ' + place : what}. ` +
      'Code that runs every frame has to stay quick.',
    // A frame at the code's place, which the LogBox opens as its code frame.
    place ? `    at ${what} (${place})` : '',
  );
}

const round = (ms: number) => Math.round(ms * 10) / 10;
