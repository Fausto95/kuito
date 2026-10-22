// Watchers that keep committed bindings current. They last across
// re-plans: a plan's bindings are matched to the committed ones by view and
// prop, and each keeps the links of the signals it still reads.
import { setViewProp } from './flatten';
import { isUIBinding } from './host';
import type { PlannedView } from './plan';
import {
  dispose,
  endRun,
  followExactly,
  makeWatcher,
  signalsOf,
  type ReactiveNode,
} from './reactive-graph';
import { readInto } from './signals';
import type { Follower } from './state/modules';
import { motionSignals } from './state/motion';
import { views } from './state/views';
import { dict, own } from './values';

// A prop computed on the UI thread follows motion values there.
const notMotion = (dep: ReactiveNode) => dep.handle === null || !motionSignals.has(dep.handle);

/**
 * Each run tracks what it reads again, so a signal read only in a branch
 * taken later still updates the prop, as in Solid. A run that reads what
 * the last one read reuses its links and allocates none.
 */
function update(follower: Follower): void {
  const { binding, held } = follower;
  const value = readInto(held, binding.evaluate);
  const current = views.get(follower.view)?.props ?? null;

  // The native view already shows it: it reported this value itself.
  if (!current || !own(current, binding.key) || !Object.is(current[binding.key], value))
    setViewProp(follower.view, binding.key, value);

  // The binding keeps what this run read: a plan that keeps it starts there.
  if (endRun(held, isUIBinding(value) ? notMotion : undefined))
    binding.dependencies = signalsOf(held);
}

/**
 * The followers of a committed plan, by `<view>.<prop>`: one the previous
 * plan had follows its new binding with the links it keeps; the others are
 * released.
 */
export function followPlan(
  previous: Record<string, Follower>,
  plan: PlannedView[],
): Record<string, Follower> {
  const next = dict<Follower>();

  plan.forEach((view) => {
    view.bindings.forEach((binding) => {
      const key = view.id + '.' + binding.key;
      const follower = own(previous, key) ? previous[key] : makeFollower(view.id, binding);

      follower.binding = binding;
      followExactly(follower.held, binding.dependencies);
      next[key] = follower;
    });
  });

  Object.keys(previous).forEach((key) => {
    if (!own(next, key)) dispose(previous[key].held);
  });

  return next;
}

function makeFollower(view: number, binding: Follower['binding']): Follower {
  const follower: Follower = { view, binding, held: makeWatcher(() => update(follower)) };

  return follower;
}

export function releaseFollowers(followers: Record<string, Follower>): void {
  Object.keys(followers).forEach((key) => dispose(followers[key].held));
}
