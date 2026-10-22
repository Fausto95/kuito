import { animate, interrupt } from './frames';
import { isAnimation } from './animation';
import { motionRefs, motions, pending, tracking, type MotionRecord } from './state';

export function createMotion(
  id: string,
  value: unknown,
  js: number,
  internal = false,
): MotionRecord {
  const record: MotionRecord = {
    id,
    value,
    js,
    ref: {
      get value() {
        return readMotion(record);
      },
      set value(next) {
        if (isAnimation(next)) {
          animate(record, next);

          return;
        }

        writeMotion(record, next);
        pending.movedHere.add(record);
      },
    },
    internal,
    following: null,
    dependents: new Set(),
    animation: null,
  };

  motions[id] = record;
  motionRefs.set(record.ref, record);
  pending.changed.add(record);

  return record;
}

/** A read inside a running binding makes the binding depend on the value. */
export function readMotion(record: MotionRecord): unknown {
  const reading = tracking.reading;

  if (reading) {
    reading.reads.add(record);
    record.dependents.add(reading);
  }

  return record.value;
}

/** A new value: it interrupts the value's animation, if any. */
export function writeMotion(record: MotionRecord, value: unknown): void {
  interrupt(record);
  setMotion(record, value);
}

/** Moves the value without touching its animation: what a frame does. */
export function setMotion(record: MotionRecord, value: unknown): void {
  const mover = tracking.reading;

  if (mover) {
    const moved = pending.moves.get(mover) ?? new Set<MotionRecord>();

    moved.add(record);
    pending.moves.set(mover, moved);
  }

  record.value = value;
  pending.changed.add(record);
  record.dependents.forEach((binding) => pending.dirty.add(binding));
}
