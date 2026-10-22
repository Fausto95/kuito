// JSX → render plan. Runs before the commit point: everything here is pure
// apart from tracked reads, and a throw leaves the committed UI untouched.
import {
  CaughtRender,
  catchBoundary,
  loadingBoundary,
  TRY,
  type Boundary,
  type CarriedCatches,
} from './boundaries';
import { refreshError } from './errors';
import type { EventHandler } from './events';
import { eachKeys, eachRow } from './each';
import { applyIntrinsicSize } from './intrinsic-size';
import { isModuleKind, moduleViewEvents, moduleViewName, moduleViewTakesChildren } from './modules';
import type { PatchApi } from './registration';
import { CONTAINERS, KIND_VARIANTS, NATIVE_KINDS } from './protocol.generated';
import { inheritsSame } from './inherited';
import { CONTENT, release, resourcesUnder, veil, type VeiledView } from './loading';
import { applyClasses } from './plan-classes';
import { applyProps, textBinding, type PropsPlan } from './plan-props';
import { numericLength, resolveLengths } from './plan-values';
import { computed, isSignalLike, readTracked, type AnySignal } from './signals';
import {
  componentDefinitions,
  componentNumbers,
  type CachedInstance,
  type Component,
  type ComponentNode,
  type Instances,
  type RenderingContext,
} from './state/components';
import type { Environment, Provision } from './state/inherited';
import { modules, type Extent } from './state/modules';
import { tracking } from './state/signals';
import type { HeldIds, Rebind } from './state/threads';
import { views } from './state/views';
import { claimScope } from './thread-ids';
import { resolveStyle } from './style-conditions';
import { viewNumber } from './view-ids';
import { describeValue, dict, isFunction, own, type PlainData } from './values';

export interface Ref {
  current: unknown;
}

/** A prop computed from signals; re-evaluated when one of them changes. */
export interface Binding {
  key: string;
  evaluate: () => unknown;
  dependencies: AnySignal[];
  /**
   * What the app passed: the prop's thunk, or a text label's children. A plan
   * that meets the same one again (a cached component's tree) keeps the
   * binding's value and dependencies instead of evaluating it.
   */
  source?: unknown;
  fingerprint?: string | null;
  /** The signal the prop was handed: a view that changes the prop itself writes it. */
  signal?: { readonly value: unknown };
}

export interface PlannedView {
  id: number;
  label: string;
  owner: string;
  kind: string;
  parent: number | null;
  props: Record<string, unknown>;
  bindings: Binding[];
  ref: Ref | null;
  /** Whether the node has an event handler. */
  listens: boolean;
  /** The path of the component that rendered it; null at the module's root. */
  component: string | null;
  environment: Environment | null;
}

interface Element {
  type: unknown;
  props: Record<string, unknown>;
}

/**
 * A branch owner the plan walked (a Show, a flow Switch, a reactive child
 * expression): what a re-plan of its branch alone starts from, and where its
 * views, components and handlers sit in the plan's lists.
 */
export interface PlannedScope {
  path: string;
  /** The owner's element or expression, as walked. */
  node: unknown;
  parent: number | null;
  fontSize: number;
  /** The component it is in; null at the module's root. */
  component: string | null;
  /** What its place inherits. */
  environment: Environment | null;
  /** The parents whose children a waiting Loading hides there. */
  veiled: (number | null)[];
  /** The signals its conditions read: a change re-plans the branch. */
  conditions: AnySignal[];
  start: Extent;
  end: Extent;
  /** The remote and signal ids its branch encodes, nested branches' included. */
  held: HeldIds;
  boundary: Boundary | null;
}

