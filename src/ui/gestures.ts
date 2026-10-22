/**
 * Gestures as values (docs/motion.md): recognized natively by ports of React
 * Native Gesture Handler's recognizers, followed by motion values on the UI
 * thread with no code of the app's.
 *
 *   const drag = pan({ axis: 'x' }).release(spring());
 *   const x = motion(0).follows(drag.x);
 *   <Box translateX={x} gestures={[drag]} />
 */
import type { Composable } from '../runtime/gesture-specs';

export {
  fling,
  longPress,
  pan,
  pinch,
  orElse,
  race,
  rotate,
  tap,
  together,
  touches,
} from '../runtime/gesture-specs';

export type {
  Callbacks,
  Composable,
  ComposedGesture,
  FlingDirection,
  FlingEvent,
  FlingOptions,
  Gesture,
  GestureEvent,
  GestureSource,
  HitArea,
  LongPressEvent,
  LongPressOptions,
  PanChangeEvent,
  PanEvent,
  PanGesture,
  PanOptions,
  PinchChangeEvent,
  PinchEvent,
  PinchGesture,
  PinchOptions,
  RotateGesture,
  RotateOptions,
  RotationChangeEvent,
  RotationEvent,
  TapEvent,
  TapOptions,
  TouchesGesture,
  TouchesOptions,
} from '../runtime/gesture-specs';

/** What a view's `gestures` prop takes. */
export interface GestureProps {
  /** The view's gestures; several race unless composed with together or orElse. */
  gestures?: readonly Composable[];
}
