/**
 * Structural control flow, after Solid's <Show>, <Switch>, <Match> and <For>.
 * `when` re-evaluates reactively; switching branches unmounts one subtree
 * (playing its `exiting` animation) and mounts the other.
 *
 * `Switch` is this control flow; the native on/off control is `Toggle`.
 */
import type { ElementAttributes, Primitive, PrimitiveBrand, KuitoElement, KuitoNode } from './jsx';
import type { ReadonlySignal } from './reactivity';

type When<T> = T | ReadonlySignal<T>;

export type Truthy<T> = Exclude<T, null | undefined | false | 0 | 0n | ''>;

/** Children, or a callback receiving the truthy `when` value. */
export type BranchChildren<T> = KuitoNode | ((value: Truthy<T>) => KuitoNode);

/** Props of `Show`: the condition, and what it shows either way. */
export interface ShowProps<T> extends ElementAttributes {
  when: When<T>;
  fallback?: KuitoNode;
  children?: BranchChildren<T>;
}

/** Props of `Switch`: its `Match` branches, and what it shows when none matches. */
export interface SwitchProps extends ElementAttributes {
  fallback?: KuitoNode;
  /** `Match` elements only. */
  children?: KuitoNode;
}

/** Props of `Match`: the condition, and what it shows while it holds. */
export interface MatchProps<T> extends ElementAttributes {
  when: When<T>;
  children?: BranchChildren<T>;
}

/** Props of `For`: the items, the row each renders, and what shows while there are none. */
export interface ForProps<T> extends ElementAttributes {
  /** The items: an array, a signal of one, or a store array. */
  each: readonly T[] | ReadonlySignal<readonly T[]>;
  /** Rendered while `each` is empty. */
  fallback?: KuitoNode;
  /** Renders an item's row once; `index` follows its position. */
  children: (item: T, index: ReadonlySignal<number>) => KuitoNode;
}

/** Props of `Catch`: the children it guards, and what it shows once they throw. */
export interface CatchProps extends ElementAttributes {
  /** Shown in place of children that threw: an element, or one made from the error. */
  fallback: KuitoNode | ((error: unknown, retry: () => void) => KuitoNode);
  children?: KuitoNode;
}

/** Props of `Loading`: the children, and what it shows while their resources load. */
export interface LoadingProps extends ElementAttributes {
  /** Shown in place of the children while their resources load. */
  fallback?: KuitoNode;
  children?: KuitoNode;
}

type ForComponent = (<T>(props: ForProps<T>) => KuitoElement) & PrimitiveBrand;
type ShowComponent = (<T>(props: ShowProps<T>) => KuitoElement) & PrimitiveBrand;
type MatchComponent = (<T>(props: MatchProps<T>) => KuitoElement) & PrimitiveBrand;

/** Renders its children while `when` is truthy, else `fallback`. */
export const Show = 'Show' as unknown as ShowComponent;
/** Renders the first `Match` whose `when` is truthy, else `fallback`. */
export const Switch = 'Switch' as unknown as Primitive<SwitchProps>;
/** One branch of a `Switch`. */
export const Match = 'Match' as unknown as MatchComponent;
/**
 * Renders its children, or `fallback` once they throw: while rendering, in
 * an effect or `onMount`, or in a `resource` whose `error` it does not render.
 * `retry` renders them again, from scratch.
 */
export const Catch = 'Catch' as unknown as Primitive<CatchProps>;
/**
 * Renders its children hidden, and `fallback` in their place, until the
 * resources they start have loaded or failed; then shows them for good.
 */
export const Loading = 'Loading' as unknown as Primitive<LoadingProps>;
/**
 * A row per item, keyed by the item: a reorder moves the rows' views, and a
 * row renders once per item. For lists inside a Scroll; `List` virtualizes.
 */
export const For = 'For' as unknown as ForComponent;