export interface PlanInput {
  moduleId: string;
  root: unknown;
  /** The view the root views are created in; null for the screen's root. */
  parent: number | null;
  /** Where `root` sits: its path, its inherited font size, the component it is in and what it inherits. */
  at: {
    path: string;
    fontSize: number;
    component: string | null;
    environment: Environment | null;
    veiled: (number | null)[];
  };
  /**
   * A branch's re-plan: the committed views it may take over. Any other view
   * of the module is outside the branch and keeps its id.
   */
  taking: Set<number> | null;
  /** Evaluate unchanged expressions again instead of keeping their values. */
  reevaluate: boolean;
  api: PatchApi;
  /** Event handlers registered by the plan, committed with it. */
  pendingHandlers: Record<string, EventHandler>;
  /** Handlers that run on the UI thread: the operation fields, by event key. */
  uiHandlers: Record<string, PlainData>;
  /** Component instances to keep for the next patch. */
  nextCache: Record<string, CachedInstance>;
  /** Paths of components rendered by this plan. */
  activePaths: Record<string, true>;
  /** Signals that decide structure outside any branch owner: changing one re-plans the module. */
  structural: AnySignal[];
  /** The branch owners it walked, in walk order. */
  scopes: PlannedScope[];
  /** The component instances the plan rendered, parents first. */
  components: ComponentNode[];
  instances: Instances;
  /** Gesture callback remotes the commit points at new functions. */
  rebinds: Rebind[];
  /** What failed attempts at this plan threw, by the Catch that took it. */
  carried?: CarriedCatches;
  /** A Live Patch: every Catch renders its children again. */
  newCode?: boolean;
}

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && 'props' in node && isRecord(node.props);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRef(value: unknown): value is Ref {
  return typeof value === 'object' && value !== null && 'current' in value;
}

function definitionId(type: Component): string | undefined {
  const id: unknown = '__kuitoDefinitionId' in type ? type.__kuitoDefinitionId : undefined;

  return typeof id === 'string' ? id : undefined;
}

/**
 * Compiled JSX passes attribute expressions as thunks. A component reads them
 * through getters, as with Solid's props: `props.show.name` is a value, and a
 * read inside a reactive expression tracks the signals behind it.
 */
function propsView(props: Record<string, unknown>): Record<string, unknown> {
  const view: Record<string, unknown> = {};

  Object.keys(props).forEach((key) => {
    const value = props[key];

    if (isFunction(value) && '__kuitoExprKey' in value)
      Object.defineProperty(view, key, { get: () => value(), enumerable: true });
    else view[key] = value;
  });

  return view;
}

function onlyChild(children: unknown): unknown {
  return Array.isArray(children) && children.length === 1 ? children[0] : children;
}

/** A single callback child receives the truthy `when` value, as in Solid. */
function branch(children: unknown, value: unknown): unknown {
  const only = onlyChild(children);

  return isFunction(only) && only.length > 0 ? only(value) : children;
}

