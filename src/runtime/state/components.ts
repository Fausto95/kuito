// Component definitions, the instances a plan renders and the hooks they
// claim.
import type { PatchApi } from '../registration';
import type { Signal } from '../signals';
import { dict } from '../values';
import type { Environment, Provision } from './inherited';

export type Component = (props: Record<string, unknown>) => unknown;

export interface ComponentDefinition {
  fn: Component;
  hash: unknown;
  cacheable: boolean;
}

/** A component's last rendered tree, reused while its props are unchanged. */
export interface CachedInstance {
  id: string;
  hash: unknown;
  props: Record<string, unknown>;
  tree: unknown;
  /** What it provided its descendants, which a kept tree still provides. */
  provisions: readonly Provision[];
  /** What it inherited: a tree is kept only while its place still inherits the same. */
  inherits: readonly Provision[];
  /** A `For` row's position, which its tree reads (src/runtime/each.ts). */
  index?: Signal<number>;
}

/** A component instance as its module's last plan rendered it. */
export interface ComponentNode {
  path: string;
  name: string;
  /** The enclosing instance's path; null at the module's root. */
  parent: string | null;
  key: string | null;
  props: Record<string, unknown>;
}

/**
 * A hook of a component instance. Its key, `<path>:<kind>:<name>`, is its
 * identity across patches (docs/reactivity.md); `states` are the state keys
 * it holds in its module.
 */
export interface HookSlot {
  owner: string;
  kind: string;
  name: string;
  states: string[];
}

/** The hook a lifecycle or async record belongs to. */
export interface HookRef {
  key: string;
  owner: string;
}

/**
 * A plan's component instances: the paths whose component ran (the others
 * kept their cached tree and their hooks), and the hooks of those that ran.
 */
export interface Instances {
  ran: Record<string, true>;
  hooks: Record<string, HookSlot>;
}

/** The component being rendered: each hook claims its slot by kind and name. */
export interface RenderingContext {
  api: PatchApi;
  path: string;
  /** Unnamed hooks so far, by kind: an uncompiled call's name is its ordinal. */
  ordinals: Record<string, number>;
  /** Hooks so far by `<kind>:<name>`: a repeated name takes `name#2`. */
  names: Record<string, number>;
  instances: Instances;
  /** What its ancestors provide, which `inherit()` reads. */
  inherited: Environment | null;
  /** What it provides its descendants, in call order. */
  provisions: Provision[];
  /** What each of its `inherit()` calls read. */
  inherits: Provision[];
}

export const componentDefinitions = dict<ComponentDefinition>();
/** Each component definition's number in instance paths, by definition id (or name, uncompiled). */
export const componentNumbers = new Map<string, number>();

/** The key of each object a `For` has shown, for as long as it lives: one per object. */
export const itemIdentities: { next: number; byItem: WeakMap<object, string> } = {
  next: 0,
  byItem: new WeakMap(),
};
