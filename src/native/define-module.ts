// A native module's spec (docs/native-modules.md): one TypeScript file that
// declares the module's functions and what it needs from each platform. The
// compiler reads it without running it, gives every function an id, and
// replaces the file with one stub per function; nothing here runs in an app.

import type { Primitive } from '../ui/jsx';
import type { Motion } from '../ui/motion';
import type { ReadonlySignal } from '../ui/reactivity';
import type { NativeViewMethods, NativeViewProps, NativeViewSpec } from './views';
import type { EventSubscription } from './modules';

type SyncFunction = (...args: never[]) => unknown;
type AsyncFunction = (...args: never[]) => Promise<unknown>;

/** `F`, unless it returns a Promise: a synchronous function returns its value. */
type Synchronous<F extends SyncFunction> = ReturnType<F> extends PromiseLike<unknown> ? never : F;

export interface QueuedDeclaration {
  /** Runs on its thread and returns its result; JavaScript gets a Promise of it. */
  <F extends AsyncFunction>(): F;
  /** Starts on its thread and settles a `KuitoPromise` once, from any thread: a callback API. */
  callback<F extends AsyncFunction>(): F;
}

export interface FunctionDeclarations {
  /** Runs on the JS thread and returns its value. Keep it fast, thread-safe and off UIKit and Views. */
  sync<F extends SyncFunction>(): Synchronous<F>;
  /** Runs on the main (UI) thread. */
  main: QueuedDeclaration;
  /** Runs on the module's own serial background thread, in call order. */
  background: QueuedDeclaration;
}

export interface SwiftPackageNeed {
  url: string;
  /** The minimum version. */
  from: string;
  /** The products the app target links. */
  products: string[];
}

export type PlistNeed = string | number | boolean | PlistNeed[] | { [key: string]: PlistNeed };

export interface IosNeeds {
  /** The `final` Swift class conforming to the generated `<Name>Spec`, in `ios/`. */
  class: string;
  /** The class's `@MainActor static func launch()` runs as the app finishes launching (docs/native-modules.md#launch). */
  launch?: boolean;
  /** Info.plist keys, such as usage descriptions. */
  infoPlist?: Record<string, PlistNeed>;
  /** System frameworks the app target links, like `CoreHaptics`. */
  frameworks?: string[];
  swiftPackages?: SwiftPackageNeed[];
}

export interface AndroidNeeds {
  /** The fully qualified Kotlin class implementing the generated `<Name>Spec`, in `android/`. */
  class: string;
  /** The class's companion `fun launch(application: Application)` runs as the app's process starts. */
  launch?: boolean;
  /** Gradle coordinates, `group:artifact:version`. */
  dependencies?: string[];
  /** `uses-permission` entries. */
  permissions?: string[];
  /** `uses-feature` entries: `required` is true unless it says false. */
  features?: { name: string; required?: boolean }[];
  /** `<provider>`s: attributes without `android:`, and `resources` naming meta-data resources. */
  providers?: ({ name: string; authorities: string; resources?: Record<string, string> } & Record<
    string,
    unknown
  >)[];
  /** `<service>`s: attributes without `android:`. */
  services?: ({ name: string } & Record<string, string>)[];
  /** `<receiver>`s: attributes without `android:`, and the `actions` their intent filter takes. */
  receivers?: ({ name: string; actions?: string[] } & Record<string, string | string[]>)[];
}

/** What a module needs beside its functions; a platform it leaves out does not ship it. */
export interface NativeNeeds {
  ios?: IosNeeds;
  android?: AndroidNeeds;
}

type NeedKey = keyof NativeNeeds;

export type ModuleMembers = Record<string, unknown>;

/** The module's functions, as an app imports them. */
export type ModuleOf<S> = { readonly [K in Exclude<keyof S, NeedKey>]: S[K] };

function compiledAway(): never {
  throw new Error(
    'A native module spec runs only through the Kuito compiler, which replaces it with ' +
      "the module's functions (docs/native-modules.md).",
  );
}

const queued = (): QueuedDeclaration =>
  Object.assign(() => compiledAway(), { callback: compiledAway });

/** Declares a module function and the thread it runs on: `fn.sync<() => number>()`. */
export const fn: FunctionDeclarations = {
  sync: compiledAway,
  main: queued(),
  background: queued(),
};

/** An event a module's spec declares, as an app listens to it. */
export interface ModuleEvent<Payload> {
  /** The platform sends the event from the first listener until the last is removed. */
  addListener(listener: (payload: Payload) => void): EventSubscription;
}

/**
 * Declares an event the platform sends while JavaScript listens:
 * `levelChanged: event<{ level: number }>()`. Natively, `start<Name>` gets
 * the emitter on the main thread and `stop<Name>` ends it.
 */
export function event<Payload = void>(): ModuleEvent<Payload> {
  return compiledAway();
}

/**
 * Declares platform state an app reads as a signal: `level: live<number>()`.
 * Unwatched, each read asks the platform on the JS thread; watched,
 * `start<Name>` gets the signal on the main thread and sets each change.
 */
export function live<T>(): ReadonlySignal<T> {
  return compiledAway();
}

/**
 * Declares platform state the UI thread follows: `fix: motion<Fix>()`, null
 * until the platform sets it. Natively, `start<Name>` gets the motion value
 * on the main thread and sets each change, which the UI runtime applies at
 * once and JavaScript reads after; `stop<Name>` ends it. Only the platform
 * writes it. Apps import `motion` from `kuito`, where it is this as well.
 */
export function motion<T>(): Motion<T | null> {
  return compiledAway();
}

/** A view's events and methods, as its spec declares them. */
export interface ViewDeclaration {
  /** The events its element hears, by name: `change` reaches `onChange`. */
  events?: readonly string[];
  /** Functions its element answers, each `fn.main`; natively they get the mounted view first. */
  methods?: Record<string, unknown>;
  /**
   * Whether it lays out children inside it, as a container does: its props
   * type declares `children` too. A view that doesn't declare it is a leaf.
   */
  children?: boolean;
}

/**
 * Declares the view a module contributes, rendered in JSX:
 * `view: view<SliderProps>({ events: ['change'] })`. Natively, `view()`
 * returns how to make it and its props by name.
 */
export function view<
  P extends NativeViewSpec<P>,
  M extends NativeViewMethods<M> = Record<never, never>,
>(_declaration: ViewDeclaration = {}): Primitive<NativeViewProps<P, M>> {
  return compiledAway();
}

/**
 * A native module: `name` is what Swift and Kotlin implement as `<name>Spec`.
 * Export it as the spec file's default; the compiler reads it as written, so
 * every value is a literal or a declaration.
 */
export function defineModule<const S extends ModuleMembers & NativeNeeds>(
  _name: string,
  _spec: S,
): ModuleOf<S> {
  return compiledAway();
}
