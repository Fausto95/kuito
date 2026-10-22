// The size a view has when nothing gives it one: a bundled image's own size in
// points (docs/assets.md), a Symbol's point size. A width or height from a prop
// or a class wins, and the aspect ratio keeps one given side in proportion, as
// React Native sizes a required image.
import type { Binding } from './plan';
import { own } from './values';

interface Size {
  width: number;
  height: number;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** `{ asset, width, height }`, the source the compiler makes of an imported image. */
function bundledImage(source: unknown): Size | null {
  if (typeof source !== 'object' || source === null) return null;

  const [asset, width, height] = ['asset', 'width', 'height'].map((key) =>
    Reflect.get(source, key),
  );

  return typeof asset === 'string' && isNumber(width) && isNumber(height)
    ? { width, height }
    : null;
}

const DEFAULT_SYMBOL_SIZE = 24;

function symbol(size: unknown): Size {
  const side = isNumber(size) ? size : DEFAULT_SYMBOL_SIZE;

  return { width: side, height: side };
}

/** Per kind: the prop the size follows, and the size it gives. */
const INTRINSIC: Readonly<Record<string, { prop: string; size: (value: unknown) => Size | null }>> =
  {
    Image: { prop: 'src', size: bundledImage },
    Symbol: { prop: 'size', size: symbol },
  };

const SIDES: Readonly<Record<string, (size: Size) => number>> = {
  width: (size) => size.width,
  height: (size) => size.height,
  aspectRatio: (size) => size.width / size.height,
};

const pick = (size: Size | null, key: string) => (size === null ? undefined : SIDES[key](size));

/**
 * Fills in the layout props the view's own size gives and nothing else set.
 * When the prop it follows is reactive, so are they.
 */
export function applyIntrinsicSize(
  kind: string,
  fields: Record<string, unknown>,
  bindings: Binding[],
): void {
  if (!own(INTRINSIC, kind)) return;

  const { prop, size } = INTRINSIC[kind];
  const sized = own(fields, 'width') || own(fields, 'height');
  const keys = (sized ? [] : ['width', 'height']).concat(
    own(fields, 'aspectRatio') ? [] : ['aspectRatio'],
  );
  const reactive = bindings.find((binding) => binding.key === prop);

  keys.forEach((key) => {
    const value = pick(size(fields[prop]), key);

    if (value !== undefined) fields[key] = value;

    if (reactive)
      bindings.push({
        key,
        evaluate: () => pick(size(reactive.evaluate()), key),
        dependencies: reactive.dependencies,
      });
  });
}
