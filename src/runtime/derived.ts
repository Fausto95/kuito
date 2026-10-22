/*
 * Derived motion: a value computed from another motion value, on the UI
 * thread (docs/motion.md). `interpolate` and `clamp` are data; `map` takes a
 * function the compiler also compiled for the UI thread. A prop given one
 * binds to it, and a motion value can follow one. Imports only colors.ts:
 * app code, the kernel and the UI kernel evaluate the same data.
 *
 * interpolate's extrapolation follows Reanimated's interpolate
 * (https://github.com/software-mansion/react-native-reanimated,
 * src/interpolation.ts), MIT License, Copyright (c) 2016 Software Mansion.
 */
import { channels, isHexColor, join } from './colors';

type Scalar = number | string;

/** What a derived value reads: a motion value or another derived one. */
export interface Readable<T> {
  readonly value: T;
}

export type Extrapolate = 'clamp' | 'extend';

export type DerivedSpec =
  | { op: 'compute'; fn: () => unknown }
  | { from: unknown; op: 'map'; fn: (value: never) => unknown }
  | { from: unknown; op: 'clamp'; min: number; max: number }
  | {
      from: unknown;
      op: 'interpolate';
      input: readonly number[];
      output: readonly Scalar[];
      extrapolate: Extrapolate;
    };

/** A value computed from another as it moves. */
export interface Derived<T> extends Readable<T> {
  readonly __kuitoDerived: DerivedSpec;
  /** A value computed from this one, on the UI thread. */
  map<U>(fn: (value: T) => U): Derived<U>;
}

export function isDerived(value: unknown): value is Derived<unknown> {
  return typeof value === 'object' && value !== null && '__kuitoDerived' in value;
}

function readable(value: unknown, where: string): Readable<unknown> {
  if (typeof value !== 'object' || value === null || !('value' in value))
    throw new TypeError(where + ' takes a motion value or a derived one');

  return value;
}

/** A spec's value from what it reads: the one evaluation every thread runs. */
export function evaluate(spec: DerivedSpec, from: unknown): unknown {
  switch (spec.op) {
    case 'compute':
      return Reflect.apply(spec.fn, undefined, []);
    case 'map':
      return Reflect.apply(spec.fn, undefined, [from]);
    case 'clamp':
      return Math.min(spec.max, Math.max(spec.min, Number(from)));
    case 'interpolate':
      return interpolateValue(Number(from), spec.input, spec.output, spec.extrapolate);
  }
}

/**
 * The derived value. Its `value` reads the source each time, so a read on
 * either thread tracks the motion values underneath. Methods are not
 * enumerable: it stays plain data on the wire.
 */
export function makeDerived<T>(spec: DerivedSpec): Derived<T> {
  // A computed reads its sources itself.
  const source = spec.op === 'compute' ? undefined : readable(spec.from, spec.op);
  const made = { __kuitoDerived: spec };

  Object.defineProperty(made, 'value', {
    get: () => evaluate(spec, source?.value),
    enumerable: false,
  });

  Object.defineProperty(made, 'map', {
    value: (fn: unknown) => mapOf(made, fn),
    enumerable: false,
  });

  return made as never;
}

/** `source.map(fn)`, for motion values and derived ones alike. */
export function mapOf<U>(source: unknown, fn: unknown): Derived<U> {
  if (typeof fn !== 'function') throw new TypeError('map takes a function');

  return makeDerived({ from: source, op: 'map', fn: fn as (value: never) => unknown });
}

/**
 * A computed the compiler placed on the UI thread (docs/placement.md): `fn`
 * reads only motion values and other derived ones, and is evaluated on each
 * read, on whichever thread reads it.
 */
export function computeOf<T>(fn: unknown): Derived<T> {
  if (typeof fn !== 'function') throw new TypeError('computed() requires a function');

  return makeDerived({ op: 'compute', fn: fn as () => unknown });
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !isFinite(value))
    throw new TypeError(name + ' must be a number');

  return value;
}

/** `source`, kept between `min` and `max`. */
export function clamp(source: Readable<number>, min: number, max: number): Derived<number> {
  if (finite(min, 'clamp min') > finite(max, 'clamp max'))
    throw new TypeError('clamp min must not exceed max');

  return makeDerived({ from: source, op: 'clamp', min, max });
}

export interface InterpolateOptions {
  /** Past the last input: hold the end value (the default), or keep going. */
  extrapolate?: Extrapolate;
}

/**
 * `source` mapped from `input` to `output`, piece by piece: numbers, or hex
 * colors channel by channel.
 */
export function interpolate<T extends Scalar>(
  source: Readable<number>,
  input: readonly number[],
  output: readonly T[],
  options: InterpolateOptions = {},
): Derived<T> {
  if (input.length < 2 || input.length !== output.length)
    throw new TypeError('interpolate takes as many outputs as inputs, at least two');

  input.forEach((point, index) => {
    if (index && finite(point, 'an input') <= input[index - 1])
      throw new TypeError('interpolate inputs must increase');
  });

  const colors = output.every(isHexColor);

  if (!colors && !output.every((value) => typeof value === 'number' && isFinite(value)))
    throw new TypeError('interpolate outputs are numbers or hex colors, not a mix');

  const extrapolate = options.extrapolate ?? 'clamp';

  if (extrapolate !== 'clamp' && extrapolate !== 'extend')
    throw new TypeError("interpolate extrapolate is 'clamp' or 'extend'");

  return makeDerived({
    from: source,
    op: 'interpolate',
    input: input.slice(),
    output: output.slice(),
    extrapolate,
  });
}

function interpolateValue(
  value: number,
  input: readonly number[],
  output: readonly Scalar[],
  extrapolate: Extrapolate,
): Scalar {
  const last = input.length - 1;
  let segment = 0;

  while (segment < last - 1 && value > input[segment + 1]) segment++;

  const [from, to] = [input[segment], input[segment + 1]];
  let progress = (value - from) / (to - from);

  if (extrapolate === 'clamp') progress = Math.min(1, Math.max(0, progress));

  const [start, end] = [output[segment], output[segment + 1]];

  if (typeof start === 'number' && typeof end === 'number') return start + (end - start) * progress;

  const a = channels(String(start));
  const b = channels(String(end));
  // Colors cannot extend past their ends.
  const t = Math.min(1, Math.max(0, progress));

  return join(a.map((channel, index) => channel + (b[index] - channel) * t));
}
