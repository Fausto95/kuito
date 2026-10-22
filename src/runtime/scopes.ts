// Branch owners (docs/reactivity.md): a Show, a flow Switch or a reactive
// child expression is a scope of its module. A signal its conditions read
// re-plans its branch alone: walk again from the element the module last
// walked, reconcile against the branch's views, commit, and splice the
// result into the module's lists. Nested owners are covered by the outer one.
import { commitPlan } from './commit';
import { replanned, replanStarted } from './devtools';
import { noteStates } from './write-log';
import { followPlan } from './follow';
import { reconcileHooks } from './hooks';
import { buildRenderPlan, type PlannedScope, type PlannedView } from './plan';
import { dispose, followExactly, makeWatcher } from './reactive-graph';
import { reconcile, type Siblings } from './reconcile';
import { carryRecords, commitUIHandlers, createRegistration, uiHandlerKey } from './registration';
import type { CachedInstance, ComponentNode } from './state/components';
import {
  handlers,
  modules,
  stateStore,
  type Extent,
  type Follower,
  type ScopeRecord,
} from './state/modules';
import type { HeldIds } from './state/threads';
import { views } from './state/views';
import { checkMotionSources } from './motion-sources';
import { claiming, hold, rebindRemotes } from './thread-ids';
import { atomically } from './transaction';
import { dict } from './values';

/** The listener a branch owner's conditions subscribe with, by its path. */
export type ScopeListener = (path: string) => () => void;

export const NO_EXTENT: Extent = Object.freeze({
  views: 0,
  components: 0,
  handlers: 0,
  uiHandlers: 0,
});

const EXTENTS: (keyof Extent)[] = ['views', 'components', 'handlers', 'uiHandlers'];

function combine(left: Extent, right: Extent, sign: 1 | -1): Extent {
  const result = { ...NO_EXTENT };

  EXTENTS.forEach((name) => {
    result[name] = left[name] + sign * right[name];
  });

  return result;
}

/** Whether `path` is inside the branch of `scope`. */
function within(scope: ScopeRecord, path: string): boolean {
  return path.startsWith(scope.path + '.');
}

function splice<T>(list: readonly T[], start: number, length: number, items: readonly T[]): T[] {
  return list.slice(0, start).concat(items, list.slice(start + length));
}

/** `held` with one count of each id in `out` traded for `into` (multisets). */
function traded(held: HeldIds, out: HeldIds, into: HeldIds): HeldIds {
  const without = (ids: number[], removed: number[]) => {
    const left = ids.slice();

    removed.forEach((id) => {
      const index = left.indexOf(id);

      if (index !== -1) left.splice(index, 1);
    });

    return left;
  };

  return {
    remotes: without(held.remotes, out.remotes).concat(into.remotes),
    signals: without(held.signals, out.signals).concat(into.signals),
  };
}

/**
 * Records for the branch owners a plan walked, placed at `base` in the
 * module's lists. An owner the replaced records had at the same path keeps
 * its watcher and the links of the conditions it still reads; the
 * others are released.
 */
export function scopeRecords(
  planned: PlannedScope[],
  base: Extent,
  replaced: ScopeRecord[],
  listen: ScopeListener,
): ScopeRecord[] {
  const byPath = new Map(replaced.map((record) => [record.path, record]));
  const records = planned.map((scope): ScopeRecord => {
    const prior = byPath.get(scope.path);
    const conditions = prior ? prior.conditions : makeWatcher(listen(scope.path));

    byPath.delete(scope.path);
    followExactly(conditions, scope.conditions);

    return {
      path: scope.path,
      node: scope.node,
      parent: scope.parent,
      fontSize: scope.fontSize,
      component: scope.component,
      environment: scope.environment,
      veiled: scope.veiled,
      start: combine(base, scope.start, 1),
      length: combine(scope.end, scope.start, -1),
      conditions,
      held: scope.held,
      boundary: scope.boundary,
    };
  });

  byPath.forEach((record) => dispose(record.conditions));

  return records;
}

export function releaseScopes(records: ScopeRecord[]): void {
  records.forEach((record) => dispose(record.conditions));
}

/** The parent's children of this module before the branch's plan and after it. */
function siblingsOf(
  parent: number | null,
  before: number[],
  after: number[],
  plan: PlannedView[],
): Siblings {
  const planned = new Map(plan.map((view) => [view.id, view.parent]));
  const parentOf = (id: number) =>
    planned.has(id) ? planned.get(id) : (views.get(id)?.parent ?? null);

  return {
    parent,
    before: before.filter((id) => (views.get(id)?.parent ?? null) === parent),
    after: after.filter((id) => parentOf(id) === parent),
  };
}

/**
 * Re-plan the branch of the owner at `path` in `moduleId`, alone. Throws,
 * having committed nothing, when its plan fails or reaches outside the
 * branch; the caller re-plans the module instead. An owner that is gone (its
 * own owner re-planned it away) needs nothing.
 */
