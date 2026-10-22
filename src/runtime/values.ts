export type Dict<T> = Record<string, T>;

export function dict<T>(): Dict<T> {
  return Object.create(null) as Dict<T>;
}

// Read once: these run per field of every object prop compared, and a global
// lookup is not free on every host (node:vm resolves each through its sandbox).
const hasOwn = Object.hasOwn;
const prototypeOf = Object.getPrototypeOf;
const isArray = Array.isArray;
const same = Object.is;

export function own(object: object, key: string): boolean {
  return hasOwn(object, key);
}

export type PlainData = Record<string, unknown>;

/**
 * Native props are scalars or plain data objects (gradients, transitions,
 * layout animations), which cross the host boundary as plain data.
 */
export function isPlainData(value: unknown): value is PlainData {
  if (value === null || typeof value !== 'object' || isArray(value)) return false;

  // A root Object.prototype from any realm (styles may be compiled elsewhere).
  const proto: unknown = prototypeOf(value);

  return proto === null || prototypeOf(proto) === null;
}

/**
 * Native prop data: scalars, arrays and plain objects all the way down, which
 * cross the host boundary as plain data. Functions and class instances cannot.
 */
export function isJsonData(value: unknown): boolean {
  if (isScalar(value)) return typeof value !== 'number' || Number.isFinite(value);

  if (Array.isArray(value)) return value.every(isJsonData);

  return isPlainData(value) && Object.keys(value).every((key) => isJsonData(value[key]));
}

/**
 * Whether two native values hold the same data: identity first (frozen
 * compiled values), then arrays and plain objects field by field.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (same(a, b)) return true;

  // Loops, not every/Object.keys: this runs per object prop per plan walk,
  // and must not allocate to answer "unchanged".
  if (isArray(a) && isArray(b)) {
    if (a.length !== b.length) return false;

    for (let index = 0; index < a.length; index++) if (!sameData(a[index], b[index])) return false;

    return true;
  }

  if (!isPlainData(a) || !isPlainData(b)) return false;

  let count = 0;

  for (const key in a) {
    if (!own(a, key)) continue;

    if (!own(b, key) || !sameData(a[key], b[key])) return false;

    count++;
  }

  for (const key in b) if (own(b, key)) count--;

  return count === 0;
}

export function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/** Text for any thrown or reported value, including errors from another realm. */
export function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;

  if (typeof value === 'object' && value !== null) {
    if ('stack' in value && typeof value.stack === 'string' && value.stack) return value.stack;

    if ('message' in value && typeof value.message === 'string') return value.message;

    return JSON.stringify(value) ?? 'object';
  }

  if (typeof value === 'function') return 'function';

  if (typeof value === 'symbol') return value.toString();

  return String(value);
}

export type AnyFunction = (...args: unknown[]) => unknown;

/** User code hands the kernel functions of unknown shape; it calls them with unknown values. */
export function isFunction(value: unknown): value is AnyFunction {
  return typeof value === 'function';
}

/**
 * What an event passes a handler that takes its value: one payload field's
 * value (a field's text), several as one object (a selection's start and
 * end), or, with no field, the event itself.
 */
export function passedValue(
  event: Readonly<Record<string, unknown>>,
  field: string | readonly string[] | null | undefined,
): unknown {
  if (typeof field === 'string') return event[field];
  if (!field) return event;

  const value: Record<string, unknown> = {};

  field.forEach((name) => {
    value[name] = event[name];
  });

  return value;
}
