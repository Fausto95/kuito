// Each module's committed patch: its branch owners, followers, handlers,
// state signals and pending re-plans.
import type { AsyncRecord } from '../async-task';
import type { Boundary } from '../boundaries';
import type { KernelEvent } from '../events';
import type { LifecycleRecord } from '../lifecycle';
import type { Binding } from '../plan';
import type { ReactiveNode } from '../reactive-graph';
import type { PatchApi } from '../registration';
import type { AnySignal } from '../signals';
import { dict } from '../values';
import type { CachedInstance, ComponentNode, HookSlot } from './components';
import type { Cause } from './devtools';
import type { Environment } from './inherited';
import type { HeldIds } from './threads';

export interface HandlerEntry {
  owner: string;
  invoke: (event: KernelEvent) => unknown;
}

/** A committed binding kept current: its watcher follows the signals it read last. */
export interface Follower {
  view: number;
  binding: Binding;
  held: ReactiveNode;
}

/** Positions in a module's lists: its views, component instances, handlers and UI-thread handlers. */
export interface Extent {
  views: number;
  components: number;
  handlers: number;
  uiHandlers: number;
}

/**
 * A committed branch owner (a Show, a flow Switch, a reactive child
 * expression). A signal its conditions read re-plans its branch alone, from
 * the element it last walked, into its run of the module's lists.
 */
export interface ScopeRecord {
  path: string;
  node: unknown;
  parent: number | null;
  fontSize: number;
  component: string | null;
  environment: Environment | null;
  /** The parents whose children a waiting Loading hides there. */
  veiled: (number | null)[];
  start: Extent;
  length: Extent;
  /** Its one watcher: several of its signals in a batch re-plan it once. */
  conditions: ReactiveNode;
  /** The ids its branch encodes, nested branches' included (a multiset). */
  held: HeldIds;
  /** A Catch's state, which outlives the plans that walk it; null for other owners. */
  boundary: Boundary | null;
}

/** A module's committed patch. */
export interface ModuleRecord {
  register: (api: PatchApi) => void;
  revision: number;
  handlerKeys: string[];
  /** Event keys whose handler runs on the UI thread. */
  uiHandlerKeys: string[];
  /** Its bindings' followers, by `<view>.<prop>`. */
  followers: Record<string, Follower>;
  /** The signals that decide its structure outside any branch owner: a change re-plans it. */
  structural: ReactiveNode;
  /** Its branch owners, in walk order. */
  scopes: ScopeRecord[];
  asyncRecords: AsyncRecord[];
  lifecycleRecords: LifecycleRecord[];
  /** Its component instances' hooks, by hook key. */
  hooks: Record<string, HookSlot>;
  /** Its component instances' last rendered trees, by path. */
  instances: Record<string, CachedInstance>;
  /** Its component instances, in walk order: parents first. */
  components: ComponentNode[];
  /** Its views, in walk order: parents first, siblings in order. */
  viewIds: number[];
  /** The label of the view its root views are created in; null for the screen's root. */
  parent: string | null;
  held: HeldIds;
}

export const stateStore = dict<AnySignal>();
/** Resources' `error` signals a render has read: their failures are the app's to show. */
export const renderedErrors = new WeakSet<AnySignal>();
export const modules = dict<ModuleRecord>();
export const handlers = dict<HandlerEntry>();

/**
 * Re-plans due at the end of the task, by module: the whole module, or the
 * paths of the branch owners whose conditions changed.
 */
export const replans = dict<{ whole: boolean; scopes: string[]; cause: Cause | null }>();
