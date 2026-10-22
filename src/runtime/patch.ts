// patch(): register a module, plan its UI, then commit. Everything before the
// commit point is pure or undone by the host batch, so a throw leaves the
// previous UI and state active.
import { CaughtRender, type CarriedCatches } from './boundaries';
import { commitPlan, removeViews } from './commit';
import { modulesChanged, replanned, replanStarted } from './devtools';
import { noteStates } from './write-log';
import { reportError, reportWarning } from './errors';
import { followPlan, releaseFollowers } from './follow';
import { dispose as stopWatching, followExactly, makeWatcher } from './reactive-graph';
import { hookChanges, reconcileHooks, releaseHooks } from './hooks';
import { inheritedAt } from './inherited';
import { buildRenderPlan, type PlannedScope } from './plan';
import { reconcile } from './reconcile';
import {
  carryRecords,
  commitUIHandlers,
  createRegistration,
  uiHandlerKey,
  type PatchApi,
} from './registration';
import { NO_EXTENT, releaseScopes, replanScope, scopeRecords, type ScopeListener } from './scopes';
import type { AnySignal } from './signals';
import type { CachedInstance, ComponentNode, HookSlot } from './state/components';
import { handlers, modules, replans, stateStore, type Follower } from './state/modules';
import { tracking } from './state/signals';
import { settings } from './state/styles';
import { claiming, hold, NOTHING_HELD, rebindRemotes } from './thread-ids';
import { checkMotionSources } from './motion-sources';
import { atomically, whenLanded } from './transaction';
import { viewNumber } from './view-ids';
import { dict, isFunction, own, type PlainData } from './values';

// Structural changes re-plan once per task, after the writes: the branch
// owners whose conditions changed, or the whole module for a signal read
// outside any owner (and when a branch cannot re-plan alone). While the UI
// thread is behind, they wait for it to catch up (`host.idle`) and run once:
// a re-plan's batch would only queue behind the ones it has not applied.
function request(moduleId: string, path: string | null): void {
  if (own(replans, moduleId)) {
    const due = replans[moduleId];

    if (path === null) due.whole = true;
    else if (due.scopes.indexOf(path) === -1) due.scopes.push(path);

    return;
  }

  replans[moduleId] = {
    whole: path === null,
    scopes: path === null ? [] : [path],
    cause: tracking.cause,
  };

  if (globalThis.__kuitoHostBusy?.() !== true) void Promise.resolve().then(() => replan(moduleId));
}

/** The UI thread caught up: the re-plans that waited for it run. */
export function hostIdle(): void {
  for (const moduleId of Object.keys(replans)) replan(moduleId);
}

function replan(moduleId: string): void {
  // A re-plan that waited ran already when the host caught up first.
  if (!own(replans, moduleId)) return;

  const due = replans[moduleId];
  const outer = tracking.cause;

  delete replans[moduleId];
  tracking.cause = due.cause;

  try {
    replanDue(moduleId, due);
  } finally {
    tracking.cause = outer;
  }
}

function replanDue(moduleId: string, due: { whole: boolean; scopes: string[] }): void {
  const module = own(modules, moduleId) ? modules[moduleId] : null;

  if (!module) return;

  if (!due.whole)
    try {
      replanBranches(moduleId, due.scopes);

      return;
    } catch {
      // The module's re-plan below covers the branch; its error, if any, is the one to report.
    }

  try {
    // The same source runs with other values, so its expressions are evaluated again.
    patch(moduleId, module.register, { parent: module.parent, reevaluate: true });
  } catch (error) {
    // patch() commits nothing on failure; the previous UI stays.
    reportError('re-render of ' + moduleId + ' failed', error);
  }
}

/** An owner re-planned takes its nested owners along, so only the outermost due ones run. */
function replanBranches(moduleId: string, paths: string[]): void {
  const order = modules[moduleId].scopes.map((record) => record.path);

  paths
    .filter((path) => !paths.some((other) => path.startsWith(other + '.')))
    .sort((left, right) => order.indexOf(left) - order.indexOf(right))
    .forEach((path) => replanScope(moduleId, path, scopeListener(moduleId)));

  const module = modules[moduleId];

  modules[moduleId] = { ...module, revision: module.revision + 1 };
}

