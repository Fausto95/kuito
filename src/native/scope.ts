// What the modules build on: signals over system state, which observe the
// platform only while watched, and resources a component's scope owns
// (docs/native-modules.md).
import type { Motion } from '../ui/motion';
import type { ReadonlySignal, Signal } from '../ui/reactivity';
import type { ElementRef, ElementHandle } from '../ui/refs';
import type { EventSubscription } from './modules';
import type * as appModule from './app';

function kernel() {
  if (!globalThis.__kuito) throw new Error('Kuito native modules require the Kuito runtime');

  return globalThis.__kuito;
}

export type { ReadonlySignal } from '../ui/reactivity';

/**
 * A signal over platform state. Nothing runs until it is first read, and the
 * platform is observed only while something subscribes; a read without
 * subscribers asks the platform.
 */
/* @__NO_SIDE_EFFECTS__ */
export function source<T>(
  read: () => T,
  observe: (set: (value: T) => void) => () => void,
): ReadonlySignal<T> {
  let signal: ReadonlySignal<T> | null = null;

  return {
    get value() {
      signal ??= kernel().createSource(read, observe);

      return signal.value;
    },
  };
}

/** How a source stops observing: the native subscription it started, removed. */
export const removing =
  (subscription: EventSubscription): (() => void) =>
  () =>
    subscription.remove();

/** Reports a failure nobody awaits, such as a rejected write. */
export function report(message: string): (error: unknown) => void {
  return (error) => kernel().reportError(message, error);
}

/** Reports data a module could not use, as a LogBox warning: it carries on without it. */
export function warn(message: string): void {
  kernel().reportWarning(message);
}

/**
 * Who owns a resource: the component setting up, by default, which releases
 * it when it unmounts; `{ scope: app }` for one the app holds for its life.
 */
export interface ScopeOptions {
  scope?: typeof appModule;
}

/**
 * A resource owned by the component setting up: `create` makes it once,
 * `start` runs when the component mounts, and what `start` returns releases
 * it when the component unmounts. In the app's scope it starts now and is
 * never released by Kuito. Elsewhere a call throws.
 */
export function owned<T>(
  label: string,
  options: ScopeOptions,
  create: () => T,
  start: (value: T) => () => void,
): T {
  if (options.scope === undefined) return kernel().own(label, create, start);

  const value = create();

  start(value);

  return value;
}

/** A signal of the resource's own, not tied to any component. */
export function signal<T>(initial: T): Signal<T> {
  return kernel().createSignal(initial);
}

/** A motion value of the resource's own; free it when the resource is released. */
export function motionValue<T>(initial: T): Motion<T> {
  return kernel().createMotion(initial);
}

export function freeMotion(value: Motion<unknown>): void {
  kernel().freeMotion(value);
}

/**
 * An event subscription owned like a resource: made by a component setting
 * up, it starts when the component mounts and ends when it unmounts.
 * Elsewhere it starts now. Either way `remove()` ends it sooner.
 */
export function watching(label: string, subscribe: () => EventSubscription): EventSubscription {
  const make = () => {
    let current: EventSubscription | null = null;
    let removed = false;

    const start = () => {
      if (!removed) current = subscribe();
    };
    const remove = () => {
      removed = true;
      current?.remove();
      current = null;
    };

    return { start, remove };
  };
  const subscription = kernel().setup()
    ? kernel().own(label, make, ({ start, remove }) => {
        start();

        return remove;
      })
    : make();

  if (!kernel().setup()) subscription.start();

  return { remove: subscription.remove };
}

/** A native view event's payload field, for a state object to narrow. */
export const field = (event: object, key: string): unknown => Reflect.get(event, key);

/** What a state ref is made of: the view's state, the events that keep it, and its release. */
export interface ViewState<S> {
  state: S;
  listeners: Record<string, (event: object) => void>;
  release: () => void;
}

/**
 * A ref whose object also holds the view's state: pass it as the view's
 * `ref`, and the listeners follow the view's events while it is mounted. The
 * component setting up owns it, like `ref()`: `create` runs once for it, and
 * its release when the component goes.
 */
export function stateRef<T extends ElementHandle, S extends object>(
  label: string,
  create: () => ViewState<S>,
): ElementRef<T> & S {
  const make = () => {
    const { state, listeners, release } = create();
    let current: T | null = null;
    const listen = (handle: T, on: boolean) =>
      Object.keys(listeners).forEach((type) =>
        on
          ? handle.addEventListener(type, listeners[type])
          : handle.removeEventListener(type, listeners[type]),
      );
    const ref = Object.defineProperty(state, 'current', {
      get: () => current,
      set(next: T | null) {
        if (current) listen(current, false);

        current = next;

        if (current) listen(current, true);
      },
      enumerable: true,
    });

    // defineProperty adds `current` at run time, which its type cannot say.
    const typed: ElementRef<T> & S = ref as never;

    return { ref: typed, release };
  };

  return kernel().own(label, make, ({ release }) => release).ref;
}
