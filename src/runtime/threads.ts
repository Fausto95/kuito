// Where app code runs. The compiler tags every function it also compiled for
// the UI thread (src/dev/threads); here the kernel decides, per
// prop and per handler, which copy runs, so app code never names a thread.
import { isDerived } from './derived';
import { reportWarning } from './errors';
import { hasUIThread, queueOperation } from './operations';
import { isSignalLike, type AnySignal } from './signals';
import { linked } from './state/linked';
import { motionSignals, type MotionRecord } from './state/motion';
import { threadRejections, threads, threadTags, type ThreadTag } from './state/threads';
import { derivedReads, motionRecord, readPlaced, used } from './motion-values';
import { encodeCaptures, encodeDerived, isPlacementError, placementError } from './thread-encoding';
import { remoteId, type RemoteSite } from './thread-ids';
import { isFunction, type AnyFunction } from './values';
import type { UIBinding } from './host';

declare global {
  var __kuitoThread: (fn: unknown, id: unknown, captures: unknown, uses: unknown) => unknown;
  var __kuitoThreadRejected: (fn: unknown, reason: unknown) => unknown;
}

export function installThreadTags(): void {
  globalThis.__kuitoThread = (fn, id, captures, uses) => {
    if (!isFunction(fn) || typeof id !== 'string' || !isFunction(captures) || !Array.isArray(uses))
      throw new TypeError('Invalid UI-thread function tag');

    threadTags.set(fn, { id, captures, uses });

    return fn;
  };

  globalThis.__kuitoThreadRejected = (fn, reason) => {
    if (!isFunction(fn) || typeof reason !== 'string')
      throw new TypeError('Invalid UI-thread rejection tag');

    threadRejections.set(fn, reason);

    return fn;
  };
}

export function uiBinding(source: unknown): UIBinding {
  return { __kuitoUIBinding: source };
}

/** The UI-thread source for a prop, or why it has to stay on the JS thread. */
function uiSource(raw: AnyFunction, value: unknown): unknown {
  const record = motionRecord(value);

  if (record) return { $m: used(record).id };

  if (isDerived(value)) return { $d: encodeDerived(value.__kuitoDerived) };

  const tag = threadTags.get(raw);

  const rejected = threadRejections.get(raw);

  if (!tag) throw placementError(rejected ?? 'was not compiled for the UI thread', !!rejected);

  return { $t: tag.id, c: encodeCaptures(tag) };
}

export interface PlacedProp {
  value: unknown;
  evaluate: () => unknown;
  dependencies: AnySignal[];
  /** The signal the prop was handed, which the view may write back (two-way props). */
  signal?: { readonly value: unknown };
}

/**
 * A computed prop that reads motion values runs on the UI thread when it can.
 * Otherwise it runs here, re-evaluated when those values move, and warns once.
 */
export function placeProp(kind: string, name: string, raw: AnyFunction): PlacedProp {
  const tracked = readPlaced(raw);
  const direct = motionRecord(tracked.value);
  const derived = isDerived(tracked.value) ? derivedReads(tracked.value) : null;

  // `{level}` hands over the signal: the prop follows its value.
  if (!direct && !derived && isSignalLike(tracked.value))
    return {
      ...placeProp(kind, name, () => {
        const value: unknown = raw();

        return isSignalLike(value) ? value.value : value;
      }),
      signal: tracked.value,
    };

  const read = tracked.motions.concat(direct ? [direct] : (derived ?? []));

  // An expression that yields undefined leaves the prop unset, as null does.
  if (!read.length)
    return {
      value: tracked.value === undefined ? null : tracked.value,
      evaluate: () => {
        const value: unknown = raw();

        return value === undefined ? null : value;
      },
      dependencies: tracked.dependencies,
    };

  const signals = tracked.dependencies.filter((signal) => !motionSignals.has(signal));
  const onJs = (reason: string | null): PlacedProp => {
    fellBack(kind, name, reason);
    read.forEach(watch);

    const evaluate = () => resolveMotion(raw());

    return {
      value: resolveMotion(tracked.value),
      evaluate,
      dependencies: signals.concat(read.map((record) => record.changed)),
    };
  };

  if (!hasUIThread()) return onJs(null);

  try {
    const source = uiSource(raw, tracked.value);

    return {
      value: uiBinding(source),
      // A signal it read changed: send the source again with fresh captures.
      evaluate: () => uiBinding(uiSource(raw, raw())),
      dependencies: signals,
    };
  } catch (error) {
    if (!isPlacementError(error)) throw error;

    return onJs(error.reported ? null : error.message);
  }
}

