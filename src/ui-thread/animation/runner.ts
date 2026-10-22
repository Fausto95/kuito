// A running animation: what Reanimated calls an animation object. Ported from
// Reanimated (https://github.com/software-mansion/react-native-reanimated,
// src/animation), MIT License, Copyright (c) 2016 Software Mansion.

export type Callback = (finished: boolean) => void;

export interface Runner {
  type: string;
  current: number;
  velocity: number;
  /** Where it comes to rest; decay and repeat have none of their own. */
  toValue: number | undefined;
  startValue: number;
  startTime: number;
  lastTimestamp: number;
  startTimestamp: number;
  /** Spring state, kept so a spring can continue the one it replaces. */
  zeta: number;
  omega0: number;
  omega1: number;
  duration: number;
  dampingRatio: number;
  /** True once it ended; a sequence skips ended steps' callbacks. */
  finished: boolean;
  /** Its onEnd ran; a repeat clears it so the next repetition ends again. */
  ended: boolean;
  onStart(value: number, now: number, previous: Runner | null): void;
  /** Advances to `now`; true when it has come to rest. */
  onFrame(now: number): boolean;
  /** Runs its onEnd once: finished, or interrupted. */
  end(finished: boolean): void;
}

export function createBase(
  type: string,
  toValue: number | undefined,
  onEnd: Callback | null,
): Runner {
  const runner: Runner = {
    type,
    current: toValue ?? 0,
    velocity: 0,
    toValue,
    startValue: 0,
    startTime: 0,
    lastTimestamp: 0,
    startTimestamp: 0,
    zeta: 0,
    omega0: 0,
    omega1: 0,
    duration: 0,
    dampingRatio: 0,
    finished: false,
    ended: false,
    onStart() {},
    onFrame: () => true,
    end(finished) {
      runner.finished = finished;

      if (runner.ended) return;

      runner.ended = true;
      onEnd?.(finished);
    },
  };

  return runner;
}
