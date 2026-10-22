// Animated props (docs/motion.md). A prop given an animation, changed under
// its view's `transition` or `animate`, or moved by an `enter` effect binds
// to a motion value of its own, which the UI-thread runner animates: props,
// motion values, transitions and effects share one animator. An `exit`
// effect plays there once the view is removed, and the renderer keeps the
// view until it ends. Without a UI thread, a prop takes the value its
// animation ends at, and effects do nothing.
import {
  endValue,
  isAnimation,
  makeAnimation,
  springSpec,
  timingSpec,
  type AnimationSpec,
} from './animation-specs';
import { isEffect, resolveEffect, type Effect, type Phase } from './effects';
import { isAnimatedValue, isUIBinding, sendProp, type AnimatedValue } from './host';
import { hasUIThread, queueOperation } from './operations';
import { isHexColor } from './colors';
import { ANIMATABLE_PROPS } from './protocol.generated';
import { propMotions, viewExits, viewTransitions } from './state/animations';
import type { MotionHandle } from './state/motion';
import { threads } from './state/threads';
import { views } from './state/views';
import { createMotion, freeMotion, motionRecord } from './motion-values';
import { encodeForUI } from './thread-encoding';
import { uiBinding } from './threads';
import { rememberEntry } from './transaction';
import { dict, isPlainData, own, type PlainData } from './values';

