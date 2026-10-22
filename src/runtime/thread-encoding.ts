// Values across threads: what this thread sends the UI thread, and the
// calls, signal writes and moved values it sends back.
import { isDerived, type DerivedSpec } from './derived';
import { isGestureSource } from './gesture-specs';
import { isSignal } from './signals';
import { linked } from './state/linked';
import { motions, type MotionRecord } from './state/motion';
import { tracking } from './state/signals';
import { stats } from './state/stats';
import { threadRejections, threads, threadTags, type ThreadTag } from './state/threads';
import { motionRecord, tick, used } from './motion-values';
import { remoteId, signalId } from './thread-ids';
import { decodeValue, encodeValue } from './thread-wire';
import { isFunction, isPlainData, own, type PlainData } from './values';

/**
 * Why a function cannot run on the UI thread, phrased to follow "it".
 * `reported`: the compiler's placement report names it already.
 */
export function placementError(reason: string, reported = false): Error & { reported: boolean } {
  return Object.assign(new Error(reason), { name: 'KuitoPlacement', reported });
}

export const isPlacementError = (error: unknown): error is Error & { reported?: boolean } =>
  error instanceof Error && error.name === 'KuitoPlacement';

export function encodeForUI(value: unknown): unknown {
  return encodeValue(value, encodeSpecial);
}

function encodeSpecial(value: unknown, parent?: unknown): unknown {
  const record = motionRecord(value);

  if (record) return { $m: used(record).id };

  if (isDerived(value)) return { $d: encodeDerived(value.__kuitoDerived) };

  if (isGestureSource(value))
    throw new TypeError('a gesture field is followed by a motion value: motion(0).follows(drag.x)');

  if (isSignal(value) && 'value' in value)
    return { $s: signalId(value), v: encodeForUI(value.value) };

  if (!isFunction(value)) return undefined;

  const direct = linked.direct.get(value);

  if (direct !== undefined) return { $l: direct };

  const tag = threadTags.get(value);

  // Functions that call each other: the inner one names the outer, which the
  // UI thread is making as it decodes it.
  if (tag) return encoding.has(tag) ? { $r: tag.id } : { $t: tag.id, c: encodeCaptures(tag) };

  return { $j: remoteId(value, parent) };
}

/** A derivation for the UI thread; a map or a computed needs the function's UI-thread copy. */
export function encodeDerived(spec: DerivedSpec): unknown {
  if (spec.op === 'compute')
    return { op: 'compute', fn: encodeDerivedFunction(spec.fn, 'computes') };

  const from = encodeForUI(spec.from);

  if (spec.op !== 'map') return { ...spec, from };

  return { from, op: 'map', fn: encodeDerivedFunction(spec.fn, 'maps') };
}

function encodeDerivedFunction(fn: object, verb: string): unknown {
  const tag = threadTags.get(fn);

  if (!tag)
    throw placementError(
      verb +
        ' with a function that was not compiled for the UI thread' +
        (threadRejections.has(fn) ? ': it ' + threadRejections.get(fn) : ''),
      threadRejections.has(fn),
    );

  return { $t: tag.id, c: encodeCaptures(tag) };
}

const encoding = new Set<ThreadTag>();

export function encodeCaptures(tag: ThreadTag): unknown[] {
  if (encoding.has(tag)) throw placementError('calls itself through its captures');

  const values = capturedNow(tag);

  if (!Array.isArray(values)) throw new TypeError('Invalid UI-thread captures');

  encoding.add(tag);

  try {
    return values.map((value: unknown, index) => {
      const use = tag.uses[index];
      const path = Array.isArray(use) && typeof use[0] === 'string' ? use[0] : 'capture ' + index;
      const usedResult = Array.isArray(use) && use.indexOf('callResult') !== -1;

      if (isFunction(value) && usedResult && !threadTags.has(value) && !linked.direct.has(value))
        throw placementError('uses the result of ' + path + ', a JS-thread function');

      let encoded: unknown;

      try {
        encoded = encodeForUI(value);
      } catch (error) {
        if (isPlacementError(error) || !(error instanceof TypeError)) throw error;

        throw placementError(
          'captures ' + path + ', which cannot cross threads (' + error.message + ')',
        );
      }

      // A method called on it answers there: on the UI thread its call goes
      // to the JS thread and comes back with nothing.
      if (usedResult && !isFunction(value) && reachesJs(encoded))
        throw placementError('uses the result of a method of ' + path + ', a JS-thread function');

      return encoded;
    });
  } finally {
    encoding.delete(tag);
  }
}

/** Whether an encoded value holds a JS-thread function. */
function reachesJs(encoded: unknown): boolean {
  if (Array.isArray(encoded)) return encoded.some(reachesJs);

  if (!isPlainData(encoded)) return false;

  return own(encoded, '$j') || Object.keys(encoded).some((key) => reachesJs(encoded[key]));
}

/**
 * A function's captures, as they cross. Captures stop before `.value`, so
 * one that reads a motion value went through a getter, such as a
 * component's `props.text` computed from one: it would cross as it is now
 * and never move on the UI thread.
 */
function capturedNow(tag: ThreadTag): unknown {
  const outer = tracking.motions;
  const read = new Set<MotionRecord>();

  tracking.motions = read;

  try {
    const values = tag.captures();

    if (read.size)
      throw placementError(
        'captures a value computed from a motion value, such as a prop of a component, which would cross as it is now',
      );

    return values;
  } finally {
    tracking.motions = outer;
  }
}

/** An id given out before and since freed. */
const released = (id: number, last: number) => Number.isInteger(id) && id > 0 && id <= last;

export function decodeFromUI(value: unknown): unknown {
  return decodeValue(value, (tag, object) => {
    if (tag !== '$m' || typeof object.$m !== 'string' || !motions[object.$m])
      throw new TypeError('Unexpected value from the UI thread: ' + tag);

    return motions[object.$m].handle;
  });
}

/**
 * `__kuito.ui` events: calls, signal writes and moved values from the UI
 * thread. One may name a remote or signal a later patch released, sent
 * before the UI thread heard of that patch: it is dropped.
 */
export function receiveFromUI(message: PlainData): unknown {
  stats.total.uiMessages++;

  if (typeof message.f === 'number') {
    const remote = threads.remotes.get(message.f);
    const args = decodeFromUI(message.args);

    if (!Array.isArray(args) || !remote) {
      if (Array.isArray(args) && released(message.f, threads.next.remote)) return undefined;

      throw new TypeError('Unknown JS-thread function call');
    }

    return Reflect.apply(remote.fn, remote.receiver, args);
  }

  if (typeof message.s === 'number') {
    const signal = threads.signals.get(message.s);

    if (!signal) {
      if (released(message.s, threads.next.signal)) return undefined;

      throw new TypeError('Unknown signal written on the UI thread');
    }

    signal.value = decodeFromUI(message.value);

    return undefined;
  }

  // One message, one event: the event's batch makes the frame's moves one transaction.
  if (Array.isArray(message.w)) {
    message.w.forEach(applyMoved);

    return undefined;
  }

  throw new TypeError('Unknown message from the UI thread');
}

/**
 * One watched value the UI thread moved, `[id, value]`, as its frame's
 * message lists them. One a later patch freed is dropped.
 */
function applyMoved(entry: unknown): void {
  if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string')
    throw new TypeError('Malformed moved value from the UI thread');

  const record = motions[entry[0]];

  if (!record) return;

  record.value = decodeFromUI(entry[1]);
  tick(record);
}
