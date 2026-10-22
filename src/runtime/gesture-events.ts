/*
 * From native gesture events to callbacks and followers: a state change to
 * ACTIVE calls onStart and starts each follower from where it is; an update
 * moves the followers and calls onChange with the change since the last
 * update; a change from ACTIVE to END, FAILED or CANCELLED calls onEnd and
 * lets the followers go with the gesture's release. Runs on the UI thread,
 * or on the JS thread when there is no UI runtime. Rotation is in degrees.
 * Imports only animation-specs.ts.
 *
 * Ported from React Native Gesture Handler's useAnimatedGesture and the change
 * calculators of its pan, pinch and rotation gestures
 * (https://github.com/software-mansion/react-native-gesture-handler,
 * src/handlers/gestures), MIT License, Copyright (c) 2016 Software Mansion.
 */
import { makeAnimation, type AnimationSpec } from './animation-specs';

const BEGAN = 2;
const ACTIVE = 4;
const END = 5;
const FAILED = 1;
const CANCELLED = 3;

type Event = Record<string, unknown>;

type Callback = (...args: never[]) => unknown;

/** A motion value following one of a gesture's fields, on the thread that dispatches. */
export interface Follower {
  /** The motion value itself: followers are made again for each event. */
  key: object;
  field: string;
  /** Where it goes back to when the release names no target: its first value. */
  home: unknown;
  read(): unknown;
  /** Stops its animation where it is: the finger has it now. */
  stop(): void;
  /** Moves it now, stopping its animation. */
  write(value: unknown): void;
  animate(animation: unknown): void;
}

export interface DispatchedGesture {
  tag: number;
  type: string;
  kind: string;
  /** The gesture's id, which its followers name. */
  gesture: number;
  callbacks: Partial<Record<'onStart' | 'onChange' | 'onEnd', Callback>>;
  /** How followers let go, as animation data. */
  releasing?: unknown;
}

const number = (event: Event | undefined, key: string): number => {
  const value = event ? event[key] : undefined;

  return typeof value === 'number' ? value : 0;
};

const DEGREES = 180 / Math.PI;

/** Rotation in degrees, as Kuito's rotate prop takes it; RNGH reports radians. */
const NORMALIZE: Readonly<Record<string, (event: Event) => Event>> = {
  rotation: (event) =>
    Object.assign({}, event, {
      rotation: number(event, 'rotation') * DEGREES,
      velocity: number(event, 'velocity') * DEGREES,
    }),
};

/** The change since the last update; the first update's change is its value. */
const CHANGES: Readonly<Record<string, (current: Event, previous: Event | undefined) => Event>> = {
  pan: (current, previous) => ({
    changeX: number(current, 'translationX') - number(previous, 'translationX'),
    changeY: number(current, 'translationY') - number(previous, 'translationY'),
  }),
  pinch: (current, previous) => ({
    scaleChange: previous
      ? number(current, 'scale') / number(previous, 'scale')
      : number(current, 'scale'),
  }),
  rotation: (current, previous) => ({
    rotationChange: number(current, 'rotation') - number(previous, 'rotation'),
  }),
};

/** How a field moves its follower: from the event key, combined with where it started. */
interface Field {
  event: string;
  velocity?: string;
  combine: 'add' | 'multiply' | 'set';
}

const FIELDS: Readonly<Record<string, Readonly<Record<string, Field>>>> = {
  pan: {
    x: { event: 'translationX', velocity: 'velocityX', combine: 'add' },
    y: { event: 'translationY', velocity: 'velocityY', combine: 'add' },
  },
  touches: {
    x: { event: 'x', velocity: 'velocityX', combine: 'set' },
    y: { event: 'y', velocity: 'velocityY', combine: 'set' },
  },
  pinch: { scale: { event: 'scale', velocity: 'velocity', combine: 'multiply' } },
  rotation: { rotation: { event: 'rotation', velocity: 'velocity', combine: 'add' } },
};

