// What components provide their descendants, and the keys they meet by.
import { dict } from '../values';

/** What `inherited()` makes: the key providers and readers meet by (docs/reactivity.md). */
export interface InheritedKey {
  fallback: unknown;
}

/** A value or a signal for a key: what a component provides, or what a reader read. */
export interface Provision {
  key: InheritedKey;
  value: unknown;
}

/** What a place in the tree inherits: each provision above it, nearest first. */
export interface Environment extends Provision {
  outer: Environment | null;
}

/**
 * Keys `inherited()` made. One the compiler named is made once: a Live Patch
 * evaluates its declaration again and gets the same key, so a tree a
 * provider kept and readers that ran again still meet.
 */
export const inheritedKeys: { named: Record<string, InheritedKey>; made: WeakSet<object> } = {
  named: dict<InheritedKey>(),
  made: new WeakSet(),
};
