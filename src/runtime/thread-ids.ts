// The ids JS-thread functions and signals cross as, and the plans that hold
// them: an id nobody holds is freed.
import type { AnySignal } from './signals';
import { threads, type HeldIds, type Rebind } from './state/threads';
import { journal } from './transaction';
import { own, type AnyFunction } from './values';

/** Where a gesture callback is encoded, and the plan's rebinds of the remotes it reuses. */
export interface RemoteSite {
  key: string;
  rebinds: Rebind[];
}

/**
 * A site keeps its remote across patches: the UI thread goes on calling the
 * same id, which the commit points at the site's new function.
 */
export function remoteId(fn: AnyFunction, receiver: unknown, site?: RemoteSite): number {
  const known = threads.remoteIds.get(fn);
  const reused = site && own(threads.remoteSites, site.key) ? threads.remoteSites[site.key] : 0;
  let id = known ?? reused;

  if (!known && reused && site) site.rebinds.push({ id, fn });
  else if (!id) {
    id = ++threads.next.remote;
    threads.remotes.set(id, { fn, receiver, site: site ? site.key : null });
    threads.remoteIds.set(fn, id);

    if (site) threads.remoteSites[site.key] = id;
  }

  threads.claiming?.remotes.add(id);

  return id;
}

/** Point reused remotes at their new functions; undone if the commit aborts. */
export function rebindRemotes(rebinds: Rebind[]): void {
  rebinds.forEach(({ id, fn }) => {
    const before = threads.remotes.get(id);

    if (!before) throw new Error('Rebinding a released remote ' + id);

    journal(() => {
      threads.remotes.set(id, before);
      threads.remoteIds.delete(fn);
      threads.remoteIds.set(before.fn, id);
    });

    threads.remoteIds.delete(before.fn);
    threads.remotes.set(id, { fn, receiver: undefined, site: before.site });
    threads.remoteIds.set(fn, id);
  });
}

export function signalId(signal: AnySignal): number {
  if (!('value' in signal)) throw new TypeError('A signal must have a value');

  let id = threads.signalIds.get(signal);

  if (!id) {
    id = ++threads.next.signal;
    threads.signals.set(id, signal as never);
    threads.signalIds.set(signal, id);
  }

  threads.claiming?.signals.add(id);

  return id;
}

/** Collect the remotes and signals `work` encodes, which a committed plan then holds. */
export function claiming<T>(work: () => T): { result: T; claimed: HeldIds } {
  const outer = threads.claiming;
  const frame = { remotes: new Set<number>(), signals: new Set<number>(), nested: [] };

  threads.claiming = frame;

  try {
    const result = work();

    return { result, claimed: framed(frame) };
  } catch (error) {
    release(framed(frame));

    throw error;
  } finally {
    threads.claiming = outer;
  }
}

/**
 * The ids a branch of the plan being built encodes, counted apart from its
 * plan's own: the plan holds them as well, once per branch.
 */
export function claimScope(work: () => void): HeldIds {
  const outer = threads.claiming;
  const frame = { remotes: new Set<number>(), signals: new Set<number>(), nested: [] };

  threads.claiming = frame;

  try {
    work();
  } finally {
    // Pushed even when `work` throws, so the plan frees what it encoded.
    threads.claiming = outer;
    outer?.nested.push(framed(frame));
  }

  return framed(frame);
}

function framed(frame: NonNullable<(typeof threads)['claiming']>): HeldIds {
  return {
    remotes: Array.from(frame.remotes).concat(frame.nested.flatMap((held) => held.remotes)),
    signals: Array.from(frame.signals).concat(frame.nested.flatMap((held) => held.signals)),
  };
}

export const NOTHING_HELD: HeldIds = Object.freeze({ remotes: [], signals: [] });

/** A module now holds `next` instead of `previous`: ids nobody holds any more are freed. */
export function hold(previous: HeldIds, next: HeldIds): void {
  const count = (prefix: string, ids: number[], step: number) =>
    ids.forEach((id) => {
      const key = prefix + id;

      threads.users.set(key, (threads.users.get(key) ?? 0) + step);
    });

  count('r', next.remotes, 1);
  count('s', next.signals, 1);
  count('r', previous.remotes, -1);
  count('s', previous.signals, -1);
  release(previous);
}

/** Free the ids among `ids` that no module holds: a plan that never committed made them. */
export function release(ids: HeldIds): void {
  const unheld = (key: string) => {
    if ((threads.users.get(key) ?? 0) > 0) return false;

    threads.users.delete(key);

    return true;
  };

  ids.remotes.forEach((id) => {
    const remote = threads.remotes.get(id);

    if (!remote || !unheld('r' + id)) return;

    threads.remotes.delete(id);

    if (threads.remoteIds.get(remote.fn) === id) threads.remoteIds.delete(remote.fn);

    if (remote.site && threads.remoteSites[remote.site] === id)
      delete threads.remoteSites[remote.site];
  });

  ids.signals.forEach((id) => {
    const signal = threads.signals.get(id);

    if (!signal || !unheld('s' + id)) return;

    threads.signals.delete(id);
    threads.signalIds.delete(signal);
  });
}
