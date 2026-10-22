/*
 * Composing animations and effects in time: one set of functions for both,
 * as each one's data allows (docs/motion.md). Imports only the two data
 * modules, so app code and the kernel build the same objects.
 */
import {
  delayAnimation,
  isAnimation,
  keyframesAnimation,
  nonNegative,
  sequenceAnimations,
  sortedStops,
  type Animation,
  type Stops,
  type TimingConfig,
} from './animation-specs';
import {
  delayEffect,
  isEffect,
  keyframesEffect,
  parallelEffects,
  sequenceEffects,
  staggerEffects,
  type Effect,
} from './effects';

type Scalar = number | string;

/** Start after `ms`. */
export function delay<T>(ms: number, animation: Animation<T>): Animation<T>;

export function delay(ms: number, effect: Effect): Effect;

export function delay(ms: number, value: Animation<unknown> | Effect): Animation<unknown> | Effect {
  nonNegative(ms, 'delay');

  if (isAnimation(value)) return delayAnimation(ms, value);

  if (isEffect(value)) return delayEffect(ms, value);

  throw new TypeError('delay takes an animation or an effect');
}

/** One after another. */
export function sequence<T>(...animations: Animation<T>[]): Animation<T>;

export function sequence(...effects: Effect[]): Effect;

export function sequence(...values: unknown[]): Animation<unknown> | Effect {
  if (!values.length) throw new TypeError('sequence needs at least one animation or effect');

  if (values.every(isAnimation)) return sequenceAnimations(values);

  if (values.every(isEffect)) return sequenceEffects(values);

  if (values.every((value) => isAnimation(value) || isEffect(value)))
    throw new TypeError('sequence takes animations or effects, not both');

  throw new TypeError('sequence takes animations or effects');
}

/** Effects at once: `parallel(a, b)` is `a.and(b)`. */
export function parallel(...effects: Effect[]): Effect {
  if (!effects.length || !effects.every(isEffect)) throw new TypeError('parallel takes effects');

  return parallelEffects(effects);
}

/** Effects at once, each `each` ms after the one before. */
export function stagger(each: number, ...effects: Effect[]): Effect {
  nonNegative(each, 'stagger');

  if (!effects.length || !effects.every(isEffect)) throw new TypeError('stagger takes effects');

  return staggerEffects(each, effects);
}

/**
 * Stops by percentage, as CSS `@keyframes`: values for one prop make an
 * animation, objects of props make an effect. A number is the duration.
 */
export function keyframes(stops: Stops<number>, config?: number | TimingConfig): Animation<number>;

export function keyframes(stops: Stops<string>, config?: number | TimingConfig): Animation<string>;

export function keyframes(
  stops: Stops<Readonly<Record<string, Scalar>>>,
  config?: number | TimingConfig,
): Effect;

export function keyframes(
  stops: Stops<unknown>,
  config: number | TimingConfig = {},
): Animation<Scalar> | Effect {
  const options = typeof config === 'number' ? { duration: config } : config;
  const sorted = sortedStops<unknown>(stops);
  const scalars = sorted.flatMap(([at, value]): Array<[number, Scalar]> =>
    typeof value === 'number' || typeof value === 'string' ? [[at, value]] : [],
  );

  if (scalars.length === sorted.length) return keyframesAnimation(scalars, options);

  const props = new Map<string, Array<[number, Scalar]>>();

  sorted.forEach(([at, frame]) => {
    if (typeof frame !== 'object' || frame === null || Array.isArray(frame))
      throw new TypeError('keyframes take values for one prop or objects of props, not both');

    Object.keys(frame).forEach((prop) => {
      const value: unknown = (frame as Record<string, unknown>)[prop];

      if (typeof value !== 'number' && typeof value !== 'string')
        throw new TypeError('keyframe ' + prop + ' must be a number or a color');

      props.set(prop, (props.get(prop) ?? []).concat([[at, value]]));
    });
  });

  const frames: Record<string, Animation<Scalar>> = {};

  props.forEach((list, prop) => {
    if (list.length < 2) throw new TypeError('keyframes need at least two stops of ' + prop);

    frames[prop] = keyframesAnimation(list, options);
  });

  return keyframesEffect(frames);
}
