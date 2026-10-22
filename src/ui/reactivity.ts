// Signals and what a component owns: the reactivity API (docs/reactivity.md).
//
// Every hook takes a trailing `name`, which the compiler passes: the variable
// the hook is assigned to, or its ordinal among the hooks of its kind. The
// kernel keeps each hook's slot by that name, and the Components panel shows
// each signal by it (docs/devtools.md).
import type { EventSubscription } from './keyboard';

/** A value that changes: JSX that reads `.value` follows it, and a write changes it. */
export interface Signal<T> {
  value: T;
}

/** A signal of a value nobody writes directly: a `computed`, or state the platform owns. */
export interface ReadonlySignal<T> {
  readonly value: T;
}

function kernel(api: string) {
  if (!globalThis.__kuito) throw new Error(api + ' requires the Kuito runtime');

  return globalThis.__kuito;
}

/**
 * A signal. Made while a component sets up, it belongs to that component's
 * slot: it keeps its value across Live Patches and goes when the component
 * unmounts. Made anywhere else, it is a signal of its own, which every
 * component that reads it shares.
 */
export function signal<T>(initial: T, name?: string): Signal<T> {
  const kuito = kernel('signal()');

  return kuito.setup() ? kuito.useState(initial, name) : kuito.createSignal(initial);
}

/**
 * A signal derived from the signals `fn` reads: computed on first read, and
 * again only once one of them changed.
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
  return kernel('computed()').computed(fn);
}

/**
 * Runs `fn` when a signal, or what `source` reads, changes; with `immediate`,
 * once at the start too. Called while a component sets up, it follows the
 * source until the component unmounts; anywhere else, from now on. Either way
 * `remove()` stops it sooner.
 */
export function watch<T>(
  source: ReadonlySignal<T> | (() => T),
  fn: (next: T, previous: T | undefined) => void | (() => void),
  options: { immediate?: boolean } = {},
  name?: string,
): EventSubscription {
  const kuito = kernel('watch()');
  const select = typeof source === 'function' ? source : () => source.value;

  if (!kuito.setup()) return { remove: kuito.watch(select, fn, options) };

  let removed = false;

  kuito.useLifecycle(
    'watch',
    select,
    (next: T, previous: T | undefined) => (removed ? undefined : fn(next, previous)),
    options,
    name,
  );

  return { remove: () => (removed = true) };
}

/**
 * A value a component provides to its descendants, read with `inherit()`
 * wherever they are below it. `fallback` is what they read when no
 * component above them provides one.
 */
export interface Inherited<T> {
  readonly fallback: T;
}

/**
 * A value descendants inherit, as a CSS property is inherited. Made once, as
 * a `const` at the top of a module: the compiler names it after its file and
 * variable, so it stays the same key across Live Patches.
 */
export function inherited<T>(fallback: T, name?: string): Inherited<T> {
  return kernel('inherited()').inherited(fallback, name);
}

/**
 * Called while a component sets up: its descendants inherit `value` for
 * `key`. A signal (a `computed` too) is what they read: a write reaches the
 * bindings that read it, and nothing re-renders.
 */
export function provide<T>(key: Inherited<T>, value: T | ReadonlySignal<T>): void {
  kernel('provide()').provide(key, value);
}

/**
 * Called while a component sets up: the value the nearest component above it
 * provides for `key`, or the key's fallback, as a signal its JSX follows.
 */
export function inherit<T>(key: Inherited<T>): ReadonlySignal<T> {
  return kernel('inherit()').inherit(key);
}

/** Auto-tracks signals read synchronously and retracks on subsequent updates. */
export function effect(fn: () => void | (() => void), name?: string): void {
  kernel('effect()').useLifecycle('effect', fn, undefined, undefined, name);
}

/** Runs after a successful native mount; cleaned up and re-run on accepted refresh. */
export function onMount(fn: () => void | (() => void), name?: string): void {
  kernel('onMount()').useLifecycle('mount', fn, undefined, undefined, name);
}

export function onCleanup(fn: () => void, name?: string): void {
  kernel('onCleanup()').useLifecycle('cleanup', fn, undefined, undefined, name);
}

export interface TaskContext {
  readonly signal: AbortSignal;
}

/** The function a task runs. */
export type TaskWork<A extends unknown[], T> = (context: TaskContext, ...args: A) => T | Promise<T>;

export interface TaskOptions {
  policy?: 'replace' | 'drop';
}

export interface Task<A extends unknown[], T> {
  readonly running: ReadonlySignal<boolean>;
  readonly data: ReadonlySignal<T | undefined>;
  readonly error: ReadonlySignal<unknown>;
  run(...args: A): Promise<T>;
  cancel(reason?: unknown): void;
}

export interface Resource<T> extends Task<[], T> {
  refresh(): Promise<T>;
}

export function task<A extends unknown[], T>(
  work: TaskWork<A, T>,
  options: TaskOptions = {},
  name?: string,
): Task<A, T> {
  return kernel('task()').useTask(work, options, name);
}

export function resource<T>(work: TaskWork<[], T>, name?: string): Resource<T> {
  return kernel('resource()').useResource(work, name);
}
