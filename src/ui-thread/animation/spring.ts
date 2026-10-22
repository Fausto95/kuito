// spring: a damped harmonic oscillator, by its physics or by a duration and
// damping ratio. Ported from Reanimated's withSpring
// (https://github.com/software-mansion/react-native-reanimated,
// src/animation/spring/spring.ts and springUtils.ts), MIT License,
// Copyright (c) 2016 Software Mansion.
import { createBase, type Callback, type Runner } from './runner';
import { number, optionalNumber, type Spec } from './spec';

interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  velocity: number;
  overshootClamping: boolean;
  energyThreshold: number;
  duration: number;
  dampingRatio: number;
  clamp: { min?: number; max?: number } | undefined;
  useDuration: boolean;
  skipAnimation: boolean;
}

function bisectRoot(
  min: number,
  max: number,
  func: (x: number) => number,
  precision: number,
  maxIterations: number,
) {
  const direction = func(max) >= func(min) ? 1 : -1;
  let idx = maxIterations;
  let current = (max + min) / 2;

  while (Math.abs(func(current)) > precision && idx > 0) {
    idx -= 1;

    if (func(current) * direction < 0) min = current;
    else max = current;

    current = (min + max) / 2;
  }

  return current;
}

function getEnergy(displacement: number, velocity: number, stiffness: number, mass: number) {
  const potentialEnergy = 0.5 * stiffness * displacement ** 2;
  const kineticEnergy = 0.5 * mass * velocity ** 2;

  return potentialEnergy + kineticEnergy;
}

function initialCalculations(stiffness: number, config: SpringConfig) {
  if (config.skipAnimation) return { zeta: 0, omega0: 0, omega1: 0 };

  if (config.useDuration) {
    const { mass: m, dampingRatio: zeta } = config;
    // Angular frequency and natural angular frequency of a damped oscillator.
    const omega0 = Math.sqrt(stiffness / m);
    const omega1 = zeta < 1 ? omega0 * Math.sqrt(1 - zeta ** 2) : 0;

    return { zeta, omega0, omega1 };
  }

  const { damping: c, mass: m, stiffness: k } = config;
  const zeta = c / (2 * Math.sqrt(k * m)); // damping ratio
  const omega0 = Math.sqrt(k / m); // undamped angular frequency of the oscillator (rad/ms)
  const omega1 = zeta < 1 ? omega0 * Math.sqrt(1 - zeta ** 2) : 0; // exponential decay

  return { zeta, omega0, omega1 };
}

function scaleZetaToMatchClamps(animation: Runner, clamp: { min?: number; max?: number }): number {
  const { zeta, startValue } = animation;
  const toValue = Number(animation.toValue);

  if (startValue === 0) return zeta;

  const [firstBound, secondBound] =
    startValue <= 0 ? [clamp.min, clamp.max] : [clamp.max, clamp.min];
  // The first extremum is at secondBound side, the second at firstBound's.
  const relativeExtremum1 =
    secondBound !== undefined ? Math.abs((secondBound - toValue) / startValue) : undefined;
  const relativeExtremum2 =
    firstBound !== undefined ? Math.abs((firstBound - toValue) / startValue) : undefined;
  const newZeta1 =
    relativeExtremum1 !== undefined ? Math.abs(Math.log(relativeExtremum1) / Math.PI) : undefined;
  const newZeta2 =
    relativeExtremum2 !== undefined
      ? Math.abs(Math.log(relativeExtremum2) / (2 * Math.PI))
      : undefined;
  const zetaSatisfyingClamp = [newZeta1, newZeta2].filter((x): x is number => x !== undefined);

  // The bigger is zeta the smaller are bounces, we return the biggest one
  // because it should satisfy all conditions
  return Math.max(...zetaSatisfyingClamp, zeta);
}

