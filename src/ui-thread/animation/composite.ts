// sequence, repeat and delay: animations made of animations. Ported from
// Reanimated's withSequence, withRepeat and withDelay
// (https://github.com/software-mansion/react-native-reanimated,
// src/animation/sequence.ts, repeat.ts and delay.ts), MIT License,
// Copyright (c) 2016 Software Mansion.
import { createBase, type Callback, type Runner } from './runner';

export function sequence(steps: Runner[], onEnd: Callback | null): Runner {
  const animation = createBase('sequence', steps[steps.length - 1].toValue, null);
  let index = 0;

  animation.onFrame = (now) => {
    const step = steps[index];
    const finished = step.onFrame(now);

    animation.current = step.current;
    animation.velocity = step.velocity;

    if (!finished) return false;

    // Each step's onEnd runs as it ends, not after all of them.
    step.end(true);
    index++;

    if (index < steps.length) {
      const next = steps[index];

      next.onStart(step.current, now, step);

      return false;
    }

    return true;
  };

  animation.onStart = (value, now, previous) => {
    index = 0;
    // The first step continues from what the sequence interrupts.
    steps[0].onStart(value, now, previous ?? steps[steps.length - 1]);
  };

  animation.end = (finished) => {
    animation.finished = finished;

    // Interrupted: the steps that did not end, end unfinished.
    if (!finished) steps.forEach((step) => step.finished || step.end(false));

    onEnd?.(finished);
  };

  return animation;
}

export function repeat(
  inner: Runner,
  count: number,
  reverse: boolean,
  onEnd: Callback | null,
): Runner {
  const animation = createBase('repeat', undefined, null);
  let reps = 0;

  animation.onFrame = (now) => {
    const finished = inner.onFrame(now);

    animation.current = inner.current;
    animation.velocity = inner.velocity;

    if (!finished) return false;

    reps += 1;
    // The inner animation's onEnd runs on every repetition.
    inner.end(true);

    if (count > 0 && reps >= count) return true;

    const startValue = reverse ? inner.current : animation.startValue;

    if (reverse) {
      inner.toValue = animation.startValue;
      animation.startValue = startValue;
    }

    inner.finished = false;
    inner.ended = false;
    inner.onStart(startValue, now, null);

    return false;
  };

  animation.onStart = (value, now, previous) => {
    animation.startValue = value;
    reps = 0;
    inner.onStart(value, now, previous);
  };

  animation.end = (finished) => {
    animation.finished = finished;

    if (animation.ended) return;

    animation.ended = true;
    onEnd?.(finished);

    if (!finished) inner.end(false);
  };

  return animation;
}

/** Waits `ms`; meanwhile what it interrupted keeps running. */
export function delay(ms: number, inner: Runner): Runner {
  const animation = createBase(inner.type, inner.toValue, null);
  let previous: Runner | null = null;
  let started = false;

  animation.onFrame = (now) => {
    if (now - animation.startTime >= ms) {
      if (!started) {
        inner.onStart(animation.current, now, previous);
        previous = null;
        started = true;
      }

      const finished = inner.onFrame(now);

      animation.current = inner.current;
      animation.velocity = inner.velocity;

      return finished;
    } else if (previous) {
      const finished = previous.finished || previous.onFrame(now);

      animation.current = previous.current;

      if (finished) previous = null;
    }

    return false;
  };

  animation.onStart = (value, now, interrupted) => {
    animation.startTime = now;
    started = false;
    animation.current = value;
    previous = interrupted;
  };

  animation.end = (finished) => {
    animation.finished = finished;
    inner.end(finished);
  };

  return animation;
}