export function buildRenderPlan(input: PlanInput): PlannedView[] {
  const { moduleId, api, pendingHandlers, uiHandlers, nextCache, activePaths, structural } = input;
  const result: PlannedView[] = [];
  const ids = dict<true>();
  /** The component whose render is being walked. */
  let owner: string | null = input.at.component;
  /** What the place being walked inherits: the provisions of the components above it. */
  let environment: Environment | null = input.at.environment;
  /** Whether labels whose source is unchanged are evaluated again, here. */
  let reevaluate = input.reevaluate;
  /** The innermost branch owner being walked. */
  let scope: PlannedScope | null = null;
  /** Parents whose children a waiting Loading hides; one entry per Loading. */
  const veiled = input.at.veiled.slice();
  /** The Loadings this plan walks now, innermost last, and the views each hid. */
  const veiling: { parent: number | null; views: VeiledView[] }[] = [];
  /** Resources a nested Loading waits for, which the Loadings around it leave. */
  const claimedResources = new Set<string>();
  const handlerCount = { js: 0, ui: 0 };

  let committed: Map<string, Boundary> | null = null;

  /** The state the module committed for the boundary at `path`. */
  function committedBoundary(path: string): Boundary | undefined {
    if (!committed) {
      const byPath = new Map<string, Boundary>();

      if (own(modules, moduleId))
        modules[moduleId].scopes.forEach((record) => {
          if (record.boundary) byPath.set(record.path, record.boundary);
        });

      committed = byPath;
    }

    return committed.get(path);
  }

  /** Evaluate a `when` with tracking; its signals re-plan the innermost branch owner. */
  function condition(when: unknown): unknown {
    const tracked = readTracked(() => {
      const value = isFunction(when) ? when() : when;

      return isSignalLike(value) ? value.value : value;
    });

    depend(tracked.dependencies);

    return tracked.value;
  }

  function depend(signals: AnySignal[]): void {
    (scope ? scope.conditions : structural).push(...signals);
  }

  function extent(): Extent {
    return {
      views: result.length,
      components: input.components.length,
      handlers: handlerCount.js,
      uiHandlers: handlerCount.ui,
    };
  }

  /** Walk a branch owner as a scope of its own, which a re-plan can walk again alone. */
  function scoped(
    node: unknown,
    parent: number | null,
    path: string,
    fontSize: number,
    body: (record: PlannedScope) => void,
  ): void {
    const record: PlannedScope = {
      path,
      node,
      parent,
      fontSize,
      component: owner,
      environment,
      veiled: veiled.slice(),
      conditions: [],
      start: extent(),
      end: extent(),
      held: { remotes: [], signals: [] },
      boundary: null,
    };
    const outer = scope;

    input.scopes.push(record);
    scope = record;

    try {
      record.held = claimScope(() => body(record));
    } finally {
      scope = outer;
    }

    record.end = extent();
  }

  function setHandler(key: string, handler: EventHandler): void {
    if (!own(pendingHandlers, key)) handlerCount.js++;

    pendingHandlers[key] = handler;
  }

  function setUIHandler(key: string, operation: PlainData): void {
    if (!own(uiHandlers, key)) handlerCount.ui++;

    uiHandlers[key] = operation;
  }

  const propsPlan: PropsPlan = {
    moduleId,
    rebinds: input.rebinds,
    pendingHandlers,
    uiHandlers,
    condition,
    setHandler,
    setUIHandler,
  };

  function walk(node: unknown, parent: number | null, path: string, fontSize: number): void {
    if (node === null || node === undefined || node === false) return;

    if (Array.isArray(node)) return walkList(node, parent, path, fontSize);

    // A reactive child expression (`{cond ? <A /> : null}`) decides structure:
    // its signals re-plan its branch when they change.
    if (isFunction(node))
      return scoped(node, parent, path, fontSize, () => {
        const expression = readTracked(() => {
          const value: unknown = node();

          return isSignalLike(value) ? value.value : value;
        });

        depend(expression.dependencies);
        walk(expression.value, parent, path + '.expr', fontSize);
      });

    if (!isElement(node)) throw new TypeError('Kuito UI requires JSX elements');

    const { type, props } = node;

    if (type === 'Fragment') return walk(props.children, parent, path + '.fragment', fontSize);

    // Control flow, after Solid: each branch has its own path, so switching
    // branches unmounts one subtree (playing `exiting`) and mounts the other.
    if (type === 'Show')
      return scoped(node, parent, path, fontSize, () => {
        const shown = condition(props.when);

        if (shown) walk(branch(props.children, shown), parent, path + '.show', fontSize);
        else walk(props.fallback, parent, path + '.fallback', fontSize);
      });

    if (type === 'Switch')
      return scoped(node, parent, path, fontSize, () => walkSwitch(props, parent, path, fontSize));

    if (type === 'Match') throw new TypeError('Match must be a direct child of Switch');

    if (type === 'For')
      return scoped(node, parent, path, fontSize, () => walkFor(props, parent, path, fontSize));

    if (type === 'Catch')
      return scoped(node, parent, path, fontSize, (record) =>
        walkCatch(record, props, parent, path, fontSize),
      );

    if (type === 'Loading')
      return scoped(node, parent, path, fontSize, (record) =>
        walkLoading(record, props, parent, path, fontSize),
      );

    if (isFunction(type)) return walkComponent(type, props, parent, path, fontSize);

    walkNative(type, props, parent, path, fontSize);
  }

  function walkList(nodes: unknown[], parent: number | null, path: string, fontSize: number) {
    const seen = dict<true>();

    nodes.forEach((entry, index) => {
      const key = isElement(entry) ? entry.props.key : undefined;
      const label = describeValue(key);
      const segment = key == null ? String(index) : 'key:' + encodeURIComponent(label);

      if (own(seen, segment))
        throw refreshError(
          'DUPLICATE_KEY',
          'Two sibling elements use the key "' + label + '".',
          'Assign unique keys to children in lists.',
        );

      seen[segment] = true;
      walk(entry, parent, path + '.' + segment, fontSize);
    });
  }

  function walkSwitch(
    props: Record<string, unknown>,
    parent: number | null,
    path: string,
    fontSize: number,
  ) {
    const children = props.children ?? [];
    const matches = (Array.isArray(children) ? children : [children]).filter(Boolean);

    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];

      if (!isElement(match) || match.type !== 'Match')
        throw new TypeError('Switch children must be Match elements');

      const matched = condition(match.props.when);

      if (matched) {
        walk(branch(match.props.children, matched), parent, path + '.match' + index, fontSize);

        return;
      }
    }

    walk(props.fallback, parent, path + '.fallback', fontSize);
  }

  /**
   * Children, or the fallback for what they threw. A throw while walking
   * them fails the whole plan, which is planned again with this Catch showing
   * its fallback: what the children planned before the throw is not committed.
   */
  function walkCatch(
    record: PlannedScope,
    props: Record<string, unknown>,
    parent: number | null,
    path: string,
    fontSize: number,
  ) {
    const boundary = catchBoundary(
      committedBoundary(path),
      input.carried?.get(path),
      !!input.newCode,
    );
    const tracked = readTracked(() => boundary.caught.value);
    const caught = tracked.value;

    depend(tracked.dependencies);
    record.boundary = boundary;

    if (caught) {
      const retry = () => {
        boundary.caught.value = null;
      };
      let shown: unknown = props.fallback;

      // `fallback={renderError}` compiles to an expression that returns the function.
      if (isFunction(shown) && '__kuitoExprKey' in shown) {
        const expression = shown;
        const fallback = readTracked(() => expression());

        depend(fallback.dependencies);
        shown = fallback.value;
      }

      if (isFunction(shown) && !('__kuitoExprKey' in shown)) shown = shown(caught.error, retry);

      return walk(shown, parent, path + '.caught', fontSize);
    }

    try {
      walk(props.children, parent, path + TRY, fontSize);
    } catch (error) {
      if (error instanceof CaughtRender) throw error;

      throw new CaughtRender(path, error);
    }
  }

  /**
   * Children, hidden with the fallback beside them until the resources they
   * start have settled. Which resources is known once the children are
   * walked, so they are walked hidden and shown again when none is pending.
   * The Loading follows whether all have settled: it re-plans once, then.
   */
  function walkLoading(
    record: PlannedScope,
    props: Record<string, unknown>,
    parent: number | null,
    path: string,
    fontSize: number,
  ) {
    const prior = loadingBoundary(committedBoundary(path));

    record.boundary = prior;

    // What is under this Loading, its fallback included, the Loadings around it leave to it.
    const claimAll = () =>
      resourcesUnder(moduleId, path + '.', api, input.instances, activePaths, claimedResources);

    if (prior.revealed) {
      walk(props.children, parent, path + CONTENT, fontSize);
      claimAll();

      return;
    }

    const views: VeiledView[] = [];
    const hiding = { parent, views };

    const depth = veiled.push(parent) - 1;
    const nested = input.scopes.length;

    veiling.push(hiding);

    try {
      walk(props.children, parent, path + CONTENT, fontSize);
    } finally {
      veiled.splice(depth, 1);
      veiling.pop();
    }

    const settled = resourcesUnder(
      moduleId,
      path + CONTENT + '.',
      api,
      input.instances,
      activePaths,
      claimedResources,
    );
    const all = computed(() => settled.every((each) => each.value));
    const ready = readTracked(() => all.value);

    depend(ready.dependencies);

    if (!ready.value) {
      walk(props.fallback, parent, path + '.fallback', fontSize);
      claimAll();

      return;
    }

    record.boundary = { kind: 'loading', revealed: true };
    hiding.views.forEach(release);
    // The owners inside re-plan later without this Loading's veil.
    input.scopes.slice(nested).forEach((inner) => inner.veiled.splice(depth, 1));
  }

  /**
   * A row per item of `each`, keyed by the item. Reading `each` (its signal,
   * or a store array's length and indexes) re-plans the For alone, and a
   * row whose item stayed returns its tree as it was, so a reorder only
   * moves views.
   */
  function walkFor(
    props: Record<string, unknown>,
    parent: number | null,
    path: string,
    fontSize: number,
  ) {
    const render = onlyChild(props.children);

    if (!isFunction(render))
      throw new TypeError('For takes one function child: (item, index) => element');

    const each = readTracked(() => {
      const value = isFunction(props.each) ? props.each() : props.each;
      const items = isSignalLike(value) ? value.value : value;

      if (!Array.isArray(items))
        throw new TypeError('For each takes an array, a signal of one, or a store array');

      // Copied inside the read, so a store array's every index is tracked.
      return items.slice();
    });

    depend(each.dependencies);

    if (each.value.length === 0) return walk(props.fallback, parent, path + '.fallback', fontSize);

    const cached = own(modules, moduleId) ? modules[moduleId].instances : null;

    eachKeys(each.value).forEach((key, position) => {
      const rowPath = path + '.each:' + encodeURIComponent(key);
      const row = eachRow(
        cached && own(cached, rowPath) ? cached[rowPath] : undefined,
        render,
        each.value[position],
        position,
      );

      nextCache[rowPath] = row;
      walk(row.tree, parent, rowPath, fontSize);
    });
  }

  function walkComponent(
    type: Component,
    props: Record<string, unknown>,
    parent: number | null,
    position: string,
    fontSize: number,
  ) {
    const identity = definitionId(type);
    const name = identity
      ? identity.slice(identity.lastIndexOf('#') + 1)
      : type.name || 'Anonymous';
    const key =
      typeof props.key === 'string' || typeof props.key === 'number' ? String(props.key) : null;
    // An instance is its place, its component and its key, as in React: each
    // is in its path, so another component or key at a place is a new
    // instance with state of its own, and the one that left is released.
    const path =
      position +
      '.' +
      componentNumber(identity ?? name) +
      (key === null ? '' : ':' + encodeURIComponent(key));
    const node: ComponentNode = { path, name, parent: owner, key, props };

    activePaths[path] = true;
    input.components.push(node);

    const definition = identity ? componentDefinitions[identity] : undefined;
    const implementation = definition ? definition.fn : type;
    const cached = own(modules, moduleId) ? modules[moduleId].instances : null;
    const previous = cached && own(cached, path) ? cached[path] : undefined;
    const propsUnchanged =
      !!previous &&
      Object.keys(previous.props).length === Object.keys(props).length &&
      Object.keys(props).every((name) => Object.is(previous.props[name], props[name]));
    const inheritsUnchanged = !previous || inheritsSame(environment, previous.inherits);
    const canRetain =
      !!definition &&
      definition.cacheable &&
      !!previous &&
      previous.id === identity &&
      previous.hash === definition.hash &&
      propsUnchanged &&
      inheritsUnchanged;
    let rendered: unknown;
    let provisions: readonly Provision[];
    let inherits: readonly Provision[];

    if (canRetain && previous) {
      rendered = previous.tree;
      provisions = previous.provisions;
      inherits = previous.inherits;
    } else {
      const outer = tracking.rendering;
      const context: RenderingContext = {
        api,
        path,
        ordinals: dict<number>(),
        names: dict<number>(),
        instances: input.instances,
        inherited: environment,
        provisions: [],
        inherits: [],
      };

      tracking.rendering = context;
      input.instances.ran[path] = true;

      try {
        rendered = implementation(propsView(props));
      } finally {
        tracking.rendering = outer;
      }

      provisions = context.provisions;
      inherits = context.inherits;
    }

    if (definition?.cacheable && identity)
      nextCache[path] = {
        id: identity,
        hash: definition.hash,
        props: { ...props },
        tree: rendered,
        provisions,
        inherits,
      };

    const outer = { owner, environment, reevaluate };

    owner = path;
    // Its labels read what it inherited: the same source no longer means the same value.
    reevaluate ||= !inheritsUnchanged;

    environment = provisions.reduce<Environment | null>(
      (above, { key, value }) => ({ key, value, outer: above }),
      environment,
    );

    try {
      walk(rendered, parent, path + '.render', fontSize);
    } finally {
      ({ owner, environment, reevaluate } = outer);
    }
  }

  function walkNative(
    type: unknown,
    props: Record<string, unknown>,
    parent: number | null,
    path: string,
    inheritedFontSize: number,
  ) {
    if (typeof type !== 'string' || (NATIVE_KINDS.indexOf(type) === -1 && !isModuleKind(type)))
      throw new Error('Unsupported native view type: ' + String(type));

    // A module's view: its on* props are the events it declares, and it is a
    // leaf unless it declares children.
    const moduleEvents = isModuleKind(type) ? moduleViewEvents(type) : null;
    const moduleContainer = moduleEvents !== null && moduleViewTakesChildren(type);

    if (moduleEvents && !moduleContainer && props.children !== undefined)
      throw new TypeError('Native view ' + moduleViewName(type) + ' takes no children.');

    // Some native views are fixed when made (a scroll view's axis, a field's
    // wrapping), so the variant is its own kind and changing it remounts it.
    // A prop not given costs no tracked read.
    const variant = own(KIND_VARIANTS, type) ? KIND_VARIANTS[type] : null;
    const picked = variant && props[variant.prop] !== undefined && condition(props[variant.prop]);
    const kind = variant && picked ? variant.kind : type;

    const label = props.id === undefined ? '__kuito:' + moduleId + ':' + path : props.id;

    if (typeof label !== 'string' || !label || own(ids, label))
      throw new Error('Kuito native views require unique IDs');

    const id = viewNumber(label);
    const committed = views.get(id);

    if (committed && committed.owner !== moduleId)
      throw new Error('View owned by another module: ' + label);

    // A branch's re-plan meets a label a view outside the branch has.
    if (committed && input.taking && !input.taking.has(id))
      throw new Error('Kuito native views require unique IDs');

    ids[label] = true;

    const fields = dict<unknown>();
    const bindings: Binding[] = [];

    // A class expression decides which props a view has: its signals re-plan
    // the view's branch, as a condition's do. A class's props that follow
    // system state follow it as bindings, which a prop of the view's own replaces.
    const following = applyClasses(
      isFunction(props.class) || isSignalLike(props.class) ? condition(props.class) : props.class,
      fields,
    );

    // Text/Button children are their reactive label; VStack children are views.
    if ((kind === 'Text' || kind === 'Button') && props.children !== undefined) {
      if (props.text !== undefined) throw new Error('Use text or children, not both');

      bindings.push(textBinding(id, kind, props.children, fields, reevaluate));
    }

    const listens = applyProps(
      propsPlan,
      id,
      label,
      kind,
      props,
      fields,
      bindings,
      moduleEvents,
      following,
    );
    const fontSize = resolveLengths(label, fields, inheritedFontSize);

    Object.keys(following).forEach((key) => {
      const { value, dependencies } = following[key];
      const evaluate = () => {
        const resolved = resolveStyle(value);

        return resolved === undefined ? null : numericLength(resolved, fontSize);
      };

      bindings.push({ key, evaluate, dependencies });
    });

    applyIntrinsicSize(kind, fields, bindings);

    // Container font-size is inherited metadata rather than a native setter.
    if (CONTAINERS.indexOf(kind) !== -1) delete fields.fontSize;

    if (veiled.indexOf(parent) !== -1) {
      const holding = veiling.filter((each) => each.parent === parent);
      // A Loading a re-planned branch is in hides it too, and is not walked here to let go.
      const hidden = veil(
        parent,
        fields,
        bindings,
        veiled.filter((each) => each === parent).length,
      );

      holding.forEach((each) => each.views.push(hidden));
    }

    result.push({
      id,
      label,
      owner: moduleId,
      kind,
      parent,
      props: fields,
      bindings,
      ref: isRef(props.ref) ? props.ref : null,
      listens,
      component: owner,
      environment,
    });

    if ((moduleContainer || CONTAINERS.indexOf(kind) !== -1) && props.children !== undefined)
      walk(props.children, id, path + '.children', fontSize);
  }

  walk(input.root, input.parent, input.at.path, input.at.fontSize);

  return result;
}

/** A short, stable number for a component definition, for instance paths. */
function componentNumber(identity: string): string {
  let number = componentNumbers.get(identity);

  if (number === undefined) {
    number = componentNumbers.size + 1;
    componentNumbers.set(identity, number);
  }

  return 'c' + number;
}
