// `class` on a native view: its names and variants, and the props they set.
import { refreshError } from './errors';
import { type AnySignal, untracked } from './signals';
import { nativeStyles } from './state/styles';
import { classValues, isFixed, resolveStyle, withVariants } from './style-conditions';
import { dict, isPlainData, own } from './values';

/**
 * `class`'s names, in order, and the data attributes that pick their
 * variants: a string of names, an object of attributes (`{ size: 'large' }`,
 * a falsy value naming none), or a list of them with falsy entries skipped.
 */
function classList(
  names: unknown,
  into: { names: string[]; attributes: Record<string, string> } = {
    names: [],
    attributes: dict<string>(),
  },
) {
  if (names == null || names === false || names === '') return into;

  if (typeof names === 'string') into.names.push(...names.split(/\s+/).filter(Boolean));
  else if (Array.isArray(names)) names.forEach((entry) => classList(entry, into));
  else if (isPlainData(names))
    Object.keys(names).forEach((attribute) => {
      const value = names[attribute];

      if (typeof value === 'string' && value) into.attributes[attribute] = value;
      else if (value == null || value === false || value === '') delete into.attributes[attribute];
      else throw invalidClass();
    });
  else throw invalidClass();

  return into;
}

const invalidClass = () =>
  refreshError(
    'INVALID_STYLE',
    'class takes class names and data attributes: a string, an object of variants, or a list of them (falsy entries are skipped).',
    "Use names from a .css import or styles(): class={[css.card, active.value && css.active, { size: 'large' }]}.",
  );

/** A class's prop that follows system state: its value now, and the signals that decided it. */
export interface ClassBinding {
  value: unknown;
  dependencies: AnySignal[];
}

/** Sets the props `names`' classes fix; returns those that follow system state. */
export function applyClasses(
  names: unknown,
  fields: Record<string, unknown>,
): Record<string, ClassBinding> {
  const { names: list, attributes } = classList(names);
  const following = dict<ClassBinding>();

  list.forEach((name) => {
    if (!own(nativeStyles, name))
      throw refreshError(
        'UNKNOWN_STYLE',
        'Unknown native class "' + name + '".',
        'Import the corresponding .css file into your TSX module.',
      );
  });

  const values = classValues(withVariants(list, attributes));

  Object.keys(values).forEach((key) => {
    const value = values[key];

    if (isFixed(value)) {
      fields[key] = value;

      return;
    }

    // Children inherit the font size the plan resolves; the compiler keeps it fixed.
    if (key === 'fontSize') throw new TypeError('A class font-size cannot follow system state');

    const reads = new Set<AnySignal>();
    const resolved = untracked(() => resolveStyle(value, reads));

    fields[key] = resolved === undefined ? null : resolved;
    following[key] = { value, dependencies: Array.from(reads) };
  });

  return following;
}
