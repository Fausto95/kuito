// View numbers. The kernel keeps views by number; a view's label (the app's
// `id` prop, or `__kuito:<module>:<path>`) names it at the host boundary, in
// event keys, to devtools and to the app (`element.id`). Labels map into one
// number space, so a user id and a generated one never meet.
import { viewIds, views, type KernelView } from './state/views';
import { rememberEntry } from './transaction';

/** The number of `label`, given one the first time a plan names it. */
export function viewNumber(label: string): number {
  const known = viewIds.byLabel.get(label);

  if (known !== undefined) return known;

  const id = ++viewIds.next;

  viewIds.byLabel.set(label, id);
  viewIds.labels.set(id, label);

  return id;
}

/** The committed view `label` names, if there is one. */
export function findView(label: string): number | null {
  const id = viewIds.byLabel.get(label);

  return id !== undefined && views.has(id) ? id : null;
}

export function labelOf(id: number): string {
  const label = viewIds.labels.get(id);

  if (label === undefined) throw new Error('Unknown view number ' + id);

  return label;
}

export function viewOf(id: number): KernelView {
  const view = views.get(id);

  if (!view) throw new Error('No view ' + labelOf(id));

  return view;
}

/** `id` names `label` while its view lives; a commit that creates it says so again. */
export function bindViewId(id: number, label: string): void {
  if (viewIds.byLabel.get(label) === id && viewIds.labels.get(id) === label) return;

  rememberEntry(viewIds.byLabel, label);
  rememberEntry(viewIds.labels, id);
  viewIds.byLabel.set(label, id);
  viewIds.labels.set(id, label);
}

/** A removed view's number goes; its label gets a new one if it comes back. */
export function forgetViewId(id: number): void {
  const label = labelOf(id);

  rememberEntry(viewIds.byLabel, label);
  rememberEntry(viewIds.labels, id);
  viewIds.byLabel.delete(label);
  viewIds.labels.delete(id);
}
