// Views a native module contributes: a Swift UIView and a Kotlin View an app
// renders in JSX like any primitive, declared by its spec's `view` member
// (src/native/define-module.ts). See docs/native-modules.md#views.
import type { KuitoEvent } from '../ui/events';
import type { Bound, CommonProps } from '../ui/primitives';
import type { KuitoNode } from '../ui/jsx';
import type { ElementRef, ElementHandle } from '../ui/refs';
import type { Json, ModuleData } from './modules';

type EventKey = `on${Capitalize<string>}`;

/**
 * A view's own props: JSON values, and `on*` handlers for the events it
 * declares (`onSlidingComplete` for `slidingComplete`). A handler receives
 * the event with the payload's fields on it. A view whose spec declares
 * `children: true` lists `children` too.
 */
export type NativeViewSpec<P> = {
  [K in keyof P]: K extends 'children'
    ? KuitoNode
    : K extends EventKey
      ? ((event: never) => void) | undefined
      : Json | undefined;
};

/**
 * Methods the view's element answers, the spec's `methods`: arguments and a
 * Promise of a result that are JSON values or ArrayBuffers. They run on the
 * main thread with the view.
 */
export type NativeViewMethods<M> = {
  [K in keyof M]: M[K] extends (...args: infer A) => Promise<infer R>
    ? [A] extends [(ModuleData | undefined)[]]
      ? [R] extends [ModuleData | void]
        ? M[K]
        : never
      : never
    : never;
};

/** A module view's element, as its `ref` holds it: the element and the view's functions. */
export type NativeViewHandle<M = Record<never, never>> = ElementHandle & M;

/** An event a native view emits, with its payload's fields. */
export type NativeViewEvent<
  Type extends string,
  Payload = Record<never, never>,
> = KuitoEvent<Type> & Payload;

/**
 * The component's props: the view's own, each a value or a signal, beside
 * the style, layout and accessibility props every view takes. A prop bound
 * to a signal is two-way: an event whose payload has a field of the prop's
 * name writes the signal. Press handlers belong to the view's own events.
 */
export type NativeViewProps<P, M = Record<never, never>> = Omit<
  CommonProps,
  keyof P | 'onPress' | 'onPressCapture' | 'ref'
> & {
  ref?: ElementRef<NativeViewHandle<M>>;
} & {
  [K in keyof P]: K extends EventKey | 'children' ? P[K] : Bound<P[K]>;
};