/**
 * What only the running app can see, a capture that cannot cross or a map
 * of a function the compiler never saw, is said once; the compiler's
 * placement report says the rest (docs/placement.md).
 */
function fellBack(kind: string, name: string, reason: string | null): void {
  if (reason)
    warnOnce(
      kind +
        ' ' +
        name +
        ' reads a motion value but runs on the JS thread, a frame late: it ' +
        reason,
    );
}

/**
 * A Text's or Button's label from its children: computed on the UI thread
 * when they read a motion value and each expression among them has a UI
 * copy, otherwise here.
 */
export function placeText(kind: string, children: unknown, evaluate: () => string): PlacedProp {
  const tracked = readPlaced(evaluate);

  if (!tracked.motions.length)
    return { value: tracked.value, evaluate, dependencies: tracked.dependencies };

  const signals = tracked.dependencies.filter((signal) => !motionSignals.has(signal));
  const onJs = (reason: string | null): PlacedProp => {
    fellBack(kind, 'children', reason);
    tracked.motions.forEach(watch);

    return {
      value: tracked.value,
      evaluate,
      dependencies: signals.concat(tracked.motions.map((record) => record.changed)),
    };
  };

  if (!hasUIThread()) return onJs(null);

  try {
    const source = textParts(children, []);

    return {
      value: uiBinding(source),
      evaluate: () => uiBinding(textParts(children, [])),
      dependencies: signals,
    };
  } catch (error) {
    if (!isPlacementError(error)) throw error;

    return onJs(error.reported ? null : error.message);
  }
}

/** Children as the UI thread joins them: text, and functions and motion values it reads. */
function textParts(value: unknown, parts: unknown[]): unknown[] {
  if (value == null || typeof value === 'boolean') return parts;

  if (Array.isArray(value)) {
    value.forEach((item: unknown) => textParts(item, parts));

    return parts;
  }

  const record = motionRecord(value);

  if (record) parts.push({ $m: used(record).id });
  else if (isFunction(value)) {
    const tag = threadTags.get(value);
    const rejected = threadRejections.get(value);

    if (!tag) throw placementError(rejected ?? 'was not compiled for the UI thread', !!rejected);

    parts.push({ $t: tag.id, c: encodeCaptures(tag) });
  } else if (isSignalLike(value)) textParts(value.value, parts);
  else if (typeof value === 'string' || typeof value === 'number') parts.push(String(value));
  else throw new TypeError('Text children must resolve to strings or numbers');

  return parts;
}

function resolveMotion(value: unknown): unknown {
  const record = motionRecord(value);

  if (record) return record.handle.value;

  return isDerived(value) ? value.value : value;
}

function watch(record: MotionRecord): void {
  if (record.watched) return;

  record.watched = true;
  queueOperation({ op: 'watch', id: record.id });
}

/**
 * The encoded handler, when `raw` should run on the UI thread: it captures a
 * motion value and every capture can cross. Null keeps it on the JS thread.
 */