export function replanScope(moduleId: string, path: string, listen: ScopeListener): void {
  const module = modules[moduleId];
  const index = module.scopes.findIndex((record) => record.path === path);

  if (index === -1) return;

  const scope = module.scopes[index];
  const { start, length } = scope;
  const started = replanStarted();
  const registration = createRegistration(moduleId);
  const nextCache = dict<CachedInstance>();
  const components: ComponentNode[] = [];
  const planned: PlannedScope[] = [];
  const previousIds = module.viewIds.slice(start.views, start.views + length.views);
  const taking = new Set(previousIds);
  const previousUIKeys = module.uiHandlerKeys.slice(
    start.uiHandlers,
    start.uiHandlers + length.uiHandlers,
  );

  const { result: prepared } = claiming(() => {
    const plan = buildRenderPlan({
      moduleId,
      root: scope.node,
      parent: scope.parent,
      at: {
        path: scope.path,
        fontSize: scope.fontSize,
        component: scope.component,
        environment: scope.environment,
        veiled: scope.veiled,
      },
      taking,
      reevaluate: true,
      api: registration.api,
      pendingHandlers: registration.handlers,
      uiHandlers: registration.uiHandlers,
      nextCache,
      activePaths: dict<true>(),
      structural: [],
      scopes: planned,
      components,
      instances: registration.instances,
      rebinds: registration.rebinds,
    });
    const viewIds = splice(
      module.viewIds,
      start.views,
      length.views,
      plan.map((view) => view.id),
    );
    const reconciliation = reconcile(
      plan,
      previousIds,
      siblingsOf(scope.parent, module.viewIds, viewIds, plan),
    );
    const planIds = new Set(plan.map((view) => view.id));

    checkMotionSources(
      registration.handlers,
      module.handlerKeys.slice(start.handlers, start.handlers + length.handlers),
    );

    reconciliation.replaced.forEach((id) => {
      if (!taking.has(id) && !planIds.has(id))
        throw new Error('A re-planned branch would replace a view outside it');
    });

    atomically(() => {
      rebindRemotes(registration.rebinds);
      commitUIHandlers(previousUIKeys, registration.uiHandlers);
      commitPlan(moduleId, plan, previousIds, reconciliation);
    });

    return { plan, viewIds };
  });
  const { plan, viewIds } = prepared;

  // Commit point.
  const handlerKeys = Object.keys(registration.handlers);
  const uiHandlerKeys = Object.keys(registration.uiHandlers).map(uiHandlerKey);

  module.handlerKeys
    .slice(start.handlers, start.handlers + length.handlers)
    .forEach((key) => delete handlers[key]);

  handlerKeys.forEach((key) => {
    handlers[key] = { owner: moduleId, invoke: registration.handlers[key] };
  });

  const nodes = splice(module.components, start.components, length.components, components);
  const activePaths = dict<true>();

  nodes.forEach((node) => {
    activePaths[node.path] = true;
  });

  const hooks = reconcileHooks(moduleId, module.hooks, registration.instances, activePaths);

  registration.stateKeys.forEach((key) => {
    stateStore[key] = registration.states[key];
  });

  noteStates(moduleId, hooks);

  const carried = carryRecords(module, registration, activePaths);
  const instances = dict<CachedInstance>();

  // What the branch rendered before is replaced by what it renders now: a
  // component or a For row that left the branch takes its tree with it.
  Object.keys(module.instances).forEach((key) => {
    if (!within(scope, key)) instances[key] = module.instances[key];
  });

  Object.assign(instances, nextCache);

  const outside = dict<Follower>();
  const inside = dict<Follower>();

  Object.keys(module.followers).forEach((key) => {
    const follower = module.followers[key];

    (taking.has(follower.view) ? inside : outside)[key] = follower;
  });

  let end = index + 1;

  while (end < module.scopes.length && within(scope, module.scopes[end].path)) end++;

  const records = scopeRecords(planned, start, module.scopes.slice(index, end), listen);
  const branchHeld = records[0].held;
  const delta: Extent = {
    views: plan.length - length.views,
    components: components.length - length.components,
    handlers: handlerKeys.length - length.handlers,
    uiHandlers: uiHandlerKeys.length - length.uiHandlers,
  };
  const scopes: ScopeRecord[] = [];

  module.scopes.forEach((record, position) => {
    if (position === index) scopes.push(...records);
    else if (position > index && position < end) return;
    else if (position < index && within(record, scope.path))
      scopes.push({
        ...record,
        length: combine(record.length, delta, 1),
        held: traded(record.held, scope.held, branchHeld),
      });
    else if (position > index) scopes.push({ ...record, start: combine(record.start, delta, 1) });
    else scopes.push(record);
  });

  const held = traded(module.held, scope.held, branchHeld);

  hold(module.held, held);

  modules[moduleId] = {
    ...module,
    handlerKeys: splice(module.handlerKeys, start.handlers, length.handlers, handlerKeys),
    uiHandlerKeys: splice(module.uiHandlerKeys, start.uiHandlers, length.uiHandlers, uiHandlerKeys),
    followers: Object.assign(outside, followPlan(inside, plan)),
    scopes,
    asyncRecords: carried.asyncRecords.concat(registration.asyncRecords),
    lifecycleRecords: carried.lifecycle.concat(registration.lifecycle),
    hooks,
    instances,
    components: nodes,
    viewIds,
    held,
  };

  registration.asyncRecords.forEach((record) => record.mount());
  registration.lifecycle.forEach((record) => record.mount());
  replanned(started);
}
