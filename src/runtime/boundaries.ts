// Boundaries keep state on their scope record, so a re-plan of the module or
// of the branch finds it by path. Catch (docs/control-flow.md#catch) is a
// branch owner whose condition is what its children threw; Loading
// (loading.ts) remembers whether it has shown its children.
import { createSignal, untracked, type Signal } from './signals';
import { modules } from './state/modules';
import { own } from './values';

export interface Caught {
  error: unknown;
}

export interface CatchBoundary {
  kind: 'catch';
  /** What its children threw; null while they render. */
  caught: Signal<Caught | null>;
}

export interface LoadingBoundary {
  kind: 'loading';
  /** Its children showed once: it never hides them again. */
  revealed: boolean;
}

export type Boundary = CatchBoundary | LoadingBoundary;

/** The Loading's state: the one the module committed, or a new one. */
export function loadingBoundary(prior: Boundary | undefined): LoadingBoundary {
  return prior?.kind === 'loading' ? prior : { kind: 'loading', revealed: false };
}

/** The segment a Catch walks its children at; its fallback is walked at another. */
export const TRY = '.try';

/**
 * A render error a Catch took. The plan that threw commits nothing; it is
 * planned again with the Catch showing its fallback.
 */
export class CaughtRender extends Error {
  path: string;
  error: unknown;

  constructor(path: string, error: unknown) {
    super('A Catch took a render error');
    this.path = path;
    this.error = error;
  }
}

/** What the failed attempts at a plan threw, by the path of the Catch that took it. */
export type CarriedCatches = Map<string, Caught>;

/**
 * The Catch's state for a plan: what an attempt at this plan threw, else what
 * the module committed. A plan never writes a committed Catch's signal, so a
 * plan that fails leaves it as it was. `newCode` (a Live Patch) renders the
 * children again.
 */
export function catchBoundary(
  prior: Boundary | undefined,
  carried: Caught | undefined,
  newCode: boolean,
): CatchBoundary {
  if (carried) return { kind: 'catch', caught: createSignal<Caught | null>(carried) };

  if (prior?.kind === 'catch' && !(newCode && untracked(() => prior.caught.value) !== null))
    return prior;

  return { kind: 'catch', caught: createSignal<Caught | null>(null) };
}

/**
 * Hand an error from the component at `owner` (an effect's, a resource's) to
 * the nearest Catch whose children it is in. False when there is none, or
 * when it shows an error already: the caller reports this one.
 */
export function deliver(moduleId: string, owner: string, error: unknown): boolean {
  if (!own(modules, moduleId)) return false;

  let nearest: CatchBoundary | null = null;

  // Scopes are in walk order, outer owners first: the last Catch around `owner` is the nearest.
  for (const { path, boundary } of modules[moduleId].scopes)
    if (boundary?.kind === 'catch' && owner.startsWith(path + TRY + '.')) nearest = boundary;

  if (!nearest || untracked(() => nearest.caught.value) !== null) return false;

  nearest.caught.value = { error };

  return true;
}
