import { host } from './host';
import { isFunction } from './values';

declare global {
  var __kuitoFragment: string;
  var __kuitoJSX: (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => JsxElement;
  var __kuitoExpr: <F extends (...args: never[]) => unknown>(key: string, evaluate: F) => F;
}

export interface JsxElement {
  type: unknown;
  props: Record<string, unknown>;
}

export function installJsx(): void {
  host.__kuitoExpr = (key, evaluate) => {
    if (!isFunction(evaluate)) throw new TypeError('Kuito expression must be callable');

    Object.defineProperty(evaluate, '__kuitoExprKey', { value: key });

    return evaluate;
  };

  host.__kuitoFragment = 'Fragment';

  // Oxc's classic JSX transform passes children as extra positional arguments.
  // Copy rather than mutate a potentially frozen or shared props object.
  host.__kuitoJSX = (
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => {
    const copy: Record<string, unknown> = { ...props };

    if (children.length > 0) copy.children = children;

    return { type, props: copy } satisfies JsxElement;
  };
}
