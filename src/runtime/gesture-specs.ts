/*
 * Gestures as values (docs/motion.md): pan(), tap(), longPress(), pinch(),
 * rotate(), fling() and touches() make plain data that names a native
 * recognizer, its config, the callbacks that need JavaScript and how the
 * motion values following it let go. race, together and orElse compose them.
 * The kernel sends a view's gestures to the native recognizers and their
 * callbacks and followers to wherever they can run. Imports only
 * animation-specs.ts, so tests and every bundle share it.
 *
 * The native config keys and the composition rules are React Native Gesture
 * Handler's (https://github.com/software-mansion/react-native-gesture-handler,
 * src/handlers/gestures), MIT License, Copyright (c) 2016 Software Mansion.
 */
import { isAnimation, type Animation } from './animation-specs';

/** RNGH's gesture states. */
export const State = Object.freeze({
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
});

/** The native recognizers. */
export type GestureType = 'pan' | 'tap' | 'longPress' | 'pinch' | 'rotation' | 'fling';

/** What a gesture is to the app: `touches` is a pan from the first touch. */
export type GestureKind = GestureType | 'touches';

/** What every gesture event carries. */
export interface GestureEvent {
  state: number;
  numberOfPointers: number;
  pointerType: number;
}

interface PositionEvent extends GestureEvent {
  x: number;
  y: number;
  absoluteX: number;
  absoluteY: number;
}

export interface PanEvent extends PositionEvent {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
}

export interface PanChangeEvent extends PanEvent {
  changeX: number;
  changeY: number;
}

export type TapEvent = PositionEvent;

export interface LongPressEvent extends PositionEvent {
  duration: number;
}

export interface PinchEvent extends GestureEvent {
  scale: number;
  focalX: number;
  focalY: number;
  velocity: number;
}

export interface PinchChangeEvent extends PinchEvent {
  scaleChange: number;
}

export interface RotationEvent extends GestureEvent {
  /** Degrees, as the rotate prop takes them. */
  rotation: number;
  anchorX: number;
  anchorY: number;
  velocity: number;
}

export interface RotationChangeEvent extends RotationEvent {
  rotationChange: number;
}

export type FlingEvent = PositionEvent;

export type HitArea =
  | number
  | Partial<
      Record<
        'left' | 'top' | 'right' | 'bottom' | 'width' | 'height' | 'horizontal' | 'vertical',
        number
      >
    >;

/** Callbacks for what needs JavaScript; the compiler places each one. */
export interface Callbacks<Event, Change> {
  /** It activated. */
  onStart?: (event: Event) => void;
  /** It moved, with the change since the last move. */
  onChange?: (event: Change) => void;
  /** It ended after activating: `success` is false when it was cancelled. */
  onEnd?: (event: Event, success: boolean) => void;
}

interface Common {
  /** Ignores touches, like a disabled `Pressable`. */
  disabled?: boolean;
  /** Insets of the area that takes touches: one for every edge, or by edge. */
  hitArea?: HitArea;
}

export interface PanOptions extends Common, Callbacks<PanEvent, PanChangeEvent> {
  /** Only along one axis: it starts after 10 along it and fails after 10 across. */
  axis?: 'x' | 'y';
  /** How far it moves before it activates. */
  minDistance?: number;
}

export interface TapOptions extends Common, Callbacks<TapEvent, TapEvent> {
  /** Taps in a row: 2 for a double tap. */
  count?: number;
  maxDuration?: number;
  maxDistance?: number;
}

export interface LongPressOptions extends Common, Callbacks<LongPressEvent, LongPressEvent> {
  /** Milliseconds held before it activates; 500 by default. */
  after?: number;
  maxDistance?: number;
}

export type PinchOptions = Common & Callbacks<PinchEvent, PinchChangeEvent>;

export type RotateOptions = Common & Callbacks<RotationEvent, RotationChangeEvent>;

export type FlingDirection = 'left' | 'right' | 'up' | 'down';

export interface FlingOptions extends Common, Callbacks<FlingEvent, FlingEvent> {
  /** Where it may go; right by default. */
  direction?: FlingDirection | readonly FlingDirection[];
}

export type TouchesOptions = Common & Callbacks<PanEvent, PanChangeEvent>;

/** A value a gesture moves, which a motion value follows: `drag.x`. */
export interface GestureSource {
  readonly __kuitoSource: { gesture: Gesture; field: string };
}

/** A gesture's data; the kernel reads it, apps compose and attach it. */
export interface Gesture {
  readonly __kuitoGesture: 'gesture';
  readonly type: GestureType;
  readonly kind: GestureKind;
  readonly config: Readonly<Record<string, unknown>>;
  readonly callbacks: Readonly<Callbacks<never, never>>;
  /** How the motion values following it let go when it ends. */
  readonly releasing?: Animation<unknown>;
  /**
   * The same gesture, letting go with `animation`: each follower runs it with
   * the gesture's velocity, toward its own home (its first value) unless the
   * animation names a target.
   */
  release(animation: Animation<unknown>): this;
  /** 1 while it is active, 0 otherwise. */
  readonly active: GestureSource;
}