function calculateNewStiffnessToMatchDuration(x0: number, config: SpringConfig, v0: number) {
  if (config.skipAnimation) return 0;

  // The stiffness for which the spring's energy falls below the threshold
  // after the duration, perceived as settled.
  const {
    dampingRatio: zeta,
    energyThreshold: threshold,
    mass: m,
    duration: targetDuration,
  } = config;
  const energyDiffForStiffness = (stiffness: number) => {
    const perceptualCoefficient = 1.5;
    const MILLISECONDS_IN_SECOND = 1000;
    const settlingDuration = (targetDuration * perceptualCoefficient) / MILLISECONDS_IN_SECOND;
    const omega0 = Math.sqrt(stiffness / m) * zeta;
    const xtk = (x0 + (v0 + x0 * omega0) * settlingDuration) * Math.exp(-omega0 * settlingDuration);
    const vtk =
      (x0 + (v0 + x0 * omega0) * settlingDuration) *
        Math.exp(-omega0 * settlingDuration) *
        -omega0 +
      (v0 + x0 * omega0) * Math.exp(-omega0 * settlingDuration);
    const e0 = getEnergy(x0, v0, stiffness, m);
    const etk = getEnergy(xtk, vtk, stiffness, m);

    return etk / e0 - threshold;
  };

  const precision = config.energyThreshold * 1e-3; // Experimentally seems to be good enough.

  // Bisection turns out to be much faster than Newton's method in our case.
  // Stiffness for an 8ms animation doesn't exceed 2e3; 8e3 adds a safety margin.
  return bisectRoot(Number.EPSILON, 8e3, energyDiffForStiffness, precision, 100);
}

function criticallyDamped(toValue: number, v0: number, x0: number, omega0: number, t: number) {
  const envelope = Math.exp(-omega0 * t);
  const position = toValue + envelope * (x0 + (v0 + omega0 * x0) * t);
  const velocity =
    envelope * -omega0 * (x0 + (v0 + omega0 * x0) * t) + envelope * (v0 + omega0 * x0);

  return { position, velocity };
}

function underDamped(
  toValue: number,
  zeta: number,
  v0: number,
  x0: number,
  omega0: number,
  omega1: number,
  t: number,
) {
  const sin1 = Math.sin(omega1 * t);
  const cos1 = Math.cos(omega1 * t);
  const envelope = Math.exp(-zeta * omega0 * t);
  const frag1 = envelope * (sin1 * ((v0 + zeta * omega0 * x0) / omega1) + x0 * cos1);
  const position = toValue + frag1;
  // The derivative of the oscillation function.
  const velocity =
    -zeta * omega0 * frag1 + envelope * (cos1 * (v0 + zeta * omega0 * x0) - omega1 * x0 * sin1);

  return { position, velocity };
}

function isTerminating(animation: Runner, initialEnergy: number, config: SpringConfig): boolean {
  const { velocity, startValue, current } = animation;
  const toValue = Number(animation.toValue);

  if (config.overshootClamping) {
    const leftBound = startValue >= 0 ? toValue : toValue + startValue;
    const rightBound = leftBound + Math.abs(startValue);

    if (current < leftBound || current > rightBound) return true;
  }

  const currentEnergy = getEnergy(toValue - current, velocity, config.stiffness, config.mass);

  return initialEnergy === 0 || currentEnergy / initialEnergy <= config.energyThreshold;
}

function readConfig(spec: Spec): SpringConfig {
  const duration = optionalNumber(spec, 'duration');
  const dampingRatio = optionalNumber(spec, 'dampingRatio');
  const clamp = spec.clamp;
  const config: SpringConfig = {
    stiffness: optionalNumber(spec, 'stiffness') ?? 100,
    damping: optionalNumber(spec, 'damping') ?? 10,
    mass: number(spec, 'mass'),
    velocity: number(spec, 'velocity'),
    overshootClamping: spec.overshootClamping === true,
    energyThreshold: number(spec, 'energyThreshold'),
    duration: duration ?? 0,
    dampingRatio: dampingRatio ?? 0,
    clamp:
      typeof clamp === 'object' && clamp !== null && !Array.isArray(clamp)
        ? {
            min: 'min' in clamp && typeof clamp.min === 'number' ? clamp.min : undefined,
            max: 'max' in clamp && typeof clamp.max === 'number' ? clamp.max : undefined,
          }
        : undefined,
    useDuration: duration !== undefined || dampingRatio !== undefined,
    skipAnimation: false,
  };

  config.skipAnimation =
    !(
      config.stiffness > 0 &&
      config.damping > 0 &&
      config.mass > 0 &&
      config.energyThreshold > 0
    ) ||
    (config.useDuration && !(config.dampingRatio > 0)) ||
    (config.useDuration && config.duration === 0);

  return config;
}

