// The binding graph the Components panel shows (docs/devtools.md): component
// instances, the views they rendered, the binding behind each prop, the
// signals each binding last read, and what each signal drives. Everything is
// read from the kernel's store when the panel asks, so the graph costs the
// app nothing while nobody looks.
import type {
  Branch,
  ComponentDetails,
  ComponentRef,
  Drive,
  HookDetails,
  PropDetails,
  Shown,
  SignalDetails,
  SignalRef,
  TreeNode,
  ViewDetails,
  ViewRef,
} from './devtools-protocol';
import { followsSignal, signalsOf } from './reactive-graph';
import { isSignal, type AnySignal } from './signals';
import type { ComponentNode, HookSlot } from './state/components';
import { devtools, type Cause } from './state/devtools';
import { modules, stateStore } from './state/modules';
import { motionHandles } from './state/motion';
import { signalNames } from './state/signals';
import { views } from './state/views';
import { dict, isFunction, own } from './values';
import { findView, viewOf } from './view-ids';

/** Nesting shown at once; deeper values show as `…`. */
const DEPTH = 4;
/** Array items shown at once. */
const ITEMS = 100;

/** A mounted instance, keyed `<module>:<path>`. */
export interface Instance {
  key: string;
  module: string;
  node: ComponentNode;
  parent: string | null;
}

/** The instance of component `path` in `module`, with its ancestors: null at the module's root. */
function instanceKey(module: string, path: string | null): string | null {
  return path === null ? null : module + ':' + path;
}

/** The component that rendered view `id`, or its nearest ancestor view's. */
export function ownerOf(id: number | null): string | null {
  for (
    let view = id === null ? undefined : views.get(id);
    view;
    view = view.parent === null ? undefined : views.get(view.parent)
  )
    if (view.component !== null) return instanceKey(view.owner, view.component);

  return null;
}

