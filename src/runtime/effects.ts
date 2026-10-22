/*
 * Effects: what a view's props do as it enters or leaves (docs/motion.md).
 * `fade`, `slide.up(12)` and `zoom()` name the props and the values a view
 * enters from and leaves to; `keyframes` names stops. How each prop moves
 * comes from the view's `transition`, so effects compose in time (and,
 * parallel, stagger, sequence, delay) without knowing their curves until the
 * kernel resolves them for a view. Imports only animation-specs.ts: app code
 * and the kernel build the same data.
 */
import {
  durationOf,
  makeAnimation,
  sequenceAnimations,
  type Animation,
  type AnimationSpec,
} from './animation-specs';

type Scalar = number | string;

/** One prop of an effect. */
export interface Track {
  prop: string;
  /** Where it enters from and leaves to. */
  enter?: Scalar;
  exit?: Scalar;
  /** Or its own keyframes, the same both ways. */
  frames?: Animation<Scalar>;
}

export type EffectNode =
  | { type: 'tracks'; name: string; tracks: Track[] }
  | { type: 'parallel'; effects: EffectNode[] }
  | { type: 'sequence'; effects: EffectNode[] }
  | { type: 'stagger'; each: number; effects: EffectNode[] }
  | { type: 'delay'; ms: number; effect: EffectNode };

/** What enter and exit take. */
export interface Effect {
  readonly __kuitoEffect: EffectNode;
  /** This effect and `other` at once. */
  and(other: Effect): Effect;
}

export function isEffect(value: unknown): value is Effect {
  return typeof value === 'object' && value !== null && '__kuitoEffect' in value;
}

/** An effect's data, with `and` beside it, not enumerable: it stays plain data. */
export function makeEffect(node: EffectNode): Effect {
  const made = { __kuitoEffect: node };

  Object.defineProperty(made, 'and', {
    value: (other: unknown) => parallelEffects([made as Effect, effectOf(other, 'and')]),
    enumerable: false,
  });

  return made as Effect;
}

function effectOf(value: unknown, where: string): Effect {
  if (!isEffect(value)) throw new TypeError(where + ' takes effects');

  return value;
}

function leaves(node: EffectNode): Array<Extract<EffectNode, { type: 'tracks' }>> {
  switch (node.type) {
    case 'tracks':
      return [node];
    case 'delay':
      return leaves(node.effect);
    case 'parallel':
    case 'sequence':
    case 'stagger':
      return node.effects.flatMap(leaves);
  }
}

/** Effects at once; two that move one prop at once are an error. */
export function parallelEffects(effects: Effect[]): Effect {
  const movedBy = new Map<string, string>();

  effects.forEach((effect) =>
    leaves(effect.__kuitoEffect).forEach((leaf) =>
      leaf.tracks.forEach(({ prop }) => {
        const other = movedBy.get(prop);

        if (other) throw new TypeError(other + ' and ' + leaf.name + ' both move ' + prop);

        movedBy.set(prop, leaf.name);
      }),
    ),
  );

  return makeEffect({ type: 'parallel', effects: effects.map((each) => each.__kuitoEffect) });
}

export function sequenceEffects(effects: Effect[]): Effect {
  return makeEffect({ type: 'sequence', effects: effects.map((each) => each.__kuitoEffect) });
}

export function staggerEffects(each: number, effects: Effect[]): Effect {
  return makeEffect({ type: 'stagger', each, effects: effects.map((one) => one.__kuitoEffect) });
}

export function delayEffect(ms: number, effect: Effect): Effect {
  return makeEffect({ type: 'delay', ms, effect: effect.__kuitoEffect });
}

function tracks(name: string, list: Track[]): Effect {
  return makeEffect({ type: 'tracks', name, tracks: list });
}

function distance(value: unknown): number {
  if (typeof value !== 'number' || !(value >= 0))
    throw new TypeError('slide distance must be a non-negative number');

  return value;
}

/** Enters from transparent, leaves to transparent. */
export const fade: Effect = tracks('fade', [{ prop: 'opacity', enter: 0, exit: 0 }]);

/**
 * Moves by `distance` (24 by default) in its direction: `slide.up(12)` enters
 * rising 12 into place and leaves rising 12 away.
 */
