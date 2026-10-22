import { report } from './errors';
import { host } from './host';
import { encodeForJs, sendToJs } from './wire';
import { bindings, motions, pending, tracking, watched, type Binding } from './state';

/**
 * A flush runs one round per link of a chain of motion values following each
 * other, and one for the props that read the last: more rounds than this mean
 * they move each other in a cycle, or the chain is too long. The tests'
 * longest chain needs all of them.
 */
const MAX_ROUNDS = 8;

export function bind(view: number, prop: string, evaluate: () => unknown): void {
  add({ key: view + '.' + prop, view, prop, evaluate, reads: new Set(), write: null });
}

export function unbind(view: number, prop: string): void {
  remove(view + '.' + prop);
}

/** A motion value that follows `evaluate`: it moves whenever what that reads moves. */
export function bindMotion(id: string, evaluate: () => unknown, write: (value: unknown) => void) {
  add({ key: 'follow:' + id, view: 0, prop: id, evaluate, reads: new Set(), write });
}

export function unbindMotion(id: string): void {
  remove('follow:' + id);
}

function add(binding: Binding): void {
  remove(binding.key);
  bindings[binding.key] = binding;
  pending.dirty.add(binding);
}

function remove(key: string): void {
  const binding = bindings[key];

  if (!binding) return;

  release(binding);
  pending.dirty.delete(binding);
  delete bindings[key];
}

function release(binding: Binding): void {
  binding.reads.forEach((record) => record.dependents.delete(binding));
  binding.reads.clear();
}

function run(binding: Binding): void {
  const previous = tracking.reading;

  release(binding);
  tracking.reading = binding;

  try {
    const value = binding.evaluate();

    if (binding.write) binding.write(value);
    else queueProp(binding.view, binding.prop, value);
  } finally {
    tracking.reading = previous;
  }
}

/** A native prop to write when the flush ends, in the order first queued. */
export function queueProp(view: number, prop: string, value: unknown): void {
  const props = pending.props.get(view) ?? new Map<string, unknown>();

  props.set(prop, value);
  pending.props.set(view, props);
}

/** Runs dirty bindings until values settle, then writes props and mirrors values. */
export function flush(): void {
  for (let round = 0; pending.dirty.size; round++) {
    // Each stop unbinds what moves, or lets props that move nothing run.
    if (round === MAX_ROUNDS) {
      stopRunaways();
      round = 0;
    }

    const batch = Array.from(pending.dirty);

    pending.dirty.clear();

    batch.forEach((binding) => {
      if (bindings[binding.key] !== binding) return;

      try {
        run(binding);
      } catch (error) {
        report(binding.key, error);
        remove(binding.key);
      }
    });
  }

  pending.props.forEach((props, view) => {
    props.forEach((value, prop) => {
      host.__kuitoUISetProp(view, prop, nativeValue(value));
    });
  });

  pending.props.clear();

  pending.changed.forEach((record) => {
    if (motions[record.id] !== record || record.internal) return;

    try {
      const value = encodeForJs(record.value);

      if (typeof value === 'number') host.__kuitoUIMirrorNumber(record.id, value, record.js);
      else host.__kuitoUIMirror(record.id, value, record.js);

      if (watched.has(record.id) && pending.movedHere.has(record)) holdForJs(record.id, value);
    } catch (error) {
      report('motion value ' + record.id, error);
    }
  });

  pending.changed.clear();
  pending.movedHere.clear();
  pending.moves.clear();

  pending.afterFlush.splice(0).forEach((work) => {
    try {
      work();
    } catch (error) {
      report('exit', error);
    }
  });
}

/** A watched value moved here: the next frame tells the JS thread, with whatever else moved. */
function holdForJs(id: string, value: unknown): void {
  if (!pending.forJs.size) host.__kuitoUIRequestFrame();

  pending.forJs.set(id, value);
}

/**
 * Sends the watched values moved since the last frame, the latest of each, as
 * one message: one JS job a frame, however many values or events moved them.
 */
export function sendMoved(): void {
  if (!pending.forJs.size) return;

  sendToJs({ w: Array.from(pending.forJs) });
  pending.forJs.clear();
}

/**
 * Motion values that move each other in a cycle would forever: the bindings
 * in it stop, reported, and what only reads them stays bound. With no cycle,
 * a chain of followers longer than the rounds allow is cut where it reached.
 * Props still waiting move nothing and run next round.
 */
function stopRunaways(): void {
  const cycle = Array.from(pending.moves.keys()).filter(reachesItself);
  const stopped = cycle.length
    ? cycle
    : Array.from(pending.dirty).filter((binding) => binding.write || pending.moves.has(binding));

  if (!stopped.length) return;

  report(
    'UI thread',
    new Error(
      (cycle.length
        ? 'Motion values keep moving each other in a cycle: '
        : 'Motion values follow each other in a chain longer than ' + (MAX_ROUNDS - 1) + ': ') +
        stopped.map(describeBinding).join(', ') +
        ' stop.',
    ),
  );

  stopped.forEach((binding) => remove(binding.key));
}

const describeBinding = (binding: Binding) =>
  binding.write ? 'motion value ' + binding.prop : 'view ' + binding.view + "'s " + binding.prop;

/** The bindings that run again because `binding` moved what they read, this flush. */
const movedBy = (binding: Binding): Binding[] =>
  Array.from(pending.moves.get(binding) ?? []).flatMap((record) => Array.from(record.dependents));

function reachesItself(binding: Binding): boolean {
  const seen = new Set<Binding>();
  const next = movedBy(binding);

  for (let current = next.pop(); current; current = next.pop()) {
    if (current === binding) return true;

    if (seen.has(current)) continue;

    seen.add(current);
    next.push(...movedBy(current));
  }

  return false;
}

/** As the JS kernel sends props: scalars, null, or plain data. */
function nativeValue(value: unknown): unknown {
  return value === undefined ? null : value;
}