/** Every mounted instance, each after its parent. */
export function instances(): Instance[] {
  const all: Instance[] = [];

  Object.keys(modules).forEach((module) => {
    // A module rendered into a view (a list cell) hangs under that view's component.
    const { parent: label, components } = modules[module];
    const outer = label === null ? null : ownerOf(findView(label));

    components.forEach((node) => {
      all.push({
        key: module + ':' + node.path,
        module,
        node,
        parent: node.parent === null ? outer : module + ':' + node.parent,
      });
    });
  });

  const keys = byKey(all);
  const depth = (instance: Instance): number =>
    instance.parent !== null && own(keys, instance.parent) ? depth(keys[instance.parent]) + 1 : 0;

  return all
    .map((instance, index) => ({ instance, index, depth: depth(instance) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .map(({ instance }) => instance);
}

function byKey(all: Instance[]): Record<string, Instance> {
  const keys = dict<Instance>();

  all.forEach((instance) => {
    keys[instance.key] = instance;
  });

  return keys;
}

/** The panel's number for an instance, stable while it lives. */
export function componentId(key: string): number {
  if (!own(devtools.ids, key)) devtools.ids[key] = devtools.nextId++;

  return devtools.ids[key];
}

export function findInstance(id: number): Instance | undefined {
  return instances().find((instance) => devtools.ids[instance.key] === id);
}

export function tree(): TreeNode[] {
  const all = instances();
  const keys = byKey(all);

  return all.map((instance) => ({
    id: componentId(instance.key),
    name: instance.node.name,
    key: instance.node.key,
    parent:
      instance.parent !== null && own(keys, instance.parent) ? componentId(instance.parent) : null,
  }));
}

function refOf(instance: Instance): ComponentRef {
  return { id: componentId(instance.key), name: instance.node.name, key: instance.node.key };
}

function refByKey(key: string | null): ComponentRef | null {
  const instance = key === null ? undefined : instances().find((each) => each.key === key);

  return instance ? refOf(instance) : null;
}

function viewRef(id: number): ViewRef {
  const view = viewOf(id);

  return { view: id, kind: view.kind, label: view.label };
}

// --- Values ------------------------------------------------------------------

/** `value` as plain data the panel can show. */
export function show(value: unknown, depth = 0): Shown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (isFunction(value)) return 'ƒ ' + (value.name || '') + '()';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return typeof value;

  const motion = motionHandles.get(value);

  if (motion) return show(motion.value, depth);
  if (isSignal(value)) return { signal: show(value.value, depth + 1) };
  if (depth >= DEPTH) return '…';
  if (Array.isArray(value)) return value.slice(0, ITEMS).map((item) => show(item, depth + 1));

  const shown: Record<string, Shown> = {};

  Object.keys(value).forEach((key) => {
    try {
      shown[key] = show((value as Record<string, unknown>)[key], depth + 1);
    } catch (error) {
      shown[key] = 'Threw: ' + String(error);
    }
  });

  return shown;
}

/** Longest value a cause shows. */
const CAUSE_VALUE = 40;

/** A write as the highlighter labels it: `visits = 2`. Named without a scan, as it runs per update. */
export function describeCause({ signal, value }: Cause): string {
  const shown = JSON.stringify(show(value));
  const name = signalNames.get(signal) ?? 'signal ' + signalId(signal);

  return (
    name + ' = ' + (shown.length > CAUSE_VALUE ? shown.slice(0, CAUSE_VALUE - 1) + '…' : shown)
  );
}

// --- Signals -----------------------------------------------------------------

/** The hook holding each component signal, by the signal. */
interface Held {
  module: string;
  slot: HookSlot;
}

function holders(): Map<AnySignal, Held> {
  const held = new Map<AnySignal, Held>();

  Object.keys(modules).forEach((module) => {
    const hooks = modules[module].hooks;

    Object.keys(hooks).forEach((key) => {
      const slot = hooks[key];

      slot.states.forEach((state) => {
        const id = module + ':' + state;

        if (own(stateStore, id)) held.set(stateStore[id], { module, slot });
      });
    });
  });

  return held;
}

/** Every signal the panel can reach: components' state, and whatever a binding or branch reads. */
function reachable(): Set<AnySignal> {
  const all = new Set<AnySignal>();

  Object.keys(stateStore).forEach((key) => all.add(stateStore[key]));

  Object.keys(modules).forEach((module) => {
    const record = modules[module];

    const add = (signal: AnySignal) => all.add(signal);

    Object.keys(record.followers).forEach((key) =>
      signalsOf(record.followers[key].held).forEach(add),
    );

    signalsOf(record.structural).forEach(add);
    record.scopes.forEach((scope) => signalsOf(scope.conditions).forEach(add));
  });

  return all;
}

export function signalId(signal: AnySignal): number {
  const known = devtools.signalIds.get(signal);

  if (known !== undefined) return known;

  const id = devtools.nextSignal++;

  devtools.signalIds.set(signal, id);

  return id;
}

export function findSignal(id: number): AnySignal | undefined {
  for (const signal of reachable()) if (devtools.signalIds.get(signal) === id) return signal;

  return undefined;
}

/** A computed has no setter; a writable signal does, even one of platform state that refuses. */
function writable(signal: AnySignal): boolean {
  for (let at: object | null = signal; at; at = Object.getPrototypeOf(at)) {
    const descriptor = Object.getOwnPropertyDescriptor(at, 'value');

    if (descriptor) return descriptor.set !== undefined;
  }

  return false;
}

/** A hook's name as the compiler gave it; an unnamed hook's slot is its ordinal, `#1`. */
function hookName(slot: HookSlot): string {
  return slot.name.replace(/^#/, slot.kind + ' ');
}

export function signalRef(signal: AnySignal, held = holders()): SignalRef {
  const holder = held.get(signal);
  const id = signalId(signal);

  return {
    signal: id,
    name:
      signalNames.get(signal) ??
      (holder ? hookName(holder.slot) : (writable(signal) ? 'signal ' : 'computed ') + id),
    kind: holder ? 'state' : writable(signal) ? 'signal' : 'computed',
    value: show(signal.value),
    owner: holder ? refByKey(holder.module + ':' + holder.slot.owner) : null,
  };
}

export function signalDetails(signal: AnySignal): SignalDetails {
  const drives: Drive[] = [];
  const decides: Branch[] = [];

  Object.keys(modules).forEach((module) => {
    const record = modules[module];

    Object.keys(record.followers).forEach((key) => {
      const follower = record.followers[key];

      if (followsSignal(follower.held, signal))
        drives.push({ ...viewRef(follower.view), prop: follower.binding.key });
    });

    if (followsSignal(record.structural, signal)) decides.push({ module, component: null });

    record.scopes.forEach((scope) => {
      if (followsSignal(scope.conditions, signal))
        decides.push({ module, component: refByKey(instanceKey(module, scope.component)) });
    });
  });

  return { ...signalRef(signal), drives, decides };
}

// --- Components --------------------------------------------------------------

/** Props as the component reads them: expressions evaluated, without `key` and `children`. */
function propsOf(node: ComponentNode): Record<string, Shown> {
  const props: Record<string, Shown> = {};

  Object.keys(node.props).forEach((name) => {
    if (name === 'key' || name === 'children') return;

    const value = node.props[name];

    try {
      props[name] = show(isFunction(value) && '__kuitoExprKey' in value ? value() : value);
    } catch (error) {
      props[name] = 'Threw: ' + String(error);
    }
  });

  return props;
}

function stateOf(module: string, key: string): AnySignal | undefined {
  const id = module + ':' + key;

  return own(stateStore, id) ? stateStore[id] : undefined;
}

/** What each kind of hook shows; lifecycle hooks and owned resources show nothing. */
const HOOKS: Record<string, (module: string, slot: HookSlot) => HookDetails | null> = {
  state(module, slot) {
    const signal = stateOf(module, slot.states[0]);

    return signal
      ? {
          kind: 'state',
          name: signalNames.get(signal) ?? hookName(slot),
          signal: signalId(signal),
          value: show(signal.value),
        }
      : null;
  },
  // task() and resource(): asyncStateKeys holds running, data and error first.
  async(module, slot) {
    const [running, data, error] = slot.states.map((key) => stateOf(module, key));

    return running && data && error
      ? {
          kind: 'task',
          name: hookName(slot),
          running: running.value === true,
          data: show(data.value),
          error: show(error.value),
        }
      : null;
  },
  motion(module, slot) {
    const record = motionHandles.get(Object(stateOf(module, slot.states[0])?.value));

    return record
      ? { kind: 'motion', name: hookName(slot), motion: record.id, value: show(record.value) }
      : null;
  },
  ref(module, slot) {
    const ref = stateOf(module, slot.states[0])?.value;

    return {
      kind: 'ref',
      name: hookName(slot),
      value: show(typeof ref === 'object' && ref !== null && 'current' in ref ? ref.current : null),
    };
  },
};

function hooksOf({ module, node }: Instance): HookDetails[] {
  const hooks = own(modules, module) ? modules[module].hooks : dict<HookSlot>();

  return Object.keys(hooks)
    .map((key) => hooks[key])
    .filter((slot) => slot.owner === node.path && own(HOOKS, slot.kind))
    .map((slot) => HOOKS[slot.kind](module, slot))
    .filter((hook): hook is HookDetails => hook !== null);
}

/** The native views an instance rendered that no other of its views contains. */
export function topViews({ module, node }: Instance): number[] {
  const inside = (component: string | null) =>
    component !== null &&
    (component === node.path || component.indexOf(node.path + '.render') === 0);
  const ids = new Set(
    (own(modules, module) ? modules[module].viewIds : []).filter((id) =>
      inside(views.get(id)?.component ?? null),
    ),
  );

  // A layout-only view has no native view to outline; its children stand in.
  const drawn = (id: number): number[] => {
    const view = viewOf(id);

    return view.flattened ? view.children.filter((child) => ids.has(child)).flatMap(drawn) : [id];
  };

  return [...ids]
    .filter((id) => {
      const parent = viewOf(id).parent;

      return parent === null || !ids.has(parent);
    })
    .flatMap(drawn);
}

export function componentDetails(instance: Instance): ComponentDetails {
  const keys = byKey(instances());
  const owners: ComponentRef[] = [];

  for (
    let parent = instance.parent;
    parent !== null && own(keys, parent);
    parent = keys[parent].parent
  )
    owners.push(refOf(keys[parent]));

  return {
    ...refOf(instance),
    props: propsOf(instance.node),
    hooks: hooksOf(instance),
    owners,
    views: topViews(instance).map(viewRef),
  };
}

// --- Views -------------------------------------------------------------------

export function viewDetails(id: number): ViewDetails | null {
  const view = views.get(id);

  if (!view) return null;

  const followers = own(modules, view.owner) ? modules[view.owner].followers : null;
  const held = holders();
  const names = Object.keys(view.props);

  Object.keys(view.bindings).forEach((name) => {
    if (names.indexOf(name) === -1) names.push(name);
  });

  const props: PropDetails[] = names.map((name) => {
    const key = id + '.' + name;
    // The follower holds the binding as its last run left it.
    const binding =
      followers && own(followers, key)
        ? followers[key].binding
        : own(view.bindings, name)
          ? view.bindings[name]
          : null;

    const cause = devtools.causes.get(id)?.[name];

    return {
      name,
      value: show(view.props[name]),
      cause: cause ? describeCause(cause) : null,
      binding: binding
        ? { signals: binding.dependencies.map((signal) => signalRef(signal, held)) }
        : null,
    };
  });

  return {
    ...viewRef(id),
    parent: view.parent === null ? null : viewRef(view.parent),
    children: view.children.map(viewRef),
    component: refByKey(ownerOf(id)),
    props,
  };
}
