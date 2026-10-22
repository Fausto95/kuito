// Motion values that follow: a gesture's field, moved by its view's gesture
// events, or another source, moved whenever what it reads moves. No app code
// runs for either (docs/motion.md).
import { bindMotion, unbindMotion } from './bindings';
import { animate, interrupt } from './frames';
import { setMotion, writeMotion } from './motion';
import { gestureFollowers, motions, pending, type MotionRecord } from './state';
import { decode } from './wire';
import type { Follower } from '../runtime/gesture-events';
import { isPlainData, type PlainData } from '../runtime/values';

/** It no longer follows anything: what a new `follow` or a freed value does first. */
export function stop(record: MotionRecord): void {
  if (record.following) gestureFollowers.get(record.following.gesture)?.delete(record);

  record.following = null;
  unbindMotion(record.id);
}

/** The `follow` operation: a gesture's field, a source, or (source null) nothing. */
export function follow(operation: PlainData): void {
  const record = motions[String(operation.id)];

  if (!record) throw new TypeError('Unknown motion value ' + String(operation.id));

  stop(record);

  if (typeof operation.gesture === 'number' && typeof operation.field === 'string') {
    const followers = gestureFollowers.get(operation.gesture) ?? new Set();

    record.following = {
      gesture: operation.gesture,
      field: operation.field,
      home: decode(operation.home),
    };

    followers.add(record);
    gestureFollowers.set(operation.gesture, followers);

    return;
  }

  if (operation.source === null) return;

  const source = decode(operation.source);

  if (
    !isPlainData(source) &&
    (typeof source !== 'object' || source === null || !('value' in source))
  )
    throw new TypeError('Motion value ' + record.id + ' follows a motion value or a derived one');

  bindMotion(
    record.id,
    () => (source as { value: unknown }).value,
    (value) => {
      setMotion(record, value);
      // Watchers on the JS thread hear of it, as of any UI-thread move.
      pending.movedHere.add(record);
    },
  );
}

/** The followers of gesture `id`, as its dispatcher moves them. */
export function followersOf(id: number): Follower[] {
  return Array.from(gestureFollowers.get(id) ?? []).flatMap((record) => {
    const following = record.following;

    if (!following || motions[record.id] !== record) return [];

    return [
      {
        key: record,
        field: following.field,
        home: following.home,
        read: () => record.value,
        stop: () => interrupt(record),
        write: (value: unknown) => {
          writeMotion(record, value);
          pending.movedHere.add(record);
        },
        animate: (animation: unknown) => animate(record, animation),
      },
    ];
  });
}
