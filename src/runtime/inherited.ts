// Inherited values (docs/reactivity.md#inherited-values): a component
// provides a value and its descendants inherit it, whatever components lie
// between. The plan's walk carries what each place inherits; a branch
// re-planned alone starts from its scope's, and a module rendered into a
// view (a list's row) from that view's. A reader resolves its provider
// once, while it sets up, so the plan keeps a reader's tree only while its
// place resolves each key it read to the same value (plan.ts).
import { computed } from './signals';
import {
  inheritedKeys,
  type Environment,
  type InheritedKey,
  type Provision,
} from './state/inherited';
import { signalNodes } from './state/signals';
import { views } from './state/views';
import { findView } from './view-ids';
import { own } from './values';

/** The key `inherited()` makes, or the one the compiler's `name` already made. */
export function inherited(fallback: unknown, name?: unknown): InheritedKey {
  if (typeof name !== 'string' || !name) return made({ fallback });

  const { named } = inheritedKeys;
  const key = own(named, name) ? named[name] : (named[name] = made({ fallback }));

  key.fallback = fallback;

  return key;
}

function made(key: InheritedKey): InheritedKey {
  inheritedKeys.made.add(key);

  return key;
}

export function inheritedKey(api: string, key: unknown): InheritedKey {
  if (typeof key !== 'object' || key === null || !inheritedKeys.made.has(key))
    throw new TypeError(api + '() takes a key made by inherited()');

  return key as never;
}

/** What `environment` holds for `key`: the nearest provider's value or signal, or the key's fallback. */
export function inheritedValue(environment: Environment | null, key: InheritedKey): unknown {
  let at = environment;

  while (at && at.key !== key) at = at.outer;

  return at ? at.value : key.fallback;
}

/** Whether `environment` resolves every key a reader read to what it read then. */
export function inheritsSame(environment: Environment | null, read: readonly Provision[]): boolean {
  return read.every(({ key, value }) => Object.is(inheritedValue(environment, key), value));
}

/**
 * What a reader gets: a kernel signal as it is, so its writes reach the
 * bindings that read it; any other value, a motion value included, as a
 * signal of that value.
 */
export function inheritedSignal(value: unknown): unknown {
  return typeof value === 'object' && value !== null && signalNodes.has(value)
    ? value
    : computed(() => value);
}

/** What the place of the committed view `label` inherits. */
export function inheritedAt(label: string): Environment | null {
  const id = findView(label);
  const view = id === null ? undefined : views.get(id);

  return view ? view.environment : null;
}
