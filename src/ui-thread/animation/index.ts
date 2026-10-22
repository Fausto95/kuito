// Runners for the animation specs src/runtime/animation-specs.ts builds.
import { delay, repeat, sequence } from './composite';
import { decay } from './decay';
import type { Callback, Runner } from './runner';
import { isSpec, number, type Spec } from './spec';
import { spring } from './spring';
import { timing } from './timing';

export type { Runner } from './runner';

/** An animation as the builders make it: `{ target?, __kuitoAnimation, onEnd? }`. */
export function isAnimation(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && '__kuitoAnimation' in value;
}

function target(animation: Record<string, unknown>, type: string): number {
  if (typeof animation.target !== 'number')
    throw new TypeError('A ' + type + ' animation needs a number target');

  return animation.target;
}

function spec(animation: Record<string, unknown>): Spec {
  const value = animation.__kuitoAnimation;

  if (!isSpec(value)) throw new TypeError('Malformed animation');

  return value;
}

const RUNNERS: Readonly<
  Record<string, (animation: Record<string, unknown>, onEnd: Callback | null) => Runner>
> = {
  timing: (animation, onEnd) => timing(spec(animation), target(animation, 'timing'), onEnd),
  spring: (animation, onEnd) => spring(spec(animation), target(animation, 'spring'), onEnd),
  decay: (animation, onEnd) => decay(spec(animation), onEnd),
  sequence(animation, onEnd) {
    const steps = spec(animation).steps;

    if (!Array.isArray(steps) || !steps.length) throw new TypeError('A sequence needs steps');

    return sequence(steps.map(createRunner), onEnd);
  },
  repeat(animation, onEnd) {
    const description = spec(animation);
    const count = number(description, 'count');

    return repeat(createRunner(description.animation), count, description.reverse === true, onEnd);
  },
};

export function createRunner(animation: unknown): Runner {
  if (!isAnimation(animation)) throw new TypeError('Not an animation');

  const description = spec(animation);
  const make = RUNNERS[String(description.type)];
  const onEnd = animation.onEnd;

  if (!make) throw new TypeError('Unknown animation ' + String(description.type));

  if (onEnd !== undefined && typeof onEnd !== 'function')
    throw new TypeError('onEnd must be a function');

  const runner = make(animation, onEnd === undefined ? null : (finished) => onEnd(finished));
  const wait = number(description, 'delay');

  return wait > 0 ? delay(wait, runner) : runner;
}