export function placeHandler(kind: string, name: string, raw: AnyFunction): unknown {
  if (!hasUIThread()) return null;

  const tag = threadTags.get(raw);

  if (!tag) return null;

  if (!livesOnUI(tag, new Set())) return null;

  try {
    return { $t: tag.id, c: encodeCaptures(tag) };
  } catch (error) {
    if (!isPlacementError(error)) throw error;

    warnOnce(
      kind + ' ' + name + ' moves a motion value but runs on the JS thread: it ' + error.message,
    );

    return null;
  }
}

/**
 * Whether what a function touches lives on the UI thread: it captures a
 * motion value or a module's main-thread function, or a function compiled
 * for the UI thread that does, as a component's handler calling the one it
 * was given does.
 */
function livesOnUI(tag: ThreadTag, seen: Set<ThreadTag>): boolean {
  if (seen.has(tag)) return false;

  seen.add(tag);

  const values = tag.captures();

  return (
    Array.isArray(values) &&
    values.some((value: unknown) => {
      if (motionRecord(value) || (isFunction(value) && linked.direct.has(value))) return true;

      const inner = isFunction(value) ? threadTags.get(value) : undefined;

      return inner !== undefined && livesOnUI(inner, seen);
    })
  );
}

/**
 * The encoded format of a field, when the UI thread can run it: the compiler
 * made it a UI copy and its captures cross. Null keeps it on the JS thread,
 * a frame late, which the compiler's report or a warning says once.
 */
export function placeFormat(kind: string, format: AnyFunction): unknown {
  if (!hasUIThread()) return null;

  const tag = threadTags.get(format);

  try {
    if (!tag) {
      const rejected = threadRejections.get(format);

      throw placementError(rejected ?? 'was not compiled for the UI thread', !!rejected);
    }

    return { $t: tag.id, c: encodeCaptures(tag) };
  } catch (error) {
    if (!isPlacementError(error)) throw error;

    if (!error.reported)
      warnOnce(kind + ' format runs on the JS thread, a frame late: it ' + error.message);

    return null;
  }
}

/** Event fields that are the event's machinery, not what the view reported. */
const EVENT_FIELDS = [
  'type',
  'isTrusted',
  'bubbles',
  'cancelable',
  'defaultPrevented',
  'eventPhase',
];

/**
 * The JS-thread side of a handler on the UI thread, for an event that comes
 * through this thread instead of from the view: a press that bubbles to a
 * Pressable from one inside it, or a field's change after a format this
 * thread ran. It is sent there, and stops there, as the innermost
 * Pressable's press does.
 */
export function forwardEvent(view: number, type: string): (event: Record<string, unknown>) => void {
  return (event) => {
    const payload: Record<string, unknown> = {};

    if (isFunction(event.stopPropagation)) event.stopPropagation();

    Object.keys(event).forEach((key) => {
      const value = event[key];

      if (
        EVENT_FIELDS.indexOf(key) === -1 &&
        (typeof value === 'number' || typeof value === 'string')
      )
        payload[key] = value;
    });

    queueOperation({ op: 'dispatch', view, event: type, payload });
  };
}

/**
 * A callback the UI thread calls: its UI-thread copy when it has one and every
 * capture can cross, otherwise a call back to the JS thread, which the UI
 * thread makes without waiting.
 */
export function encodeCallback(
  kind: string,
  name: string,
  fn: AnyFunction,
  site: RemoteSite,
): unknown {
  const tag = threadTags.get(fn);

  if (tag) {
    try {
      return { $t: tag.id, c: encodeCaptures(tag) };
    } catch (error) {
      if (!isPlacementError(error)) throw error;

      const values = tag.captures();

      if (Array.isArray(values) && values.some((value) => motionRecord(value)))
        warnOnce(
          kind +
            ' ' +
            name +
            ' moves a motion value but runs on the JS thread: it ' +
            error.message,
        );
    }
  }

  return { $j: remoteId(fn, undefined, site) };
}

function warnOnce(message: string): void {
  if (threads.warned[message]) return;

  threads.warned[message] = true;
  reportWarning(message);
}
