/*
 * Animations as plain data: how one value moves (timing, spring, decay) and,
 * with `.to(target)`, where to. A prop, a transition, an effect or a motion
 * value runs them on the UI thread (src/ui-thread/animation). This module
 * imports nothing: the kernel, app code and, through the thread compiler,
 * UI-thread code all build the same objects.
 *
 * Config names, defaults and validation follow Reanimated's timing, spring,
 * decay, sequence, repeat and delay animations
 * (https://github.com/software-mansion/react-native-reanimated,
 * src/animation), MIT License, Copyright (c) 2016 Software Mansion.
 */

/** A CSS cubic-bezier curve: x1, y1, x2, y2. */
export type CubicBezier = readonly [number, number, number, number];

export interface TimingSpec {
  type: 'timing';
  duration: number;
  easing: CubicBezier;
  delay: number;
}

export interface SpringSpec {
  type: 'spring';
  /** Physics, unless duration and dampingRatio describe the spring instead. */
  damping?: number;
  stiffness?: number;
  mass: number;
  velocity: number;
  overshootClamping: boolean;
  energyThreshold: number;
  duration?: number;
  dampingRatio?: number;
  clamp?: { min?: number; max?: number };
  delay: number;
}

export interface DecaySpec {
  type: 'decay';
  velocity: number;
  deceleration: number;
  velocityFactor: number;
  clamp?: readonly [number, number];
  rubberBand: boolean;
  rubberBandFactor: number;
  delay: number;
}

export interface SequenceSpec {
  type: 'sequence';
  steps: Animation<unknown>[];
  delay: number;
}

export interface RepeatSpec {
  type: 'repeat';
  animation: Animation<unknown>;
  /** Repetitions; 0 repeats until interrupted. */
  count: number;
  reverse: boolean;
  delay: number;
}

export type AnimationSpec = TimingSpec | SpringSpec | DecaySpec | SequenceSpec | RepeatSpec;

/** Called when the animation finishes (true) or is interrupted (false). */
export type AnimationCallback = (finished: boolean) => void;

/** Where an animation comes to rest: a number, a color, or snap points to pick from. */
export type Target = number | string | readonly number[];

/** What a builder returns: give it to a prop, a transition or a motion value. */
export interface Animation<T = number> {
  /** Where it comes to rest; without one, the prop or transition says. */
  readonly target?: T | readonly number[];
  readonly __kuitoAnimation: AnimationSpec;
  readonly onEnd?: AnimationCallback;
  /**
   * The same animation toward `target`. Several numbers are snap points: a
   * release goes to the one nearest where the throw would land.
   */
  to<U extends number | string>(
    target: U | readonly number[],
  ): Animation<U extends number ? number : string>;
}

export interface TimingConfig {
  duration?: number;
  easing?: CubicBezier;
  delay?: number;
  onEnd?: AnimationCallback;
}

export interface SpringConfig {
  damping?: number;
  stiffness?: number;
  mass?: number;
  velocity?: number;
  /** False stops it at its target instead of swinging past; true by default. */
  overshoot?: boolean;
  energyThreshold?: number;
  duration?: number;
  dampingRatio?: number;
  clamp?: { min?: number; max?: number };
  delay?: number;
  onEnd?: AnimationCallback;
}

export interface DecayConfig {
  /** Units per second; a gesture's release gives its own. */
  velocity?: number;
  deceleration?: number;
  velocityFactor?: number;
  clamp?: readonly [number, number];
  /** Overshoot the clamp and spring back, instead of stopping at it. */
  rubberBand?: boolean;
  rubberBandFactor?: number;
  delay?: number;
  onEnd?: AnimationCallback;
}

export interface RepeatConfig {
  /** How many times; Infinity (the default) repeats until interrupted. */
  count?: number;
  /** Run every other repetition backwards. */
  reverse?: boolean;
  onEnd?: AnimationCallback;
}