export function spring(spec: Spec, toValue: number, onEnd: Callback | null): Runner {
  const config = readConfig(spec);
  const animation = createBase('spring', toValue, onEnd);
  let initialEnergy = 0;

  animation.velocity = config.velocity;
  animation.duration = config.duration;
  animation.dampingRatio = config.dampingRatio;

  // Read on every frame: a reversing repeat swaps the target.
  const target = () => Number(animation.toValue);

  animation.onFrame = (now) => {
    const { current } = animation;
    const toValue = target();

    if (config.skipAnimation) {
      animation.current = toValue;
      animation.lastTimestamp = 0;

      return true;
    }

    const deltaTime = Math.min(Math.max(now - animation.lastTimestamp, 0), 64);

    animation.lastTimestamp = now;

    const t = deltaTime / 1000;
    const v0 = animation.velocity;
    const x0 = current - toValue;
    const { zeta, omega0, omega1 } = animation;
    const next =
      zeta < 1
        ? underDamped(toValue, zeta, v0, x0, omega0, omega1, t)
        : criticallyDamped(toValue, v0, x0, omega0, t);

    animation.current = next.position;
    animation.velocity = next.velocity;

    if (isTerminating(animation, initialEnergy, config)) {
      animation.velocity = 0;
      animation.current = toValue;
      // A spring that starts after this one must not read a stale timestamp.
      animation.lastTimestamp = 0;

      return true;
    }

    return false;
  };

  animation.onStart = (value, now, previous) => {
    const toValue = target();

    animation.current = value;

    let stiffness = config.stiffness;
    // The same spring triggered again continues from where it started.
    const triggeredTwice =
      !!previous &&
      !!previous.lastTimestamp &&
      !!previous.startTimestamp &&
      previous.toValue === toValue &&
      previous.duration === animation.duration &&
      previous.dampingRatio === animation.dampingRatio;
    const x0 = triggeredTwice && previous ? previous.startValue : value - toValue;

    animation.startValue = x0;

    // Inertia it inherits carries on only toward the new target; a velocity
    // it is given (a gesture's release) is kept, so a throw away from home
    // overshoots before it comes back.
    const inherited = previous?.velocity || 0;
    const away = (toValue > value && inherited < 0) || (toValue < value && inherited > 0);
    const kept = away ? 0 : inherited;

    animation.velocity = triggeredTwice ? kept : kept + (config.velocity || 0);

    if (triggeredTwice && previous) {
      animation.zeta = previous.zeta || 0;
      animation.omega0 = previous.omega0 || 0;
      animation.omega1 = previous.omega1 || 0;
    } else {
      if (config.useDuration) {
        stiffness = calculateNewStiffnessToMatchDuration(x0, config, animation.velocity);
        config.stiffness = stiffness;
      }

      const { zeta, omega0, omega1 } = initialCalculations(stiffness, config);

      animation.zeta = zeta;
      animation.omega0 = omega0;
      animation.omega1 = omega1;

      if (config.clamp !== undefined)
        animation.zeta = scaleZetaToMatchClamps(animation, config.clamp);
    }

    initialEnergy = getEnergy(x0, config.velocity, config.stiffness, config.mass);
    animation.lastTimestamp = previous?.lastTimestamp || now;
    animation.startTimestamp = triggeredTwice ? previous?.startTimestamp || now : now;
  };

  return animation;
}