const scopeListener =
  (moduleId: string): ScopeListener =>
  (path) =>
  () =>
    request(moduleId, path);

/** Each module's one structural listener, so a batch writing several signals re-plans it once. */
const moduleListeners = new Map<string, () => void>();

function moduleListener(moduleId: string): () => void {
  let listener = moduleListeners.get(moduleId);

  if (!listener) {
    listener = () => request(moduleId, null);
    moduleListeners.set(moduleId, listener);
  }

  return listener;
}

export interface PatchOptions {
  /** The label of the view the module's root views are created in; the screen's root by default. */
  parent?: string | null;
  /**
   * Evaluate every JSX expression again, even one whose source is unchanged:
   * a recycled list cell renders another item from the same code, and a
   * re-render passes components other props.
   */
  reevaluate?: boolean;
}

export function patch(moduleId: string, register: unknown, options: PatchOptions = {}): number {
  if (!moduleId || !isFunction(register))
    throw new TypeError('patch requires moduleId and registration');

  const newCode = own(modules, moduleId) && modules[moduleId].register !== register;

  return patchCarrying(moduleId, register, options, newCode, new Map());
}

/**
 * Each attempt that a Catch took a render error in is planned again with one
 * more Catch showing its fallback. A Catch whose path changes on every render
 * (a For row keyed by a new object each time) would take its error forever.
 */
const MAX_CAUGHT = 100;