function bezierX(value: number): number {
  if (typeof value !== 'number' || !(value >= 0 && value <= 1))
    throw new TypeError('easing.bezier x values must be between 0 and 1');

  return value;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !isFinite(value))
    throw new TypeError(name + ' must be a number');

  return value;
}

export function nonNegative(value: unknown, name: string): number {
  if (typeof value !== 'number' || !(value >= 0))
    throw new TypeError(name + ' must be a non-negative number');

  return value;
}

function positive(value: unknown, name: string): number {
  if (typeof value !== 'number' || !(value > 0))
    throw new TypeError(name + ' must be a positive number');

  return value;
}

const linear: CubicBezier = [0, 0, 1, 1];
const ease: CubicBezier = [0.25, 0.1, 0.25, 1];
const easeIn: CubicBezier = [0.42, 0, 1, 1];
const easeOut: CubicBezier = [0, 0, 0.58, 1];
const easeInOut: CubicBezier = [0.42, 0, 0.58, 1];

/** Cubic-bezier curves, the same data the CSS compiler emits for `transition`. */
export const easing = Object.freeze({
  linear,
  ease,
  in: easeIn,
  out: easeOut,
  inOut: easeInOut,
  bezier(x1: number, y1: number, x2: number, y2: number): CubicBezier {
    return [
      bezierX(x1),
      finite(y1, 'easing.bezier y1'),
      bezierX(x2),
      finite(y2, 'easing.bezier y2'),
    ];
  },
});

function callback(onEnd: AnimationCallback | undefined): AnimationCallback | undefined {
  if (onEnd !== undefined && typeof onEnd !== 'function')
    throw new TypeError('onEnd must be a function');

  return onEnd;
}

function checkTarget(target: unknown): Target {
  if (typeof target === 'number' || typeof target === 'string') return target;

  if (Array.isArray(target) && target.length && target.every((each) => typeof each === 'number'))
    return target.slice();

  throw new TypeError('A target is a number, a color or a list of them');
}

/**
 * An animation's data, with `to` beside it. `to` is not enumerable, so the
 * animation stays plain data on the wire and on the UI thread.
 */
export function makeAnimation<T>(
  spec: AnimationSpec,
  target?: unknown,
  onEnd?: AnimationCallback,
): Animation<T> {
  const made: Record<string, unknown> = {
    ...(target !== undefined && { target: checkTarget(target) }),
    __kuitoAnimation: spec,
    ...(onEnd !== undefined && { onEnd }),
  };

  Object.defineProperty(made, 'to', {
    value: (next: unknown) => makeAnimation(spec, next, onEnd),
    enumerable: false,
  });

  return made as never;
}

export function isAnimation(value: unknown): value is Animation<unknown> {
  return typeof value === 'object' && value !== null && '__kuitoAnimation' in value;
}

export function timingSpec(config: TimingConfig = {}): TimingSpec {
  return {
    type: 'timing',
    duration: nonNegative(config.duration === undefined ? 300 : config.duration, 'duration'),
    easing: config.easing || easeInOut,
    delay: nonNegative(config.delay || 0, 'delay'),
  };
}

/**
 * Physics (damping, stiffness, mass) or a duration and damping ratio, as in
 * Reanimated; defaults are Reanimated 3's.
 */
export function springSpec(config: SpringConfig = {}): SpringSpec {
  const byDuration = config.duration !== undefined || config.dampingRatio !== undefined;
  const byPhysics = config.damping !== undefined || config.stiffness !== undefined;

  if (byDuration && byPhysics)
    throw new TypeError(
      'A spring takes either stiffness and damping, or duration and dampingRatio',
    );

  if (config.clamp !== undefined && !byDuration)
    throw new TypeError('A spring clamp needs duration or dampingRatio');

  const common = {
    mass: positive(config.mass === undefined ? 1 : config.mass, 'mass'),
    velocity: finite(config.velocity || 0, 'velocity'),
    overshootClamping: config.overshoot === false,
    energyThreshold: positive(
      config.energyThreshold === undefined ? 6e-9 : config.energyThreshold,
      'energyThreshold',
    ),
  };
  const delay = nonNegative(config.delay || 0, 'delay');

  if (!byDuration)
    return {
      type: 'spring',
      damping: positive(config.damping === undefined ? 10 : config.damping, 'damping'),
      stiffness: positive(config.stiffness === undefined ? 100 : config.stiffness, 'stiffness'),
      ...common,
      delay,
    };

  return {
    type: 'spring',
    ...common,
    duration: nonNegative(config.duration === undefined ? 1333 : config.duration, 'duration'),
    dampingRatio: positive(
      config.dampingRatio === undefined ? 0.5 : config.dampingRatio,
      'dampingRatio',
    ),
    ...(config.clamp !== undefined && { clamp: config.clamp }),
    delay,
  };
}