/** Where an animatable prop is before the app first sets it: the native default. */
const REST: Readonly<Record<string, number | string>> = {
  opacity: 1,
  translateX: 0,
  translateY: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  borderRadius: 0,
  borderColor: '#000000',
  shadowRadius: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

/** How a group moves without a transition: transforms spring, the rest ease. */
const DEFAULT_TRANSITIONS: Readonly<Record<string, () => AnimationSpec>> = {
  opacity: () => timingSpec(),
  backgroundColor: () => timingSpec(),
  transform: () => springSpec(),
  borderRadius: () => timingSpec(),
  borderColor: () => timingSpec(),
  shadow: () => timingSpec(),
  width: () => timingSpec(),
  height: () => timingSpec(),
};

/** Kernel props: they shape how the view's props move, and never reach the renderer as given. */
const KERNEL_PROPS: Readonly<
  Record<string, (id: number, value: unknown, previous: unknown) => void>
> = {
  transition: keepTransition,
  animate: animateValues,
  // Played once, when the view is created (enterView).
  enter: () => {},
  exit: keepExit,
  layout: (id, value) => sendProp(id, 'layout', value === null ? null : layoutSpec(value)),
};

/**
 * Send `value` for `name` on view `id`, which had `previous` (undefined for a
 * view the commit creates).
 */
export function sendViewProp(id: number, name: string, value: unknown, previous: unknown): void {
  if (own(KERNEL_PROPS, name)) return KERNEL_PROPS[name](id, value, previous);

  const animation = isAnimatedValue(value) ? value : transitioned(id, name, value, previous);

  if (animation) animate(id, name, animation, previous);
  else sendProp(id, name, value);
}

/** A kernel prop that says how the view's props move. */
export function movesProps(name: string): boolean {
  return own(KERNEL_PROPS, name);
}

function keepTransition(id: number, value: unknown): void {
  rememberEntry(viewTransitions, id);

  if (value === null || value === undefined) return void viewTransitions.delete(id);

  if (!isPlainData(value))
    throw new TypeError('transition must be an object of animations by group');

  const specs = dict<AnimationSpec>();

  Object.keys(value).forEach((group) => {
    specs[group] = transitionSpec(group, value[group]);
  });

  viewTransitions.set(id, specs);
}

/** A transition: an animation (`spring()`), or the spec the CSS compiler emits. */
function transitionSpec(group: string, value: unknown): AnimationSpec {
  if (group !== 'all' && !Object.values(ANIMATABLE_PROPS).includes(group))
    throw new TypeError(
      'transition ' +
        group +
        ': name opacity, backgroundColor, transform, borderRadius, borderColor, shadow, width, height or all',
    );

  const spec = isAnimation(value) ? value.__kuitoAnimation : value;

  if (!isPlainData(spec)) throw new TypeError('transition ' + group + ' must be an animation');

  const number = (name: string) => (typeof spec[name] === 'number' ? spec[name] : undefined);

  if (spec.type === 'spring')
    return isAnimation(value)
      ? value.__kuitoAnimation
      : springSpec({
          damping: number('damping'),
          stiffness: number('stiffness'),
          mass: number('mass'),
          delay: number('delay'),
        });

  if (spec.type === 'timing') {
    const easing = spec.easing;

    return timingSpec({
      duration: number('duration'),
      easing:
        Array.isArray(easing) && easing.length === 4 && easing.every((n) => typeof n === 'number')
          ? [easing[0], easing[1], easing[2], easing[3]]
          : undefined,
      delay: number('delay'),
    });
  }

  throw new TypeError('transition ' + group + ' is timing or spring, not ' + String(spec.type));
}

/** How `name` moves on view `id`: its group's transition, `all`'s, or the default. */
function how(id: number, name: string): AnimationSpec {
  const transitions = viewTransitions.get(id);
  const group = own(ANIMATABLE_PROPS, name) ? ANIMATABLE_PROPS[name] : null;

  if (group && transitions && own(transitions, group)) return transitions[group];

  if (transitions && own(transitions, 'all')) return transitions.all;

  return DEFAULT_TRANSITIONS[group ?? 'opacity']();
}

/** A change its view's transition animates; a first value applies at once. */
function transitioned(
  id: number,
  name: string,
  value: unknown,
  previous: unknown,
): AnimatedValue | null {
  const transitions = viewTransitions.get(id);

  if (!transitions || !own(ANIMATABLE_PROPS, name) || previous === undefined) return null;

  if (value === null || isUIBinding(value)) return null;

  const group = ANIMATABLE_PROPS[name];

  if (!own(transitions, group) && !own(transitions, 'all')) return null;

  return makeAnimation(how(id, name), value);
}

/** Every change of an `animate` value moves as the transition says. */
function animateValues(id: number, value: unknown, previous: unknown): void {
  const next = isPlainData(value) ? value : {};
  const before = isPlainData(previous) ? previous : null;

  Object.keys(before ?? {}).forEach((name) => {
    if (!own(next, name)) sendProp(id, name, null);
  });

  Object.keys(next).forEach((name) => {
    const was = before && own(before, name) ? before[name] : undefined;

    if (was === undefined) sendProp(id, name, next[name]);
    else if (!Object.is(was, next[name]))
      animate(id, name, makeAnimation(how(id, name), next[name]), was);
  });
}

/** A number or a hex color: what the UI thread moves. A size like `50%` or `auto` jumps. */
const moves = (value: unknown) =>
  (typeof value === 'number' && isFinite(value)) || isHexColor(value);

/** The plain value a prop showed, if any: where its animation starts. */
function startOf(name: string, previous: unknown): unknown {
  if (typeof previous === 'number' || typeof previous === 'string') return previous;

  return own(REST, name) ? REST[name] : undefined;
}

function animate(id: number, name: string, animation: AnimatedValue, previous: unknown): void {
  const start = startOf(name, previous);
  const motions = propMotions.get(id);
  const existing = motions && own(motions, name) ? motions[name] : null;
  const end = endValue(animation, start);

  // Nothing to animate from or to, or nothing to run frames: it ends where it ends.
  if (
    !hasUIThread() ||
    (!existing && start === undefined) ||
    [start, end].some((value) => value !== undefined && !moves(value))
  )
    return sendProp(id, name, end);

  const driven = !!threads.boundProps.get(id)?.[name];
  const handle = existing ?? motionOf(id, name, start);

  // A plain value went out since: the motion value starts from it.
  if (existing && !driven && start !== undefined) handle.value = start;

  handle.value = animation;

  const record = motionRecord(handle);

  if (record) sendProp(id, name, uiBinding({ $m: record.id }));
}

function motionOf(id: number, name: string, start: unknown): MotionHandle {
  rememberEntry(propMotions, id, copyMotions);

  const motions = propMotions.get(id) ?? dict<MotionHandle>();
  const handle = createMotion(start);

  motions[name] = handle;
  propMotions.set(id, motions);

  return handle;
}

const copyMotions = (motions: Record<string, MotionHandle>) =>
  Object.assign(dict<MotionHandle>(), motions);

/** The value a prop shows when the view is in place: its own, or the native default. */
function restOf(fields: Record<string, unknown>, name: string): number | string {
  const value = own(fields, name) ? fields[name] : undefined;

  if (typeof value === 'number' || typeof value === 'string') return value;

  if (own(REST, name)) return REST[name];

  throw new TypeError(name + ' has no value to enter to; give the view one');
}

function effectOf(value: unknown, phase: Phase): Effect {
  if (!isEffect(value))
    throw new TypeError(phase + ' takes an effect: fade, slide.up(12), zoom(), keyframes({...})');

  return value;
}

/**
 * A view being created enters: each prop its effect moves starts where the
 * effect says and animates to the view's own value. The props it took are
 * not sent as they are.
 */
export function enterView(id: number, fields: Record<string, unknown>): ReadonlySet<string> {
  const value = fields.enter;

  if (value === undefined || value === null || !hasUIThread()) return new Set();

  const tracks = resolveEffect(
    effectOf(value, 'enter'),
    'enter',
    (name) => how(id, name),
    (name) => restOf(fields, name),
  );
  const taken = new Set<string>();

  Object.keys(tracks).forEach((name) => {
    if (isUIBinding(fields[name])) return;

    taken.add(name);
    animate(id, name, tracks[name].animation, tracks[name].from);
  });

  return taken;
}

function keepExit(id: number, value: unknown): void {
  rememberEntry(viewExits, id);

  if (value === null || value === undefined) {
    if (viewExits.delete(id)) sendProp(id, 'exit', null);

    return;
  }

  viewExits.set(id, effectOf(value, 'exit'));

  // The renderer holds the view only for a UI thread that will let it go.
  if (hasUIThread()) sendProp(id, 'exit', true);
}

/**
 * A removed view's exit plays on the UI thread, each prop from where it is,
 * then the UI thread tells the renderer to let the view go.
 */
function exitView(id: number): void {
  const effect = viewExits.get(id);

  if (!effect || !hasUIThread()) return;

  const fields = views.get(id)?.props ?? {};
  const motions = propMotions.get(id);
  const tracks = resolveEffect(
    effect,
    'exit',
    (name) => how(id, name),
    (name) => restOf(fields, name),
  );

  queueOperation({
    op: 'exit',
    view: id,
    tracks: Object.keys(tracks).map((name) => ({
      prop: name,
      from: encodeForUI(motions && own(motions, name) ? motions[name] : restOf(fields, name)),
      animation: encodeForUI(tracks[name].animation),
    })),
  });
}

/** A removed view exits; its prop motion values, transition and exit go with it. */
export function forgetAnimatedProps(id: number): void {
  exitView(id);

  const motions = propMotions.get(id);

  rememberEntry(propMotions, id);
  rememberEntry(viewTransitions, id);
  rememberEntry(viewExits, id);
  propMotions.delete(id);
  viewTransitions.delete(id);
  viewExits.delete(id);

  Object.keys(motions ?? {}).forEach((name) => freeMotion(motions?.[name]));
}

/** `layout`'s native spec: what the renderers' frame animators take, as its schema has it. */
function layoutSpec(value: unknown): PlainData {
  if (!isAnimation(value)) throw new TypeError('layout takes an animation: spring() or timing()');

  const spec = value.__kuitoAnimation;

  if (spec.type === 'timing')
    return { type: 'timing', duration: spec.duration, easing: spec.easing, delay: spec.delay };

  if (spec.type === 'spring' && spec.duration === undefined)
    return {
      type: 'spring',
      damping: spec.damping,
      stiffness: spec.stiffness,
      mass: spec.mass,
      delay: spec.delay,
    };

  throw new TypeError('layout takes timing() or a spring by damping and stiffness');
}

/**
 * A prop runs an animation on a motion value of its own, and nothing calls
 * back from there: a callback needs a motion value the app holds.
 */
export function assertPropAnimation(name: string, value: unknown): void {
  if (!isAnimatedValue(value) || own(KERNEL_PROPS, name)) return;

  if (own(value, 'onEnd')) throw new TypeError(name + ': onEnd needs a motion value');

  const spec = value.__kuitoAnimation;
  const type = isPlainData(spec) ? spec.type : null;

  if ((type === 'timing' || type === 'spring') && value.target === undefined)
    throw new TypeError(name + ': an animation needs a target: ' + String(type) + '().to(value)');
}

/** `animate`'s values: animatable props the view does not set itself, as plain values. */
export function assertAnimated(
  value: unknown,
  setBy: (name: string) => string | null,
  conflict: (name: string, other: string) => Error,
): void {
  if (!isPlainData(value)) throw new TypeError('animate takes an object of props');

  Object.keys(value).forEach((name) => {
    if (!own(ANIMATABLE_PROPS, name))
      throw new TypeError('animate ' + name + ': ' + name + ' does not animate');

    const other = setBy(name);

    if (other) throw conflict(name, other);

    const target = value[name];

    if (typeof target !== 'number' && typeof target !== 'string')
      throw new TypeError('animate ' + name + ' takes a value; say how it moves in transition');
  });
}
