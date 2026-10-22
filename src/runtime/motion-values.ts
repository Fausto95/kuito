// Motion values: the app's and the platform's, what they follow, and their
// reads and writes on this thread, which never wait for the UI thread.
import { endValue } from './animation-specs';
import { isDerived, mapOf } from './derived';
import type { Follower } from './gesture-events';
import { isGestureSource } from './gesture-specs';
import { hasUIThread, queueOperation } from './operations';
import { createSignal, type AnySignal, type Tracked } from './signals';
import { gestureIdCount, gestureIds } from './state/gestures';
import {
  motionHandles,
  motions,
  motionSignals,
  type MotionHandle,
  type MotionRecord,
} from './state/motion';
import { tracking } from './state/signals';
import { stats } from './state/stats';
import { threads } from './state/threads';
import { decodeFromUI, encodeForUI } from './thread-encoding';
import { isFunction, isPlainData } from './values';
import { isAnimatedValue } from './host';

export function createMotion(initial: unknown): MotionHandle {
  const id = 'm' + ++threads.nextMotion;
  const changed = createSignal(0);
  const handle: MotionHandle = {
    get value() {
      return readMotion(record);
    },
    set value(next) {
      writeMotion(record, next);
    },
    follows(source) {
      follow(record, source);

      return handle;
    },
    map: (fn) => mapOf(handle, fn),
  };
  const record: MotionRecord = {
    id,
    handle,
    value: initial,
    version: 0,
    changed,
    ticks: 0,
    watched: false,
    home: initial,
    following: null,
    unfollow: null,
    start: null,
  };

  motions[id] = record;
  motionHandles.set(handle, record);
  motionSignals.add(changed);
  queueOperation({ op: 'motion', id, value: encodeForUI(initial), version: 0 });

  return handle;
}

/**
 * A motion value the platform writes: into the UI runtime on the main thread,
 * and to the JS thread through `set`, which moves this thread's copy without
 * sending it back. It starts, `start` and the UI thread learning of it, the
 * first time the app reads or binds it; only the platform writes it. It is
 * `initial` until the platform first writes it.
 */
export function platformMotion(
  id: string,
  label: string,
  start: (record: MotionRecord) => void,
  initial: unknown = null,
): { handle: MotionHandle; set(value: unknown): void } {
  const handle: MotionHandle = {
    get value() {
      return readMotion(record);
    },
    set value(_next) {
      throw new TypeError(label + " is the platform's: follow it or map it, never write it");
    },
    follows() {
      throw new TypeError(label + " is the platform's: another motion value can follow it");
    },
    map: (fn) => mapOf(handle, fn),
  };
  const record: MotionRecord = {
    id,
    handle,
    value: initial,
    version: 0,
    changed: createSignal(0),
    ticks: 0,
    watched: false,
    home: initial,
    following: null,
    unfollow: null,
    start: () => start(record),
  };

  motions[id] = record;
  motionHandles.set(handle, record);
  motionSignals.add(record.changed);

  return {
    handle,
    set(value) {
      record.value = value;
      tick(record);
    },
  };
}

/** The record's first use starts what feeds it. */
export function used(record: MotionRecord): MotionRecord {
  const start = record.start;

  record.start = null;
  start?.();

  return record;
}

/** The id the UI thread and the motion values following `gesture` know it by. */
export function gestureId(gesture: object): number {
  let id = gestureIds.get(gesture);

  if (id === undefined) {
    id = ++gestureIdCount.next;
    gestureIds.set(gesture, id);
  }

  return id;
}

/**
 * A motion value follows a gesture's field, a motion value or a derived one,
 * on the UI thread with no code of the app's; null stops it.
 */
function follow(record: MotionRecord, source: unknown): void {
  record.unfollow?.();
  record.unfollow = null;

  if (source === null) {
    record.following = null;
    queueOperation({ op: 'follow', id: record.id, source: null });

    return;
  }

  if (isGestureSource(source)) {
    const { gesture, field } = source.__kuitoSource;
    const id = gestureId(gesture);

    record.following = { gesture: id, field };

    queueOperation({
      op: 'follow',
      id: record.id,
      gesture: id,
      field,
      home: encodeForUI(record.home),
    });

    return;
  }

  if (!motionRecord(source) && !isDerived(source))
    throw new TypeError('follows takes a gesture value (drag.x), a motion value or a derived one');

  record.following = { source };

  // Without a UI thread, the JS thread keeps it current from its sources.
  if (!hasUIThread()) {
    const stops = derivedReads(source).map((read) =>
      read.changed.subscribe(() => writeMotion(record, valueOf(source))),
    );

    record.unfollow = () => stops.forEach((stop) => stop());
    writeMotion(record, valueOf(source));

    return;
  }

  queueOperation({ op: 'follow', id: record.id, source: encodeForUI(source) });
}

