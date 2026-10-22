// Display frames: each one advances every running animation, then applies
// what moved. Frames are asked for only while something animates.
import { endValue, nearest } from '../runtime/animation-specs';
import { createRunner, isAnimation, type Runner } from './animation';
import { channels, isHexColor, join } from '../runtime/colors';
import { flush, sendMoved } from './bindings';
import { report } from './errors';
import { host } from './host';
import { setMotion } from './motion';
import { animating, motionSettings, pending, type Animating, type MotionRecord } from './state';

/**
 * Starts `animation` on the next frame, from wherever the value is then. A
 * color runs as four channels, each its own runner, so every animation a
 * number runs, a color runs too. With reduced motion on, it ends at once.
 */
export function animate(record: MotionRecord, animation: unknown): void {
  try {
    if (!isAnimation(animation)) throw new TypeError('Not an animation');

    const previous = record.animation;
    const color = isHexColor(record.value);

    if (!color && (typeof record.value !== 'number' || !isFinite(record.value)))
      throw new TypeError('only numbers and colors animate, not ' + JSON.stringify(record.value));

    if (motionSettings.reduceMotion) return jump(record, animation);

    const targeted = withTarget(animation, record.value, velocityOf(animation, previous));
    const runners = color
      ? [0, 1, 2, 3].map((channel) => createRunner(channelOf(targeted, channel)))
      : [createRunner(targeted)];

    previous?.runners.forEach((runner) => runner.end(false));

    // A color's onEnd belongs to its first channel: it runs once.
    record.animation = {
      runners,
      started: false,
      previous: previous && previous.runners.length === runners.length ? previous.runners : null,
    };

    animating.add(record);
    host.__kuitoUIRequestFrame();
  } catch (error) {
    report('motion value ' + record.id, error);
  }
}

/** Reduced motion: the value moves to where the animation would end, which ends now. */
function jump(record: MotionRecord, animation: Record<string, unknown>): void {
  interrupt(record);
  setMotion(record, endValue(animation, record.value));
  pending.movedHere.add(record);

  const onEnd = animation.onEnd;

  if (typeof onEnd === 'function') onEnd(true);
}

/** The velocity a release gives the animation, or that of what it interrupts. */
function velocityOf(animation: Record<string, unknown>, previous: Animating | null): number {
  const spec = animation.__kuitoAnimation;
  const given =
    typeof spec === 'object' && spec !== null && 'velocity' in spec ? Number(spec.velocity) : 0;

  return given || (previous?.runners[0]?.velocity ?? 0);
}

/** Snap points: the one nearest where the value would coast to at `velocity`. */
function withTarget(
  animation: Record<string, unknown>,
  value: unknown,
  velocity: number,
): Record<string, unknown> {
  const target = animation.target;

  if (!Array.isArray(target) || typeof value !== 'number') return animation;

  return { ...animation, target: nearest(target, value + velocity * PROJECTION) };
}

/**
 * Seconds of coasting a release projects, as UIScrollView's normal
 * deceleration rate (0.998 per ms) does: v * rate / (1 - rate) / 1000.
 */
const PROJECTION = 0.499;

/** The animation for one channel of a color: every target is that channel's value. */
function channelOf(animation: unknown, channel: number): unknown {
  if (!isAnimation(animation)) return animation;

  const spec = animation.__kuitoAnimation;
  const target = animation.target;
  const onEnd = channel === 0 ? animation.onEnd : undefined;
  const nested =
    typeof spec === 'object' && spec !== null
      ? {
          ...spec,
          ...('steps' in spec && Array.isArray(spec.steps)
            ? { steps: spec.steps.map((step: unknown) => channelOf(step, channel)) }
            : {}),
          ...('animation' in spec ? { animation: channelOf(spec.animation, channel) } : {}),
        }
      : spec;

  if (target !== undefined && !isHexColor(target))
    throw new TypeError('a color animates to a hex color, not ' + JSON.stringify(target));

  return {
    __kuitoAnimation: nested,
    ...(target !== undefined && { target: channels(target)[channel] }),
    ...(onEnd !== undefined && { onEnd }),
  };
}

export function interrupt(record: MotionRecord): void {
  const running = record.animation;

  if (!running) return;

  record.animation = null;
  animating.delete(record);
  running.runners.forEach((runner) => runner.end(false));
}

function step(record: MotionRecord, now: number): void {
  const running = record.animation;

  if (!running) return;

  const { runners } = running;
  const color = runners.length === 4;
  const starts = color ? channels(String(record.value)) : [Number(record.value)];

  if (!running.started) {
    runners.forEach((runner, index) =>
      runner.onStart(starts[index], now, running.previous?.[index] ?? null),
    );

    running.started = true;
    running.previous = null;
  }

  const finished = runners.map((runner) => runner.onFrame(now)).every(Boolean);

  setMotion(record, color ? join(runners.map((runner) => runner.current)) : runners[0].current);
  // Watchers on the JS thread hear of animated values as of any UI-thread move.
  pending.movedHere.add(record);

  if (!finished) return;

  record.animation = null;
  animating.delete(record);
  runners.forEach((runner: Runner) => runner.end(true));
}

export function frame(now: number): void {
  Array.from(animating).forEach((record) => {
    try {
      step(record, now);
    } catch (error) {
      report('motion value ' + record.id, error);
      record.animation = null;
      animating.delete(record);
    }
  });

  flush();
  sendMoved();

  if (animating.size) host.__kuitoUIRequestFrame();
}
