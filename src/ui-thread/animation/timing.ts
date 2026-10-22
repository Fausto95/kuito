// timing: a value along an easing curve over a duration. Ported from
// Reanimated's timing animation (https://github.com/software-mansion/react-native-reanimated,
// src/animation/timing.ts), MIT License, Copyright (c) 2016 Software Mansion.
import { bezier } from './bezier';
import { createBase, type Callback, type Runner } from './runner';
import { number, type Spec } from './spec';

export function timing(spec: Spec, toValue: number, onEnd: Callback | null): Runner {
  const duration = number(spec, 'duration');
  const curve = spec.easing;

  if (!Array.isArray(curve) || curve.length !== 4)
    throw new TypeError('timing needs an easing curve');

  const easing = bezier(Number(curve[0]), Number(curve[1]), Number(curve[2]), Number(curve[3]));
  const animation = createBase('timing', toValue, onEnd);

  // Read on every frame: a reversing repeat swaps the target.
  const target = () => Number(animation.toValue);

  animation.onFrame = (now) => {
    const { startTime, startValue } = animation;
    const toValue = target();
    let runtime = now - startTime;

    if (runtime < 0) {
      animation.startTime = now;
      runtime = 0;
    }

    if (runtime >= duration) {
      animation.startTime = 0;
      animation.current = toValue;

      return true;
    }

    const progress = easing(Math.min(Math.max(runtime / duration, 0), 1));

    animation.current = startValue + (toValue - startValue) * progress;

    return false;
  };

  animation.onStart = (value, now, previous) => {
    const toValue = target();

    // Retargeting the same timing keeps its start, so it does not restart.
    if (
      previous &&
      previous.type === 'timing' &&
      previous.toValue === toValue &&
      previous.startTime
    ) {
      animation.startTime = previous.startTime;
      animation.startValue = previous.startValue;
    } else {
      animation.startTime = now;
      animation.startValue = value;
    }

    animation.current = value;
  };

  return animation;
}
