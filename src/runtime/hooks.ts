// Component instances' hooks (docs/reactivity.md): each holds a slot keyed
// `<path>:<kind>:<name>`, kept across patches while its instance and its name
// last, and released with its state when either goes.
import type { ComponentNode, HookSlot, Instances } from './state/components';
import { stateStore } from './state/modules';
import { signalNames } from './state/signals';
import { SETTLED } from './async-task';
import { isWritable } from './signals';
import { freeMotionSource } from './motion-sources';
import { freeMotion } from './motion-values';
import { dict, own } from './values';

/** A hook that left: its state goes, and a motion value on both threads. */
function releaseSlot(moduleId: string, slot: HookSlot): void {
  slot.states.forEach((key) => {
    const id = moduleId + ':' + key;

    if (!own(stateStore, id)) return;

    const signal = stateStore[id];

    if (slot.kind === 'motion') freeMotion(signal.value);

    if (slot.kind === 'motionSource') freeMotionSource(signal.value);

    // A resource that leaves keeps no Loading waiting for it.
    if (slot.kind === 'async' && key.endsWith(SETTLED) && isWritable(signal)) {
      const settled: { value: unknown } = signal;

      settled.value = true;
    }

    signalNames.delete(signal);
    delete stateStore[id];
  });
}

/**
 * The module's hooks after a plan: an instance that ran keeps the hooks it
 * claimed again and gains its new ones; one that kept its cached tree keeps
 * all of its hooks. The others are released: their instance left, or the
 * hook is gone.
 */
export function reconcileHooks(
  moduleId: string,
  previous: Record<string, HookSlot>,
  instances: Instances,
  activePaths: Record<string, true>,
): Record<string, HookSlot> {
  const { ran, hooks } = instances;
  const kept = dict<HookSlot>();

  Object.keys(previous).forEach((key) => {
    const slot = previous[key];

    if (own(activePaths, slot.owner) && (own(hooks, key) || !own(ran, slot.owner)))
      kept[key] = slot;
    else releaseSlot(moduleId, slot);
  });

  return Object.assign(kept, hooks);
}

/** The hooks a Live Patch added to or removed from instances it kept, by component. */
export function hookChanges(
  previous: Record<string, HookSlot>,
  next: Record<string, HookSlot>,
  instances: Instances,
  components: ComponentNode[],
  before: Record<string, true>,
): string[] {
  const changes = dict<string[]>();
  const describe = (verb: string, slot: HookSlot) => {
    const { owner } = slot;

    if (!own(before, owner) || !own(instances.ran, owner)) return;

    (own(changes, owner) ? changes[owner] : (changes[owner] = [])).push(
      verb + ' ' + slot.kind + ' ' + slot.name,
    );
  };

  Object.keys(next).forEach((key) => {
    if (!own(previous, key)) describe('added', next[key]);
  });

  Object.keys(previous).forEach((key) => {
    if (!own(next, key)) describe('removed', previous[key]);
  });

  return components
    .filter((node) => own(changes, node.path))
    .map((node) => node.name + ' ' + changes[node.path].join(', '));
}

/** Release every hook of a module: it is disposed, or its cell shows another row. */
export function releaseHooks(moduleId: string, hooks: Record<string, HookSlot>): void {
  Object.keys(hooks).forEach((key) => releaseSlot(moduleId, hooks[key]));
}
