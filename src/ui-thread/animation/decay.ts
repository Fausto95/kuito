// decay: keep moving, slowing down, until slow enough to stop or clamped; with
// a rubber band, overshoot the clamp and spring back. Ported from Reanimated's
// withDecay (https://github.com/software-mansion/react-native-reanimated,
// src/animation/decay), MIT License, Copyright (c) 2016 Software Mansion.
import { createBase, type Callback, type Runner } from './runner';
import { number, type Spec } from './spec';

const SLOPE_FACTOR = 0.1;
const VELOCITY_EPS = 1 / 20;
const DERIVATIVE_EPS = 0.1;

interface DecayConfig {
  deceleration: number;
  velocityFactor: number;
  clamp: [number, number] | undefined;
  rubberBandFactor: number;
}

function rigidDecay(
  animation: Runner,
  now: number,
  initialVelocity: number,
  config: DecayConfig,
): boolean {
  const { lastTimestamp, startTimestamp, current, velocity } = animation;
  const deltaTime = Math.min(Math.max(now - lastTimestamp, 0), 64);
  const v = velocity * Math.exp(-(1 - config.deceleration) * (now - startTimestamp) * SLOPE_FACTOR);

  animation.current = current + (v * config.velocityFactor * deltaTime) / 1000;
  animation.velocity = v;
  animation.lastTimestamp = now;

  if (config.clamp) {
    if (initialVelocity < 0 && animation.current <= config.clamp[0]) {
      animation.current = config.clamp[0];

      return true;
    } else if (initialVelocity > 0 && animation.current >= config.clamp[1]) {
      animation.current = config.clamp[1];

      return true;
    }
  }

  return Math.abs(v) < VELOCITY_EPS;
}

function rubberBandDecay(
  animation: Runner,
  now: number,
  state: { springActive: boolean },
  config: DecayConfig & { clamp: [number, number] },
): boolean {
  const { lastTimestamp, startTimestamp, current, velocity } = animation;
  const deltaTime = Math.min(Math.max(now - lastTimestamp, 0), 64);
  const clampIndex =
    Math.abs(current - config.clamp[0]) < Math.abs(current - config.clamp[1]) ? 0 : 1;
  let derivative = 0;

  if (current < config.clamp[0] || current > config.clamp[1])
    derivative = current - config.clamp[clampIndex];

  const v =
    velocity * Math.exp(-(1 - config.deceleration) * (now - startTimestamp) * SLOPE_FACTOR) -
    derivative * config.rubberBandFactor;

  if (Math.abs(derivative) > DERIVATIVE_EPS) {
    state.springActive = true;
  } else if (state.springActive) {
    animation.current = config.clamp[clampIndex];

    return true;
  } else if (Math.abs(v) < VELOCITY_EPS) {
    return true;
  }

  animation.current = current + (v * config.velocityFactor * deltaTime) / 1000;
  animation.velocity = v;
  animation.lastTimestamp = now;

  return false;
}

function readClamp(spec: Spec): [number, number] | undefined {
  const clamp = spec.clamp;

  if (clamp === undefined) return undefined;

  if (!Array.isArray(clamp) || clamp.length !== 2)
    throw new TypeError('decay clamp must be [min, max]');

  return [Number(clamp[0]), Number(clamp[1])];
}

export function decay(spec: Spec, onEnd: Callback | null): Runner {
  const config: DecayConfig = {
    deceleration: number(spec, 'deceleration'),
    velocityFactor: number(spec, 'velocityFactor'),
    clamp: readClamp(spec),
    rubberBandFactor: number(spec, 'rubberBandFactor'),
  };
  const initialVelocity = number(spec, 'velocity');
  const clamp = config.clamp;
  const state = { springActive: false };
  const animation = createBase('decay', undefined, onEnd);

  animation.velocity = initialVelocity;

  animation.onFrame =
    spec.rubberBand === true && clamp
      ? (now) => rubberBandDecay(animation, now, state, { ...config, clamp })
      : (now) => rigidDecay(animation, now, initialVelocity, config);

  animation.onStart = (value, now) => {
    animation.current = value;
    animation.lastTimestamp = now;
    animation.startTimestamp = now;
    animation.velocity = initialVelocity;
  };

  return animation;
}
