// `For`'s rows (docs/control-flow.md#for): each item's key, and the tree its
// row rendered, kept while the item and the render function stay the same.
// A row's path holds its key, so its views keep their ids wherever it moves,
// and a kept tree keeps its bindings unevaluated: a reorder only moves views.
import { createSignal } from './signals';
import { itemIdentities, type CachedInstance } from './state/components';
import { dict, own } from './values';

/** The row cache's id for a `For` row, unlike any component's. */
const ROW = 'For';

/** An object's key is its identity; a value's is the value, numbered where it repeats. */
export function eachKeys(items: readonly unknown[]): string[] {
  const seen = dict<number>();

  return items.map((item) => {
    const base =
      (typeof item === 'object' && item !== null) || typeof item === 'function'
        ? identity(item)
        : typeof item + ':' + String(item);
    const count = (own(seen, base) ? seen[base] : 0) + 1;

    seen[base] = count;

    return count === 1 ? base : base + '#' + count;
  });
}

function identity(item: object): string {
  const known = itemIdentities.byItem.get(item);

  if (known !== undefined) return known;

  const made = 'item' + ++itemIdentities.next;

  itemIdentities.byItem.set(item, made);

  return made;
}

/**
 * The row for `item` at `position`: the tree `previous` rendered when it was
 * for the same item and the same render function, else a new one. Its index
 * signal carries over and takes the new position.
 */
export function eachRow(
  previous: CachedInstance | undefined,
  render: (item: unknown, index: unknown) => unknown,
  item: unknown,
  position: number,
): CachedInstance {
  const prior = previous?.id === ROW ? previous : null;
  const index = prior?.index ?? createSignal(position);

  index.value = position;

  const tree =
    prior && Object.is(prior.props.render, render) && Object.is(prior.props.item, item)
      ? prior.tree
      : render(item, index);

  return {
    id: ROW,
    hash: null,
    props: { render, item },
    tree,
    index,
    provisions: [],
    inherits: [],
  };
}
