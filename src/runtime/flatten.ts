// View flattening: which nodes need a native view. A container that only
// groups and positions its children is layout-only; the host keeps its layout
// node and hangs its children on the nearest real ancestor (docs/flattening.md).
import { isAnimatedValue, isUIBinding, setHostFlattened } from './host';
import { sendViewProp } from './prop-animation';
import type { PlannedView } from './plan';
import { FLATTENABLE_KINDS, LAYOUT_PROPS, REQUEST_PROPS } from './protocol.generated';
import { views } from './state/views';
import { rememberEntry } from './transaction';
import { own } from './values';

/**
 * Whether setting `name` to `value` needs a native view. An animation always
 * does, and so does a prop the UI thread drives from a motion value.
 */
function needsView(name: string, value: unknown): boolean {
  return !own(LAYOUT_PROPS, name) || isAnimatedValue(value) || isUIBinding(value);
}

/**
 * A planned node is layout-only when its kind is a plain container and
 * nothing about it needs a view: no prop outside the layout table, no event
 * handler, no ref.
 */
export function isLayoutOnly(view: PlannedView): boolean {
  return (
    FLATTENABLE_KINDS.indexOf(view.kind) !== -1 &&
    !view.listens &&
    !view.ref &&
    Object.keys(view.props).every((name) => !needsView(name, view.props[name]))
  );
}

/** Give a committed node its native view, or take it away. */
export function setFlattened(id: number, flattened: boolean): void {
  setHostFlattened(id, flattened);

  const view = views.get(id);

  if (!view) return;

  rememberEntry(views, id);
  views.set(id, { ...view, flattened });
}

/**
 * A prop set after the commit (a binding, an element handle). A flattened
 * node gets its view first when the prop needs one; it flattens again only
 * at a commit, so a prop that changes every frame never churns views.
 */
export function setViewProp(id: number, name: string, value: unknown): void {
  if (views.get(id)?.flattened && needsView(name, value)) setFlattened(id, false);

  const view = views.get(id);

  sendViewProp(id, name, value, view?.props[name]);

  if (view && !own(REQUEST_PROPS, name)) view.props[name] = value;
}
