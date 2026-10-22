// Loading (docs/control-flow.md#loading): what a plan does to the views and
// resources under one. Its state, whether it has shown its children, is its
// scope record's boundary (boundaries.ts).
import { SETTLED } from './async-task';
import type { Binding } from './plan';
import type { PatchApi } from './registration';
import type { Signal } from './signals';
import type { HookSlot, Instances } from './state/components';
import { modules } from './state/modules';
import { own } from './values';

/** The segment a Loading walks its children at. */
export const CONTENT = '.content';

/** A view a Loading hides while it waits: how to give it back its own `hidden`. */
export interface VeiledView {
  parent: number | null;
  fields: Record<string, unknown>;
  bindings: Binding[];
  had: boolean;
  value: unknown;
  binding: Binding | null;
  /** The Loadings walked in this plan that hide it and may still show it. */
  holders: number;
}

/** Hide a view the plan made; its own `hidden`, a value or a binding, waits aside. */
export function veil(
  parent: number | null,
  fields: Record<string, unknown>,
  bindings: Binding[],
  holders: number,
): VeiledView {
  const index = bindings.findIndex((binding) => binding.key === 'hidden');
  const view: VeiledView = {
    parent,
    fields,
    bindings,
    had: own(fields, 'hidden'),
    value: fields.hidden,
    binding: index === -1 ? null : bindings[index],
    holders,
  };

  if (index !== -1) bindings.splice(index, 1);

  fields.hidden = true;

  return view;
}

/** A Loading that has nothing to wait for lets go; the last holder shows the view. */
export function release(view: VeiledView): void {
  if (--view.holders > 0) return;

  if (view.had) view.fields.hidden = view.value;
  else delete view.fields.hidden;

  if (view.binding) view.bindings.push(view.binding);
}

/**
 * The settled signals of the resources whose components sit under `prefix`
 * in this plan, but for `claimed` ones (a nested Loading's): those of
 * components that ran, from the hooks they claimed now, and of those that
 * kept their tree, from the hooks the module committed.
 */
export function resourcesUnder(
  moduleId: string,
  prefix: string,
  api: PatchApi,
  instances: Instances,
  activePaths: Record<string, true>,
  claimed: Set<string>,
): Signal<boolean>[] {
  const committed = own(modules, moduleId) ? modules[moduleId].hooks : {};
  const settled: Signal<boolean>[] = [];
  const take = (key: string, slot: HookSlot) => {
    if (slot.kind !== 'async' || !slot.owner.startsWith(prefix) || claimed.has(key)) return;

    const state = slot.states.find((name) => name.endsWith(SETTLED));

    if (state === undefined) return;

    claimed.add(key);
    settled.push(api.state(state, true));
  };

  Object.keys(instances.hooks).forEach((key) => take(key, instances.hooks[key]));

  Object.keys(committed).forEach((key) => {
    const { owner } = committed[key];

    if (own(activePaths, owner) && !own(instances.ran, owner)) take(key, committed[key]);
  });

  return settled;
}