function valueOf(source: unknown): unknown {
  return typeof source === 'object' && source !== null && 'value' in source ? source.value : source;
}

/** The motion values a source reads, through any derivations. */
export function derivedReads(source: unknown): MotionRecord[] {
  const record = motionRecord(source);

  if (record) return [record];

  if (!isDerived(source)) return [];

  const spec = source.__kuitoDerived;

  // A computed's sources are the ones it reads now.
  return spec.op === 'compute' ? readPlaced(() => source.value).motions : derivedReads(spec.from);
}

/** The followers of gesture `id` as the JS thread moves them, when there is no UI runtime. */
export function jsFollowers(id: number): Follower[] {
  return Object.keys(motions).flatMap((key) => {
    const record = motions[key];
    const following = record.following;

    if (!following || !('gesture' in following) || following.gesture !== id) return [];

    return [
      {
        key: record,
        field: following.field,
        home: record.home,
        read: () => record.value,
        // Nothing animates on the JS thread: an animation there already ended.
        stop: () => {},
        write: (value: unknown) => writeMotion(record, value),
        animate: (animation: unknown) => writeMotion(record, animation),
      },
    ];
  });
}

/** A released motion slot: the value is gone on both threads. */
export function freeMotion(handle: unknown): void {
  const record = motionRecord(handle);

  if (!record) return;

  delete motions[record.id];
  motionSignals.delete(record.changed);
  queueOperation({ op: 'free', id: record.id });
}

export function motionRecord(value: unknown): MotionRecord | undefined {
  return typeof value === 'object' && value !== null ? motionHandles.get(value) : undefined;
}

/**
 * Never waits for the UI thread: the mirror, unless the JS thread wrote since.
 * A number crosses as one; any other value as plain data.
 */
function readMotion(record: MotionRecord): unknown {
  used(record);
  void record.changed.value;
  tracking.motions?.add(record);

  const number = globalThis.__kuitoHostMotionNumber?.(record.id, record.version);

  if (typeof number === 'number') return (record.value = number);

  if (number === null) return record.value;

  const mirrored = globalThis.__kuitoHostMotionRead?.(record.id);

  if (isPlainData(mirrored) && typeof mirrored.js === 'number' && mirrored.js >= record.version)
    record.value = decodeFromUI(mirrored.value);

  return record.value;
}

function writeMotion(record: MotionRecord, value: unknown): void {
  if (isAnimatedValue(value) && !hasUIThread()) {
    // Nothing runs frames here: the value jumps to where the animation ends.
    writeMotion(record, endValue(value, record.value));

    const onEnd = value.onEnd;

    if (isFunction(onEnd)) void Promise.resolve(true).then(onEnd);

    return;
  }

  record.version++;

  // An animation moves the value from where it is: reads stay there until the
  // UI thread has started it.
  if (!isAnimatedValue(value)) record.value = value;

  queueOperation({
    op: 'motion',
    id: record.id,
    value: encodeForUI(value),
    version: record.version,
  });

  tick(record);
}

export function tick(record: MotionRecord): void {
  record.changed.value = ++record.ticks;
}

/** Evaluates like readTracked, also recording the motion values read. */
export function readPlaced<T>(expression: () => T): Tracked<T> & { motions: MotionRecord[] } {
  const previous = {
    collecting: tracking.collecting,
    sub: tracking.sub,
    motions: tracking.motions,
  };
  const dependencies = new Set<AnySignal>();
  const read = new Set<MotionRecord>();

  tracking.sub = null;
  tracking.collecting = dependencies;
  tracking.motions = read;
  stats.total.thunkEvaluations++;

  try {
    const value = expression();

    return { value, dependencies: Array.from(dependencies), motions: Array.from(read) };
  } finally {
    tracking.collecting = previous.collecting;
    tracking.sub = previous.sub;
    tracking.motions = previous.motions;
  }
}
