// A commit's host writes land together or not at all: they go as one host
// batch (src/runtime/wire.ts), which the host checks whole. The kernel
// journals what the commit changes in its own state, so a throw, the work's
// or the host's rejection of the batch, restores both. What users can observe
// (refs, element listeners, disposed modules) waits until the batch has landed.
import { commit, wire } from './state/batch';
import { threads } from './state/threads';
import { own } from './values';
import { batchMark, sendBatch, truncateBatch } from './wire';

/** Run `work` as one batch; a throw aborts the host batch and undoes the kernel's side. */
export function atomically(work: () => void): void {
  if (commit.open) return work();

  // Views written before go first, so the commit's batch is its own; UI
  // operations queued while it was planned go with it, after its views.
  sendBatch(false);

  const queued = threads.queue.length;
  const mark = batchMark();

  let holding = true;

  commit.open = true;
  wire.holding++;

  try {
    work();
    wire.holding--;
    holding = false;
    sendBatch();
  } catch (error) {
    if (holding) wire.holding--;

    truncateBatch(mark);
    commit.undo.reverse().forEach((undo) => undo());
    threads.queue.length = queued;
    commit.landed = [];

    throw error;
  } finally {
    commit.open = false;
    commit.undo = [];
    commit.journaled.clear();
  }

  const landed = commit.landed;

  commit.landed = [];
  landed.forEach((effect) => effect());
}

/** Run `undo` if the open batch aborts. */
export function journal(undo: () => void): void {
  if (commit.open) commit.undo.push(undo);
}

/**
 * Whether the open batch has yet to journal `store`'s `key`. Undo runs in
 * reverse, so the first journal of a key is the one that restores it: later
 * ones would copy what the commit already changed, only to be overwritten.
 */
function firstWrite(store: object, key: unknown): boolean {
  const keys = commit.journaled.get(store);

  if (!keys) commit.journaled.set(store, new Set([key]));
  else if (keys.has(key)) return false;
  else keys.add(key);

  return true;
}

/** Restore `target[key]` (a copy of it, given `copy`) if the open batch aborts. */
export function remember<T>(target: Record<string, T>, key: string, copy?: (value: T) => T): void {
  if (!commit.open || !firstWrite(target, key)) return;

  if (!own(target, key)) {
    journal(() => {
      delete target[key];
    });

    return;
  }

  const value = copy ? copy(target[key]) : target[key];

  journal(() => {
    target[key] = value;
  });
}

/** Run `effect` once the open batch lands; now, outside one. */
export function whenLanded(effect: () => void): void {
  if (commit.open) commit.landed.push(effect);
  else effect();
}

/** Restore `map`'s entry for `key` (a copy of it, given `copy`) if the open batch aborts. */
export function rememberEntry<K, V>(map: Map<K, V>, key: K, copy?: (value: V) => V): void {
  if (!commit.open || !firstWrite(map, key)) return;

  const current = map.get(key);
  const value = current !== undefined && copy ? copy(current) : current;

  journal(() => {
    if (value === undefined) map.delete(key);
    else map.set(key, value);
  });
}
