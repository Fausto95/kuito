// Motion sources (docs/motion.md#motion-sources): a view's `motion` event,
// sent every frame it moves, writes the motion value named for each of its
// fields. No app code runs, and the event stops here.
import { writeMotion } from './motion';
import { motions, pending } from './state';
import { isPlainData, type PlainData } from '../runtime/values';

/** The handler for `key`'s motion event: each field moves the motion value `ids` names for it. */
export function moveSource(key: string, ids: PlainData): (event: unknown) => void {
  const fields = Object.keys(ids).map((field) => {
    const id = ids[field];

    if (typeof id !== 'string') throw new TypeError('Malformed motion source for ' + key);

    return [field, id] as const;
  });

  return (event) => {
    if (!isPlainData(event)) return;

    fields.forEach(([field, id]) => {
      const record = motions[id];
      const value = event[field];

      if (!record || typeof value !== 'number') return;

      writeMotion(record, value);
      // Watchers on the JS thread hear of it, as of any UI-thread move.
      pending.movedHere.add(record);
    });
  };
}