export const slide = Object.freeze({
  up: (by: number = 24): Effect =>
    tracks('slide', [{ prop: 'translateY', enter: distance(by), exit: -by }]),
  down: (by: number = 24): Effect =>
    tracks('slide', [{ prop: 'translateY', enter: -distance(by), exit: by }]),
  left: (by: number = 24): Effect =>
    tracks('slide', [{ prop: 'translateX', enter: distance(by), exit: -by }]),
  right: (by: number = 24): Effect =>
    tracks('slide', [{ prop: 'translateX', enter: -distance(by), exit: by }]),
});

/** Grows from `scale` (0.85 by default) as it enters, shrinks to it as it leaves. */
export function zoom(scale: number = 0.85): Effect {
  if (typeof scale !== 'number' || !(scale >= 0))
    throw new TypeError('zoom scale must be a non-negative number');

  return tracks('zoom', [{ prop: 'scale', enter: scale, exit: scale }]);
}

/** Props through keyframes: one track per prop, each with its own stops. */
export function keyframesEffect(frames: Record<string, Animation<Scalar>>): Effect {
  return tracks(
    'keyframes',
    Object.keys(frames).map((prop) => ({ prop, frames: frames[prop] })),
  );
}

export type Phase = 'enter' | 'exit';

/** A prop's part of an effect, resolved for a view. */
export interface ResolvedTrack {
  /** Where it starts when entering; leaving starts where it is. */
  from?: Scalar;
  animation: Animation<Scalar>;
}

interface Segment {
  start: number;
  from?: Scalar;
  animation: Animation<Scalar>;
}

/**
 * The effect as one animation per prop, for a view: `how` is the view's
 * transition for a prop, `rest` the value a prop shows when the view is in
 * place. Effects one after another start when the last one's longest
 * animation ends.
 */
export function resolveEffect(
  effect: Effect,
  phase: Phase,
  how: (prop: string) => AnimationSpec,
  rest: (prop: string) => Scalar,
): Record<string, ResolvedTrack> {
  const segments = new Map<string, Segment[]>();

  const place = (node: EffectNode, start: number): number => {
    switch (node.type) {
      case 'tracks':
        return node.tracks.reduce((end, track) => {
          const segment = trackSegment(track, start);
          const list = segments.get(track.prop) ?? [];

          list.push(segment);
          segments.set(track.prop, list);

          return Math.max(end, start + durationOf(segment.animation.__kuitoAnimation));
        }, start);
      case 'delay':
        return place(node.effect, start + node.ms);
      case 'parallel':
        return node.effects.reduce((end, each) => Math.max(end, place(each, start)), start);
      case 'stagger':
        return node.effects.reduce(
          (end, each, index) => Math.max(end, place(each, start + index * node.each)),
          start,
        );
      case 'sequence':
        return node.effects.reduce((at, each) => place(each, at), start);
    }
  };

  const trackSegment = (track: Track, start: number): Segment => {
    if (track.frames) {
      const first = track.frames.__kuitoAnimation;
      const stops = first.type === 'sequence' ? first.steps : [];

      return {
        start,
        from: phase === 'enter' ? (stops[0]?.target as Scalar | undefined) : undefined,
        animation: track.frames,
      };
    }

    const target = phase === 'enter' ? rest(track.prop) : track.exit;

    if (target === undefined) throw new TypeError(track.prop + ' has nowhere to ' + phase);

    return {
      start,
      from: phase === 'enter' ? track.enter : undefined,
      animation: makeAnimation(how(track.prop), target),
    };
  };

  place(effect.__kuitoEffect, 0);

  const resolved: Record<string, ResolvedTrack> = {};

  segments.forEach((list, prop) => {
    const ordered = list.slice().sort((a, b) => a.start - b.start);
    const steps = ordered.map((segment, index) => {
      const previous = ordered[index - 1];
      const ready = previous ? previous.start + durationOf(previous.animation.__kuitoAnimation) : 0;

      return withDelay(segment.animation, Math.max(0, segment.start - ready));
    });
    const [first] = ordered;

    resolved[prop] = {
      ...(first.from !== undefined && { from: first.from }),
      animation: steps.length === 1 ? steps[0] : sequenceAnimations(steps),
    };
  });

  return resolved;
}

function withDelay(animation: Animation<Scalar>, ms: number): Animation<Scalar> {
  const spec = animation.__kuitoAnimation;

  return ms
    ? makeAnimation({ ...spec, delay: spec.delay + ms }, animation.target, animation.onEnd)
    : animation;
}
