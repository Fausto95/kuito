// A native list's keys cross the host boundary as edits to the keys it was
// sent last (docs/lists.md#keys), so a change costs what changed rather than
// the whole list.
import { moves } from './reconcile';

/** One edit, applied to the keys the edits before it left. */
export interface KeyEdit {
  op: 'insert' | 'remove' | 'move';
  /** Where the key lands; for a removal, where it is. A move counts once the key has left its place. */
  index: number;
  key: string;
}

/**
 * The edits that turn `old` into `next`: the keys that left, then the fewest
 * moves of the keys that stayed, then the new keys at their final index, in
 * order. `old` is what a previous diff built, so its keys are unique.
 */
export function keyDiff(old: readonly string[], next: readonly string[]): KeyEdit[] {
  const wanted = new Set(next);

  if (wanted.size !== next.length) {
    const repeated = next.find((key, index) => next.indexOf(key) !== index);

    throw new TypeError('List keys must be unique: "' + repeated + '" repeats');
  }

  const had = new Set(old);
  const edits: KeyEdit[] = [];
  const stayed: string[] = [];

  old.forEach((key) => {
    if (wanted.has(key)) stayed.push(key);
    else edits.push({ op: 'remove', index: stayed.length, key });
  });

  moves(
    stayed,
    next.filter((key) => had.has(key)),
  ).forEach(([key, index]) => edits.push({ op: 'move', index, key }));

  next.forEach((key, index) => {
    if (!had.has(key)) edits.push({ op: 'insert', index, key });
  });

  return edits;
}
