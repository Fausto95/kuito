// Which committed views a new plan can keep, and the fewest moves that put
// the kept ones in order. Pure: reads kernel state, writes nothing.
import type { PlannedView } from './plan';
import { views } from './state/views';

/** Child view numbers by parent (null for the root). */
export type Children = Map<number | null, number[]>;

export interface Reconciliation {
  /** Views that must be removed and created again. */
  replaced: Set<number>;
  /** Children before the plan, in sibling order, and after it. */
  oldChildren: Children;
  newChildren: Children;
}

function push(map: Children, key: number | null, id: number): void {
  const list = map.get(key);

  if (list) list.push(id);
  else map.set(key, [id]);
}

/**
 * A branch's plan holds only some of its parent's children: the parent's
 * whole child list before and after it, which the branch's own lists replace.
 */
export interface Siblings {
  parent: number | null;
  before: number[];
  after: number[];
}

/**
 * Structural edits are normal. Remount only incompatible nodes (kind or
 * parent changed) and their descendants; the rest move into place.
 */
export function reconcile(
  plan: PlannedView[],
  previousIds: number[] | null,
  siblings?: Siblings,
): Reconciliation {
  const replaced = new Set<number>();
  const oldChildren: Children = new Map();
  const newChildren: Children = new Map();

  plan.forEach((view) => push(newChildren, view.parent, view.id));

  if (siblings) newChildren.set(siblings.parent, siblings.after);

  if (!previousIds) return { replaced, oldChildren, newChildren };

  plan.forEach((view) => {
    const old = views.get(view.id);

    if (old && (old.kind !== view.kind || old.parent !== view.parent)) replaced.add(view.id);
  });

  previousIds.forEach((id) => {
    const old = views.get(id);

    if (old) push(oldChildren, old.parent, id);
  });

  if (siblings) oldChildren.set(siblings.parent, siblings.before);

  // A replaced parent replaces its whole subtree. The previous plan lists
  // parents before their children, so one pass reaches every descendant.
  previousIds.forEach((id) => {
    const parent = views.get(id)?.parent ?? null;

    if (parent !== null && replaced.has(parent)) replaced.add(id);
  });

  return { replaced, oldChildren, newChildren };
}

/**
 * The indexes of a longest strictly increasing subsequence of `values`
 * (patience sorting, O(n log n)).
 */
export function longestIncreasing(values: number[]): Set<number> {
  /** The index ending the best run of each length, by length - 1. */
  const ends: number[] = [];
  const previous: number[] = values.map(() => -1);

  values.forEach((value, index) => {
    let low = 0;
    let high = ends.length;

    while (low < high) {
      const middle = (low + high) >> 1;

      if (values[ends[middle]] < value) low = middle + 1;
      else high = middle;
    }

    if (low > 0) previous[index] = ends[low - 1];

    ends[low] = index;
  });

  const kept = new Set<number>();

  for (let index = ends.length ? ends[ends.length - 1] : -1; index !== -1; index = previous[index])
    kept.add(index);

  return kept;
}

/**
 * The moves that turn `current` into `wanted` (both orders of the same ids):
 * the ids on a longest run already in order stay, and each other id moves
 * right after the id before it in `wanted`, left to right. Each move is
 * `[id, index]`, the index counted once the id has left its place.
 *
 * When an id moves, the ids before it in `wanted` are already in order and
 * ahead of it, and so are the ids that wait to move but sit before the last
 * id that stays: that count is its index. O(n log n), no list is simulated.
 */
export function moves<T>(current: readonly T[], wanted: readonly T[]): [T, number][] {
  const position = new Map(current.map((id, index) => [id, index]));
  const positions = wanted.map((id) => {
    const at = position.get(id);

    if (at === undefined)
      throw new TypeError('moves: ' + String(id) + ' is not in the current order');

    return at;
  });
  const stay = longestIncreasing(positions);
  // Typed arrays: filled right to left, a plain array would turn sparse.
  /** The current position of the last id that stays before each index; -1 before the first. */
  const anchors = new Int32Array(wanted.length);
  /** How many ids after each index sit before its anchor. */
  const ahead = new Int32Array(wanted.length);
  const later = new Counts(current.length);
  let anchor = -1;

  wanted.forEach((_, index) => {
    anchors[index] = anchor;

    if (stay.has(index)) anchor = positions[index];
  });

  for (let index = wanted.length - 1; index >= 0; index--) {
    ahead[index] = later.below(anchors[index]);
    later.add(positions[index]);
  }

  const result: [T, number][] = [];

  wanted.forEach((id, index) => {
    if (!stay.has(index)) result.push([id, index + ahead[index]]);
  });

  return result;
}

/** How many of the positions added are below a position (a Fenwick tree). */
class Counts {
  private readonly tree: Int32Array;

  constructor(size: number) {
    this.tree = new Int32Array(size + 1);
  }

  add(at: number): void {
    for (let node = at + 1; node < this.tree.length; node += node & -node) this.tree[node]++;
  }

  below(at: number): number {
    let sum = 0;

    for (let node = at; node > 0; node -= node & -node) sum += this.tree[node];

    return sum;
  }
}
