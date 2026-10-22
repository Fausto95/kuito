import type {
  AccessibilityActionPayload,
  ErrorPayload,
  ImageSizePayload,
  IndexPayload,
  ScrollPayload,
  TextPayload,
  TouchPayload,
  ValuePayload,
} from './props.generated';

/** Fields every native event carries. */
export interface KuitoEvent<Type extends string = string> {
  type: Type;
  target: unknown;
  isTrusted: boolean;
}

/** Where a touch landed: in the view (location) and on screen (page), in points. */
export interface TouchLocation extends TouchPayload {}

export interface PressEvent extends KuitoEvent<'press'>, Partial<TouchLocation> {
  bubbles: boolean;
  cancelable: boolean;
  stopPropagation(): void;
  preventDefault(): void;
}

/** Press-in, press-out and long press from a Pressable. */
export interface PressPhaseEvent
  extends KuitoEvent<'pressin' | 'pressout' | 'longpress'>, TouchLocation {}

export interface TextChangeEvent extends KuitoEvent<'change'>, TextPayload {}

export interface SubmitEvent extends KuitoEvent<'submit'>, TextPayload {}

export interface ValueChangeEvent extends KuitoEvent<'change'>, ValuePayload {}

export type FocusEvent = KuitoEvent<'focus' | 'blur'>;

/** The snap point a sheet settled at, by index into its snapPoints. */
export interface SnapEvent extends KuitoEvent<'snap'>, IndexPayload {}

/** Scroll position and sizes, in points. */
export interface ScrollEvent extends KuitoEvent<'scroll'>, ScrollPayload {}

/** Where a scroll view came to rest, as `scroll` reports where it is. */
export interface ScrollEndEvent extends KuitoEvent<'scrollend'>, ScrollPayload {}

/** The loaded image's size, in points. */
export interface ImageLoadEvent extends KuitoEvent<'load'>, ImageSizePayload {}

export interface ImageErrorEvent extends KuitoEvent<'error'>, ErrorPayload {}

/** A screen reader user performed one of the view's `actions`. */
export interface AccessibilityActionEvent
  extends KuitoEvent<'accessibilityaction'>, AccessibilityActionPayload {}
