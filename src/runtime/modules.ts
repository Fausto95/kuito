// Views native modules contribute: a spec's `view` member, which its stub
// links as a kind of its own (src/runtime/link.ts, docs/native-modules.md).
import { linked } from './state/linked';
import { linkedViewEvents, MODULE_KIND } from './link';
import { dict, own } from './values';

/** Whether a kind is a view a native module contributes. */
export function isModuleKind(kind: string): boolean {
  return kind.slice(0, MODULE_KIND.length) === MODULE_KIND;
}

/** The module a module kind comes from. */
export function moduleViewName(kind: string): string {
  return kind.slice(MODULE_KIND.length);
}

function unlinked(kind: string): Error {
  return new TypeError(
    'Native module ' +
      moduleViewName(kind) +
      ' has no linked view. Render the `view` its spec declares, imported from the spec.',
  );
}

/** The events a module kind's view emits; registers its kind on first use. */
export function moduleViewEvents(kind: string): string[] {
  const events = linkedViewEvents(kind);

  if (!events) throw unlinked(kind);

  return events;
}

/** Whether a module kind's view lays out children inside it. */
export function moduleViewTakesChildren(kind: string): boolean {
  if (!own(linked.views, kind)) throw unlinked(kind);

  return linked.views[kind].children;
}

/**
 * The view's methods, as methods of its element `label`. Each runs on the
 * main thread with the view, which crosses as its number `id` ahead of the
 * arguments, and returns a Promise; a view that is no longer mounted rejects
 * at once.
 */
export function moduleViewMethods(
  kind: string,
  id: number,
  label: string,
  mounted: () => boolean,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  if (!own(linked.views, kind)) throw unlinked(kind);

  const name = moduleViewName(kind);
  const view = linked.views[kind];
  const methods = dict<(...args: unknown[]) => Promise<unknown>>();

  Object.keys(view.methods).forEach((key) => {
    methods[key] = (...args: unknown[]) =>
      mounted()
        ? (view.methods[key](id, ...args) as Promise<unknown>)
        : Promise.reject(
            new Error(
              name +
                '.' +
                key +
                ': the view ' +
                label +
                ' is not mounted. Call it from a ref while the view renders.',
            ),
          );
  });

  return methods;
}