export function decaySpec(config: DecayConfig = {}): DecaySpec {
  const clamp = config.clamp;

  if (clamp !== undefined) {
    if (clamp.length !== 2) throw new TypeError('clamp must be [min, max]');

    if (finite(clamp[0], 'clamp min') > finite(clamp[1], 'clamp max'))
      throw new TypeError('clamp min must not exceed max');
  }

  if (config.rubberBand && clamp === undefined) throw new TypeError('rubberBand needs a clamp');

  return {
    type: 'decay',
    velocity: finite(config.velocity === undefined ? 0 : config.velocity, 'velocity'),
    deceleration: positive(
      config.deceleration === undefined ? 0.998 : config.deceleration,
      'deceleration',
    ),
    velocityFactor: positive(
      config.velocityFactor === undefined ? 1 : config.velocityFactor,
      'velocityFactor',
    ),
    ...(clamp !== undefined && { clamp: [clamp[0], clamp[1]] as const }),
    rubberBand: !!config.rubberBand,
    rubberBandFactor: positive(
      config.rubberBandFactor === undefined ? 0.6 : config.rubberBandFactor,
      'rubberBandFactor',
    ),
    delay: nonNegative(config.delay || 0, 'delay'),
  };
}

/** Along a curve: 300ms ease-in-out by default; a number is the duration. */
export function timing(config: number | TimingConfig = {}): Animation {
  const options = typeof config === 'number' ? { duration: config } : config;

  return makeAnimation(timingSpec(options), undefined, callback(options.onEnd));
}

/** With a spring; it keeps the velocity of what it interrupts. */
export function spring(config: SpringConfig = {}): Animation {
  return makeAnimation(springSpec(config), undefined, callback(config.onEnd));
}

/** Keep moving at `velocity`, slowing down until it stops or meets the clamp. */
export function decay(config: DecayConfig = {}): Animation {
  return makeAnimation(decaySpec(config), undefined, callback(config.onEnd));
}

/** Run `animation` again and again, forever by default. */
export function repeat<T>(animation: Animation<T>, config: RepeatConfig = {}): Animation<T> {
  if (!isAnimation(animation)) throw new TypeError('repeat takes an animation');

  const count = config.count === undefined ? Infinity : config.count;

  return makeAnimation(
    {
      type: 'repeat',
      animation,
      count: count === Infinity ? 0 : nonNegative(count, 'count'),
      reverse: !!config.reverse,
      delay: 0,
    },
    undefined,
    callback(config.onEnd),
  );
}

/** Start `animation` after `ms`; what it interrupts keeps running meanwhile. */
export function delayAnimation<T>(ms: number, animation: Animation<T>): Animation<T> {
  const spec = animation.__kuitoAnimation;

  return makeAnimation(
    { ...spec, delay: spec.delay + nonNegative(ms, 'delay') },
    animation.target,
    animation.onEnd,
  );
}

/** One after another; each one's onEnd runs when it ends. */
export function sequenceAnimations<T>(steps: Animation<T>[]): Animation<T> {
  return makeAnimation({ type: 'sequence', steps, delay: 0 });
}

/** Keyframe stops by percentage, as in CSS `@keyframes`. */
export type Stops<V> = Readonly<Record<number | `${number}`, V>>;

