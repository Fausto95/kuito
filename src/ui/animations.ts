/**
 * Animations and effects as data (docs/motion.md):
 *
 *   animate={{ opacity: open.value ? 1 : 0 }}      what changes
 *   transition={{ opacity: spring({ damping: 14 }) }}   how it moves
 *   enter={fade.and(slide.up(12))} exit={fade}    where a view enters from and leaves to
 *   offset.value = spring().to(0)                 a motion value
 *
 * Builders return plain data; the UI thread runs every frame.
 */
import type { Animation, AnimationSpec } from '../runtime/animation-specs';

export { decay, easing, repeat, spring, timing } from '../runtime/animation-specs';
export { delay, keyframes, parallel, sequence, stagger } from '../runtime/compose';
export { fade, slide, zoom } from '../runtime/effects';

export type {
  Animation,
  AnimationCallback,
  CubicBezier,
  DecayConfig,
  RepeatConfig,
  SpringConfig,
  TimingConfig,
} from '../runtime/animation-specs';

export type { Effect } from '../runtime/effects';

export type AnimatableProps =
  | 'opacity'
  | 'backgroundColor'
  | 'translateX'
  | 'translateY'
  | 'scale'
  | 'scaleX'
  | 'scaleY'
  | 'rotate'
  | 'borderRadius'
  | 'borderColor'
  | 'shadowColor'
  | 'shadowRadius'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'width'
  | 'height';

/** How props move, by group; a CSS `transition` compiles to the same. */
export type Transition = Partial<
  Record<
    | 'opacity'
    | 'backgroundColor'
    | 'transform'
    | 'borderRadius'
    | 'borderColor'
    | 'shadow'
    | 'width'
    | 'height'
    | 'all',
    Animation<unknown> | AnimationSpec
  >
>;

/** `animate`'s values: each change moves as the view's `transition` says. */
export type AnimatedProps = Partial<Record<AnimatableProps, number | string>>;