export interface PanGesture extends Gesture {
  /** Its translation, added to where the follower was when it activated. */
  readonly x: GestureSource;
  readonly y: GestureSource;
}

export interface TouchesGesture extends Gesture {
  /** Where the finger is in the view. */
  readonly x: GestureSource;
  readonly y: GestureSource;
}

export interface PinchGesture extends Gesture {
  /** Its scale, multiplying what the follower was when it activated. */
  readonly scale: GestureSource;
}

export interface RotateGesture extends Gesture {
  /** Its rotation in degrees, added to where the follower was. */
  readonly rotation: GestureSource;
}

export interface ComposedGesture {
  readonly __kuitoGesture: 'composed';
  readonly mode: 'race' | 'simultaneous' | 'exclusive';
  readonly gestures: readonly Composable[];
}

export type Composable = Gesture | ComposedGesture;

/** The fields each kind moves, besides `active`. */
const FIELDS: Readonly<Record<GestureKind, readonly string[]>> = {
  pan: ['x', 'y'],
  touches: ['x', 'y'],
  pinch: ['scale'],
  rotation: ['rotation'],
  tap: [],
  longPress: [],
  fling: [],
};

/** The distance a pan moves along its axis before it activates, or across it before it fails. */
const AXIS_SLOP = 10;

const DIRECTIONS: Readonly<Record<FlingDirection, number>> = { right: 1, left: 2, up: 4, down: 8 };

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !isFinite(value))
    throw new TypeError(name + ' must be a number');

  return value;
}

type Config = Record<string, unknown>;

/** Each option: the native config keys it sets. */
type Option = (value: unknown, name: string, config: Config) => void;

const number =
  (key: string): Option =>
  (value, name, config) => {
    config[key] = finite(value, name);
  };

const COMMON: Readonly<Record<string, Option>> = {
  disabled(value, name, config) {
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be a boolean');

    config.enabled = !value;
  },
  hitArea(value, name, config) {
    if (typeof value !== 'number' && (typeof value !== 'object' || value === null))
      throw new TypeError(name + ' takes a number or an object of insets');

    config.hitSlop = value;
  },
};

const OPTIONS: Readonly<Record<GestureKind, Readonly<Record<string, Option>>>> = {
  pan: {
    axis(value, name, config) {
      if (value !== 'x' && value !== 'y') throw new TypeError(name + " must be 'x' or 'y'");

      const [along, across] = value === 'x' ? ['X', 'Y'] : ['Y', 'X'];

      Object.assign(config, {
        ['activeOffset' + along + 'Start']: -AXIS_SLOP,
        ['activeOffset' + along + 'End']: AXIS_SLOP,
        ['failOffset' + across + 'Start']: -AXIS_SLOP,
        ['failOffset' + across + 'End']: AXIS_SLOP,
      });
    },
    minDistance: number('minDist'),
  },
  touches: {},
  tap: {
    count: number('numberOfTaps'),
    maxDuration: number('maxDurationMs'),
    maxDistance: number('maxDist'),
  },
  longPress: { after: number('minDurationMs'), maxDistance: number('maxDist') },
  pinch: {},
  rotation: {},
  fling: {
    direction(value, name, config) {
      const directions: unknown[] = Array.isArray(value) ? value : [value];

      config.direction = directions.reduce<number>((mask, direction) => {
        const bit =
          typeof direction === 'string' && direction in DIRECTIONS
            ? DIRECTIONS[direction as FlingDirection]
            : 0;

        if (!bit) throw new TypeError(name + " takes 'left', 'right', 'up' or 'down'");

        return mask | bit;
      }, 0);
    },
  },
};

const CALLBACKS = ['onStart', 'onChange', 'onEnd'] as const;

/** How kinds are named in errors. */
const NAMES: Readonly<Record<GestureKind, string>> = {
  pan: 'pan',
  touches: 'touches',
  tap: 'tap',
  longPress: 'longPress',
  pinch: 'pinch',
  rotation: 'rotate',
  fling: 'fling',
};

/** The type, the config its options set and its callbacks, as the kernel reads them. */
function gestureData(kind: GestureKind, options: object): Omit<Gesture, 'release' | 'active'> {
  const config: Config = kind === 'touches' ? { minDist: 0 } : {};
  const callbacks: Record<string, unknown> = {};
  const own = OPTIONS[kind];

  Object.entries(options).forEach(([key, value]) => {
    const where = NAMES[kind] + ' ' + key;

    if (value === undefined) return;

    if ((CALLBACKS as readonly string[]).includes(key)) {
      if (typeof value !== 'function') throw new TypeError(where + ' must be a function');

      // Kept as given: the kernel finds its UI-thread copy by identity.
      callbacks[key] = value;

      return;
    }

    const option = Object.prototype.hasOwnProperty.call(own, key) ? own[key] : COMMON[key];

    if (!option) throw new TypeError(NAMES[kind] + ' takes no option ' + key);

    option(value, where, config);
  });

  return {
    __kuitoGesture: 'gesture',
    type: kind === 'touches' ? 'pan' : kind,
    kind,
    config,
    callbacks,
  };
}