const COMBINE: Readonly<Record<Field['combine'], (start: number, moved: number) => number>> = {
  add: (start, moved) => start + moved,
  multiply: (start, moved) => start * moved,
  set: (_start, moved) => moved,
};

function call(callback: Callback | undefined, ...args: unknown[]): void {
  if (callback) Reflect.apply(callback, undefined, args);
}

/**
 * The release for one follower: the gesture's velocity in the follower's
 * units for a spring or decay that names none, and the follower's home for a
 * timing or spring that names no target.
 */
function release(releasing: unknown, field: Field, start: number, event: Event, home: unknown) {
  if (typeof releasing !== 'object' || releasing === null || !('__kuitoAnimation' in releasing))
    return null;

  const animation = releasing as { __kuitoAnimation: AnimationSpec; target?: unknown };
  const spec = animation.__kuitoAnimation;
  const velocity = field.velocity ? number(event, field.velocity) : 0;
  const scaled = field.combine === 'multiply' ? velocity * start : velocity;
  const moving =
    (spec.type === 'spring' || spec.type === 'decay') && !spec.velocity
      ? { ...spec, velocity: scaled }
      : spec;
  const homing = spec.type === 'timing' || spec.type === 'spring';

  return makeAnimation(moving, animation.target === undefined && homing ? home : animation.target);
}

/** A dispatcher for one view's gestures: give it every `gesture` event. */
export function createGestureDispatcher(
  gestures: DispatchedGesture[],
  followers: (gesture: number) => Follower[],
): (event: Event) => void {
  const lastUpdate: Record<number, Event | undefined> = {};
  /** Where each follower was when its gesture activated, by its motion value. */
  const starts = new Map<object, number>();

  const start = (gesture: DispatchedGesture) =>
    followers(gesture.gesture).forEach((follower) => {
      if (follower.field === 'active') return follower.write(1);

      follower.stop();
      starts.set(follower.key, Number(follower.read()));
    });

  const move = (gesture: DispatchedGesture, event: Event) =>
    followers(gesture.gesture).forEach((follower) => {
      const field = FIELDS[gesture.kind]?.[follower.field];
      const from = starts.get(follower.key);

      if (!field || from === undefined) return;

      follower.write(COMBINE[field.combine](from, number(event, field.event)));
    });

  const end = (gesture: DispatchedGesture, event: Event) =>
    followers(gesture.gesture).forEach((follower) => {
      if (follower.field === 'active') return follower.write(0);

      const field = FIELDS[gesture.kind]?.[follower.field];
      const from = starts.get(follower.key);

      starts.delete(follower.key);

      if (!field || from === undefined) return;

      const animation = release(gesture.releasing, field, from, event, follower.home);

      if (animation) follower.animate(animation);
    });

  return (raw) => {
    gestures.forEach((gesture) => {
      if (raw.handlerTag !== gesture.tag) return;

      const normalize = NORMALIZE[gesture.type];
      const event = normalize ? normalize(raw) : raw;
      const { callbacks } = gesture;
      const state = event.state;
      const oldState = event.oldState;

      if (oldState !== undefined && oldState !== null) {
        if (state === ACTIVE && oldState !== ACTIVE) {
          lastUpdate[gesture.tag] = undefined;
          start(gesture);
          call(callbacks.onStart, event);
        } else if (
          oldState === ACTIVE &&
          (state === END || state === FAILED || state === CANCELLED)
        ) {
          end(gesture, event);
          call(callbacks.onEnd, event, state === END);
        }

        return;
      }

      if (state !== ACTIVE && state !== BEGAN) return;

      move(gesture, event);

      const change = CHANGES[gesture.type];

      if (callbacks.onChange) {
        call(
          callbacks.onChange,
          change ? Object.assign({}, event, change(event, lastUpdate[gesture.tag])) : event,
        );

        lastUpdate[gesture.tag] = event;
      }
    });
  };
}
