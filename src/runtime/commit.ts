// Native host operations for a committed plan. Runs in one host batch
// (src/runtime/transaction.ts): every kernel write here is journaled, and what
// users observe waits for the batch to land.
import { makeHandle } from './elements';
import { isLayoutOnly, setFlattened } from './flatten';
import { forgetGestures } from './gestures';
import { createHostView, forgetView, moveHostView, removeHostView } from './host';
import { releaseCells } from './lists';
import { enterView, forgetAnimatedProps, movesProps, sendViewProp } from './prop-animation';
import type { Binding, PlannedView } from './plan';
import { LAST_PROPS } from './protocol.generated';
import { moves, type Children, type Reconciliation } from './reconcile';
import { elements, views } from './state/views';
import { rememberEntry, whenLanded } from './transaction';
import { dict, own } from './values';
import { bindViewId, forgetViewId, labelOf } from './view-ids';

/**
 * Remove views, children before their parents, then rebuild the child list
 * of each parent they leave once.
 */
export function removeViews(ids: readonly number[]): void {
  const leaving = new Map<number, Set<number>>();

  ids.forEach((id) => {
    const parent = removeView(id);

    if (parent === null) return;

    const gone = leaving.get(parent);

    if (gone) gone.add(id);
    else leaving.set(parent, new Set([id]));
  });

  leaving.forEach((gone, parent) => {
    const view = views.get(parent);

    if (view)
      setChildren(
        parent,
        view.children.filter((child) => !gone.has(child)),
      );
  });
}

/** Remove one view; its parent, if any, still lists it. */
function removeView(id: number): number | null {
  const label = labelOf(id);
  const view = views.get(id);

  releaseCells(label);
  removeHostView(id);
  forgetView(id);
  forgetAnimatedProps(id);
  forgetGestures(id);

  if (view?.ref) {
    const ref = view.ref;

    whenLanded(() => (ref.current = null));
  }

  const element = elements.get(id);

  if (element) {
    whenLanded(() => element.clear());
    rememberEntry(elements, id);
    elements.delete(id);
  }

  rememberEntry(views, id);
  views.delete(id);
  forgetViewId(id);

  return view?.parent ?? null;
}

export function commitPlan(
  moduleId: string,
  plan: PlannedView[],
  previousIds: number[] | null,
  { replaced, oldChildren, newChildren }: Reconciliation,
): void {
  const retained = new Set(plan.map((view) => view.id));

  // Remove deepest obsolete nodes first; child view ownership remains stable.
  removeViews((previousIds ?? []).filter((id) => !retained.has(id) || replaced.has(id)).reverse());

  plan.forEach((view) => commitView(moduleId, view));

  moveChildren(oldChildren, newChildren, replaced);

  indexChildren(moduleId, newChildren);
}

/** Create or update one view, sending only the props that changed. */
function commitView(moduleId: string, view: PlannedView): void {
  const old = views.get(view.id);
  const same = !!old && old.kind === view.kind && old.parent === view.parent;
  const fields = view.props;

  const flattened = isLayoutOnly(view);

  if (same && old.flattened && !flattened) setFlattened(view.id, false);
  else if (!same) createView(view, flattened);

  let element = elements.get(view.id);

  if (!element) {
    element = makeHandle(view.id, view.label, view.kind);
    rememberEntry(elements, view.id);
    elements.set(view.id, element);
  }

  if (same)
    Object.keys(old.props).forEach((name) => {
      if (!own(fields, name)) sendViewProp(view.id, name, null, old.props[name]);
    });

  // Object props are rebuilt on every walk; sendProp skips the equal ones.
  const changed = (name: string) =>
    !same || !own(old.props, name) || !Object.is(old.props[name], fields[name]);
  const send = (name: string) =>
    sendViewProp(view.id, name, fields[name], same ? old.props[name] : undefined);
  const names = Object.keys(fields);

  // How props move goes first: a created view's enter effect needs it, and
  // takes the props it animates in.
  names.filter(movesProps).filter(changed).forEach(send);

  const entering = same ? null : enterView(view.id, fields);

  const rest = names.filter((name) => !movesProps(name) && !entering?.has(name) && changed(name));

  // Some props index into others (a selection into the text): they go last.
  rest.filter((name) => !LAST_PROPS.includes(name)).forEach(send);
  rest.filter((name) => LAST_PROPS.includes(name)).forEach(send);

  // Props are cleared on the view before it goes, so a later promotion starts clean.
  if (same && !old.flattened && flattened) setFlattened(view.id, true);

  const bindings = dict<Binding>();

  view.bindings.forEach((binding) => {
    bindings[binding.key] = binding;
  });

  const { ref } = view;

  if (old?.ref && old.ref !== ref) {
    const stale = old.ref;

    whenLanded(() => (stale.current = null));
  }

  if (ref) {
    const handle = element;

    whenLanded(() => (ref.current = handle));
  }

  rememberEntry(views, view.id);

  views.set(view.id, {
    label: view.label,
    owner: moduleId,
    kind: view.kind,
    parent: view.parent,
    children: same ? old.children : [],
    props: fields,
    bindings,
    ref: view.ref,
    flattened,
    component: view.component,
    environment: view.environment,
  });
}

function createView(view: PlannedView, flattened: boolean): void {
  bindViewId(view.id, view.label);
  createHostView(view, flattened);
}

/**
 * Keep native object identity: simulate the removed and recreated children
 * (created ones land last), then move the fewest children into place.
 */
function moveChildren(oldChildren: Children, newChildren: Children, replaced: Set<number>): void {
  newChildren.forEach((wanted, parent) => {
    const kept = new Set(wanted);
    const current = (oldChildren.get(parent) ?? []).filter(
      (id) => kept.has(id) && !replaced.has(id),
    );
    const placed = new Set(current);

    wanted.forEach((id) => {
      if (!placed.has(id)) current.push(id);
    });

    moves(current, wanted).forEach(([id, index]) => moveHostView(id, parent, index));
  });
}

/**
 * Each parent lists its children in sibling order: the plan's for the views
 * of this module, then those other modules hang there (a list's cells).
 */
function indexChildren(moduleId: string, newChildren: Children): void {
  newChildren.forEach((wanted, parent) => {
    if (parent === null) return;

    const view = views.get(parent);

    if (!view) return;

    const foreign = view.children.filter((child) => views.get(child)?.owner !== moduleId);

    setChildren(parent, wanted.concat(foreign));
  });
}

function setChildren(parent: number, children: number[]): void {
  const view = views.get(parent);

  if (!view) return;

  rememberEntry(views, parent);
  views.set(parent, { ...view, children });
}