/**
 * The gesture value: its data, with `release` and its sources beside it,
 * not enumerable, so it stays plain data on the wire.
 */
function makeGesture<G extends Gesture>(
  data: Omit<Gesture, 'release' | 'active'>,
  releasing?: Animation<unknown>,
): G {
  const made: Record<string, unknown> = { ...data, ...(releasing && { releasing }) };
  const source = (field: string) => ({ __kuitoSource: { gesture: made, field } });

  Object.defineProperty(made, 'release', {
    value: (animation: unknown) => {
      if (!isAnimation(animation))
        throw new TypeError('release takes an animation: spring(), decay(), timing()');

      return makeGesture({ ...data }, animation);
    },
    enumerable: false,
  });

  FIELDS[data.kind]
    .concat(['active'])
    .forEach((field) =>
      Object.defineProperty(made, field, { get: () => source(field), enumerable: false }),
    );

  return made as never;
}

const create =
  <G extends Gesture, O extends object>(kind: GestureKind) =>
  (options?: O): G =>
    makeGesture(gestureData(kind, options ?? {}));

/** A drag; `axis` keeps it to one direction. */
export const pan = create<PanGesture, PanOptions>('pan');
/** One tap, or `count` in a row. */
export const tap = create<Gesture, TapOptions>('tap');
/** A press held for `after` milliseconds. */
export const longPress = create<Gesture, LongPressOptions>('longPress');
/** Two fingers apart or together: `scale`. */
export const pinch = create<PinchGesture, PinchOptions>('pinch');
/** Two fingers turning: `rotation`, in degrees. */
export const rotate = create<RotateGesture, RotateOptions>('rotation');
/** A quick swipe in a direction. */
export const fling = create<Gesture, FlingOptions>('fling');
/** Raw touches: where the first finger is (`x`, `y`) from the moment it lands. */
export const touches = create<TouchesGesture, TouchesOptions>('touches');

export function isGesture(value: unknown): value is Composable {
  return typeof value === 'object' && value !== null && '__kuitoGesture' in value;
}

export function isGestureSource(value: unknown): value is GestureSource {
  return typeof value === 'object' && value !== null && '__kuitoSource' in value;
}

function compose(name: string, mode: ComposedGesture['mode'], values: unknown[]): ComposedGesture {
  if (!values.length || !values.every(isGesture)) throw new TypeError(name + ' takes gestures');

  return { __kuitoGesture: 'composed', mode, gestures: values };
}

/** The first to activate wins; the others fail. */
export const race = (...gestures: Composable[]): ComposedGesture =>
  compose('race', 'race', gestures);

/** All may be active at once: pinch and rotate a photo together. */
export const together = (...gestures: Composable[]): ComposedGesture =>
  compose('together', 'simultaneous', gestures);

/**
 * Each in turn: a gesture waits for the ones before it to fail, so
 * `orElse(tap({ count: 2 }), tap())` is a double tap, or else a tap. (Not
 * `then`: a module exporting `then` is a thenable, which `import()` calls.)
 */
export const orElse = (...gestures: Composable[]): ComposedGesture =>
  compose('orElse', 'exclusive', gestures);

function leaves(gesture: Composable): Gesture[] {
  return gesture.__kuitoGesture === 'gesture' ? [gesture] : gesture.gestures.flatMap(leaves);
}

/** One gesture of a view, with its relations as tags: what the native side takes. */
export interface PreparedGesture {
  gesture: Gesture;
  tag: number;
  type: GestureType;
  config: Record<string, unknown>;
  waitFor: number[];
  simultaneousHandlers: number[];
  blocksHandlers: number[];
}

/**
 * Composition as RNGH's ComposedGesture.prepare: together makes each gesture
 * simultaneous with its siblings', orElse makes each wait for the ones before
 * it, race adds nothing.
 */
export function prepareGestures(
  root: Composable,
  tag: (gesture: Gesture) => number,
): PreparedGesture[] {
  const prepared: PreparedGesture[] = [];
  const tags = (list: Gesture[]) =>
    list.map(tag).filter((value, index, all) => all.indexOf(value) === index);

  function prepare(gesture: Composable, simultaneous: Gesture[], requireToFail: Gesture[]): void {
    if (gesture.__kuitoGesture === 'gesture') {
      prepared.push({
        gesture,
        tag: tag(gesture),
        type: gesture.type,
        config: { ...gesture.config },
        waitFor: tags(requireToFail),
        simultaneousHandlers: tags(simultaneous),
        blocksHandlers: [],
      });

      return;
    }

    const children = gesture.gestures;

    if (gesture.mode === 'simultaneous') {
      children.forEach((child) =>
        prepare(child, children.filter((other) => other !== child).flatMap(leaves), requireToFail),
      );
    } else if (gesture.mode === 'exclusive') {
      let before: Gesture[] = [];

      children.forEach((child) => {
        prepare(child, simultaneous, requireToFail.concat(before));
        // Every group gets to wait for all groups before it.
        before = before.concat(leaves(child));
      });
    } else {
      children.forEach((child) => prepare(child, simultaneous, requireToFail));
    }
  }

  prepare(root, [], []);

  return prepared;
}