function patchCarrying(
  moduleId: string,
  register: (api: PatchApi) => void,
  options: PatchOptions,
  newCode: boolean,
  caught: CarriedCatches,
): number {
  const parent = options.parent ?? null;
  const previous = own(modules, moduleId) ? modules[moduleId] : null;

  const started = replanStarted();
  const registration = createRegistration(moduleId);
  const nextCache = dict<CachedInstance>();
  const activePaths = dict<true>();
  const structural: AnySignal[] = [];
  const planned: PlannedScope[] = [];
  const components: ComponentNode[] = [];

  // All user registration, JSX traversal and initial computed values happen
  // before the commit boundary. Exceptions leave active modules untouched,
  // and free the remotes and signals the attempt encoded.
  const previousIds = previous ? previous.viewIds : null;
  const prepare = () =>
    claiming(() => {
      register(registration.api);

      const root = registration.rendered.root;
      const plan = root
        ? buildRenderPlan({
            moduleId,
            root: root.tree,
            parent: parent === null ? null : viewNumber(parent),
            at: {
              path: 'root',
              fontSize: settings.rootFontSize,
              component: null,
              environment: parent === null ? null : inheritedAt(parent),
              veiled: [],
            },
            taking: null,
            reevaluate: !!options.reevaluate,
            api: registration.api,
            pendingHandlers: registration.handlers,
            uiHandlers: registration.uiHandlers,
            nextCache,
            activePaths,
            structural,
            scopes: planned,
            components,
            instances: registration.instances,
            rebinds: registration.rebinds,
            carried: caught,
            newCode,
          })
        : null;
      const reconciliation = plan ? reconcile(plan, previousIds) : null;

      if (plan) checkMotionSources(registration.handlers, previous ? previous.handlerKeys : []);

      // The host batch: a throw in it undoes the views and keeps the previous
      // module, its handlers and its subscriptions.
      atomically(() => {
        rebindRemotes(registration.rebinds);
        commitUIHandlers(previous ? previous.uiHandlerKeys : [], registration.uiHandlers);

        if (plan && reconciliation) commitPlan(moduleId, plan, previousIds, reconciliation);
      });

      return plan;
    });
  let prepared: ReturnType<typeof prepare>;

  try {
    prepared = prepare();
  } catch (error) {
    if (!(error instanceof CaughtRender)) throw error;

    if (caught.size >= MAX_CAUGHT) {
      reportWarning(
        'A Catch in ' +
          moduleId +
          ' took a render error at a new place on each of ' +
          MAX_CAUGHT +
          ' renders; give the rows or components around it stable keys.',
      );

      throw error.error;
    }

    // A Catch took a render error: plan again, with it showing its fallback.
    caught.set(error.path, { error: error.error });

    return patchCarrying(moduleId, register, options, newCode, caught);
  }

  const { result: plan, claimed } = prepared;

  // Commit point. Subscriptions move to the new plan: each binding and
  // structural signal it kept keeps its subscription.
  const followers = previous ? previous.followers : dict<Follower>();
  const structuralWatcher = previous ? previous.structural : makeWatcher(moduleListener(moduleId));

  followExactly(structuralWatcher, structural);

  if (previous) previous.handlerKeys.forEach((key) => delete handlers[key]);

  const previousHooks = previous ? previous.hooks : dict<HookSlot>();
  const hooks = plan
    ? reconcileHooks(moduleId, previousHooks, registration.instances, activePaths)
    : previousHooks;

  registration.stateKeys.forEach((key) => {
    stateStore[key] = registration.states[key];
  });

  noteStates(moduleId, hooks);

  // A Live Patch brings new code; a re-plan reruns the same.
  if (previous && previous.register !== register) {
    const before = dict<true>();

    previous.components.forEach((node) => {
      before[node.path] = true;
    });

    const changes = hookChanges(previousHooks, hooks, registration.instances, components, before);

    if (changes.length)
      reportWarning(
        'Live Patch changed hooks: ' +
          changes.join('; ') +
          '. The other hooks kept their state; new ones start from their initial values.',
      );
  }

  Object.keys(registration.handlers).forEach((key) => {
    handlers[key] = { owner: moduleId, invoke: registration.handlers[key] };
  });

  const carried = previous
    ? carryRecords(previous, registration, activePaths)
    : { lifecycle: [], asyncRecords: [] };
  const revision = previous ? previous.revision + 1 : 1;
  // A module that rendered nothing keeps its views, and what they hold.
  const held = plan || !previous ? claimed : previous.held;

  hold(previous ? previous.held : NOTHING_HELD, held);

  modules[moduleId] = {
    register,
    revision,
    handlerKeys: Object.keys(registration.handlers),
    uiHandlerKeys: Object.keys(registration.uiHandlers).map(uiHandlerKey),
    // A module that rendered nothing keeps its views and their bindings.
    followers: plan ? followPlan(followers, plan) : followers,
    structural: structuralWatcher,
    scopes: plan
      ? scopeRecords(planned, NO_EXTENT, previous ? previous.scopes : [], scopeListener(moduleId))
      : (previous?.scopes ?? []),
    asyncRecords: carried.asyncRecords.concat(registration.asyncRecords),
    lifecycleRecords: carried.lifecycle.concat(registration.lifecycle),
    hooks,
    instances: plan ? nextCache : (previous?.instances ?? dict<CachedInstance>()),
    components,
    viewIds: plan ? plan.map((view) => view.id) : (previousIds ?? []),
    parent,
    held,
  };

  registration.asyncRecords.forEach((record) => record.mount());
  registration.lifecycle.forEach((record) => record.mount());
  replanned(started);

  return revision;
}

/**
 * Tear down a module: subscriptions, records, handlers, views and the state
 * of its components' hooks. State it declared itself (`api.state`) stays for
 * the next patch of the module.
 */
export function dispose(moduleId: string): boolean {
  const previous = own(modules, moduleId) ? modules[moduleId] : null;

  if (!previous) return false;

  // Inside a commit (a removed list's cells), the module lives until the
  // batch lands; its cleanups run before its refs are cleared.
  atomically(() => {
    whenLanded(() => {
      releaseFollowers(previous.followers);
      stopWatching(previous.structural);
      releaseScopes(previous.scopes);
      previous.asyncRecords.forEach((record) => record.dispose());
      previous.lifecycleRecords.forEach((record) => record.dispose());
      previous.handlerKeys.forEach((key) => delete handlers[key]);
      commitUIHandlers(previous.uiHandlerKeys, dict<PlainData>());

      releaseHooks(moduleId, previous.hooks);
      hold(previous.held, NOTHING_HELD);

      delete modules[moduleId];
      modulesChanged();
    });

    removeViews(previous.viewIds.slice().reverse());
  });

  return true;
}
