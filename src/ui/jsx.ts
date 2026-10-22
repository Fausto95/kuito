/** Kuito's JSX contract: elements are plain `{ type, props }` descriptions. */
import type { ReadonlySignal } from './reactivity';

/** A renderable child: elements, text, conditionals, signals, reactive thunks and lists. */
export type KuitoNode =
  | KuitoElement
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlySignal<KuitoNode>
  | (() => KuitoNode)
  | readonly KuitoNode[];

/** Text content: Text/Button labels never contain elements. */
export type TextContent =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlySignal<TextContent>
  | readonly TextContent[];

/** A function component written by an app. */
export type Component<P> = (props: P) => KuitoNode;

/**
 * Marks a built-in element. At runtime it is the plain string the renderer
 * dispatches on; the call signature only exists so TSX checks its props.
 */
export interface PrimitiveBrand {
  readonly __kuitoPrimitive: string;
}

export type Primitive<P> = ((props: P) => KuitoElement) & PrimitiveBrand;

export interface KuitoElement {
  readonly type: string | Component<never>;
  readonly props: Record<string, unknown>;
}

/** Props every element accepts, components included. */
export interface ElementAttributes {
  key?: string | number;
}

export const primitive = <P>(name: string) => name as unknown as Primitive<P>;

declare global {
  // The classic JSX pragma, installed by the Kuito runtime.
  var __kuitoJSX: (
    type: KuitoElement['type'],
    props: Record<string, unknown> | null,
    ...children: KuitoNode[]
  ) => KuitoElement;
  var __kuitoFragment: string;

  namespace JSX {
    type Element = KuitoElement;
    type ElementType = Component<never>;
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicAttributes extends ElementAttributes {}
    interface IntrinsicElements {}
  }
}
