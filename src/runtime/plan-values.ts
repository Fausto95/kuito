// Pure helpers the planner uses to resolve values. No kernel state.
import { refreshError } from './errors';
import { isSignalLike } from './signals';
import { own } from './values';

export function childText(value: unknown): string {
  if (value == null || value === false || value === true) return '';

  if (Array.isArray(value)) return value.map(childText).join('');

  if (typeof value === 'function') return childText(value());

  if (isSignalLike(value)) return childText(value.value);

  if (typeof value === 'string' || typeof value === 'number') return String(value);

  throw new TypeError('Text children must resolve to strings or numbers');
}

interface EmLength {
  __kuitoLength: 'em';
  factor: number;
}

function isEmLength(value: unknown): value is EmLength {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__kuitoLength' in value &&
    value.__kuitoLength === 'em' &&
    'factor' in value &&
    typeof value.factor === 'number' &&
    Number.isFinite(value.factor)
  );
}

/** The compiler emits numeric em instructions; no CSS lexer/parser on-device. */
export function numericLength(value: unknown, fontSize: number): unknown {
  return isEmLength(value) ? value.factor * fontSize : value;
}

export function isUnresolvedLength(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, '__kuitoLength')
  );
}

/**
 * Refresh cache: a computed native property is preserved when its JSX
 * expression and surrounding static text are unchanged. New code still owns
 * future reactive callbacks. Changes to nonreactive closed-over values are not
 * tracked yet (see docs/reactivity.md). Null when the children cannot be keyed.
 */
export function childrenFingerprint(value: unknown): string | null {
  if (value === null || value === undefined) return 'null';

  if (Array.isArray(value)) {
    let joined = '[';

    for (const child of value) {
      const part = childrenFingerprint(child);

      if (part === null) return null;

      // Length-prefixed, so no part's text can pass for a boundary.
      joined += part.length + ':' + part;
    }

    return joined + ']';
  }

  if (typeof value === 'function') {
    const key: unknown = '__kuitoExprKey' in value ? value.__kuitoExprKey : undefined;

    return typeof key === 'string' && key ? 'expression:' + key : null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value + ':' + String(value);
  }

  return null;
}

/**
 * Resolve em lengths and return the element's font size. font-size: 1em uses
 * the parent's size; other em lengths use this element's resolved size.
 */
export function resolveLengths(
  label: string,
  fields: Record<string, unknown>,
  inherited: number,
): number {
  const hasFontSize = own(fields, 'fontSize');
  const fontSize = hasFontSize ? numericLength(fields.fontSize, inherited) : inherited;

  if (typeof fontSize !== 'number' || !Number.isFinite(fontSize) || fontSize < 0)
    throw refreshError(
      'INVALID_FONT_SIZE',
      'Invalid computed font size on ' + label + '.',
      'Use a finite font-size in px, rem or em.',
    );

  if (hasFontSize) fields.fontSize = fontSize;

  Object.keys(fields).forEach((key) => {
    if (key !== 'fontSize') fields[key] = numericLength(fields[key], fontSize);

    if (isUnresolvedLength(fields[key]))
      throw refreshError(
        'INVALID_STYLE_UNIT',
        'Unresolved style value ' + key + ' on ' + label + '.',
        'Use px, rem or em in your compiled .css file.',
      );
  });

  return fontSize;
}