/** The stops in order, each as [fraction of the duration, value]. */
export function sortedStops<V>(stops: Stops<V>): Array<[number, V]> {
  const sorted = Object.keys(stops)
    .map((key): [number, V] => {
      const percent = Number(key);

      if (!(percent >= 0 && percent <= 100))
        throw new TypeError('a keyframe is a percentage from 0 to 100, not ' + key);

      return [percent / 100, stops[key as `${number}`]];
    })
    .sort((a, b) => a[0] - b[0]);

  if (sorted.length < 2) throw new TypeError('keyframes need at least two stops');

  return sorted;
}

/** One value through its stops: a timing from each stop to the next. */
export function keyframesAnimation(
  stops: Array<[number, number | string]>,
  config: TimingConfig,
): Animation<number | string> {
  const spec = timingSpec(config);
  const steps = stops.map(([at, value], index) =>
    makeAnimation<number | string>(
      {
        ...spec,
        duration: (index ? at - stops[index - 1][0] : at) * spec.duration,
        delay: 0,
      },
      value,
    ),
  );

  return makeAnimation(
    { type: 'sequence', steps, delay: spec.delay },
    stops[stops.length - 1][1],
    callback(config.onEnd),
  );
}

/** The thousandth of its distance a spring settles within. */
const SETTLED = Math.log(1000);

/**
 * How long an animation runs, in milliseconds, for placing effects one after
 * another: a physical spring by its slowest decay, a decay as forever.
 */
export function durationOf(spec: AnimationSpec): number {
  return spec.delay + runningTime(spec);
}

function runningTime(spec: AnimationSpec): number {
  switch (spec.type) {
    case 'timing':
      return spec.duration;
    case 'spring': {
      if (spec.duration !== undefined) return spec.duration;

      const stiffness = Number(spec.stiffness);
      const omega0 = Math.sqrt(stiffness / spec.mass);
      const zeta = Number(spec.damping) / (2 * Math.sqrt(stiffness * spec.mass));
      const rate = zeta < 1 ? zeta * omega0 : omega0 * (zeta - Math.sqrt(zeta * zeta - 1));

      return (SETTLED / rate) * 1000;
    }
    case 'decay':
      return Infinity;
    case 'sequence':
      return spec.steps.reduce((total, step) => total + durationOf(step.__kuitoAnimation), 0);
    case 'repeat':
      return spec.count > 0 ? spec.count * durationOf(spec.animation.__kuitoAnimation) : Infinity;
  }
}

/** Snap points rest at the one nearest `current`. */
export function nearest(points: readonly number[], current: number): number {
  return points.reduce((best, point) =>
    Math.abs(point - current) < Math.abs(best - current) ? point : best,
  );
}

/**
 * Where an animation comes to rest from `current`: what a host without frames
 * shows, and what reduced motion jumps to. A decay rests where it is.
 */
export function endValue(animation: unknown, current: unknown): unknown {
  if (!isAnimation(animation)) throw new TypeError('Not an animation');

  const spec: unknown = animation.__kuitoAnimation;

  if (typeof spec !== 'object' || spec === null || !('type' in spec))
    throw new TypeError('Malformed animation');

  const target = animation.target;
  const described: {
    type?: unknown;
    steps?: unknown[];
    count?: number;
    reverse?: boolean;
    animation?: unknown;
  } = spec;

  switch (described.type) {
    case 'timing':
    case 'spring':
      return Array.isArray(target)
        ? nearest(target, typeof current === 'number' ? current : 0)
        : target;
    case 'decay':
      return current;
    case 'sequence':
      return (described.steps ?? []).reduce<unknown>(
        (value, step) => endValue(step, value),
        current,
      );
    case 'repeat': {
      const count = described.count ?? 0;

      // Reversing an even number of times comes back to the start.
      return described.reverse && count > 0 && count % 2 === 0
        ? current
        : endValue(described.animation, current);
    }
    default:
      throw new TypeError('Unknown animation ' + String(described.type));
  }
}
