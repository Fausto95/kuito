/** Kuito primitives; compiler emits platform-neutral native view descriptions. */
import type {
  AccessibilityActionEvent,
  FocusEvent,
  PressEvent,
  PressPhaseEvent,
  ScrollEndEvent,
  ScrollEvent,
  SnapEvent,
  ImageErrorEvent,
  ImageLoadEvent,
  SubmitEvent,
  KuitoEvent,
} from './events';
import type { Animation } from './animations';
import type { Derived, Motion, ScrollMotion, SheetMotion } from './motion';
import type { ReadonlySignal, Signal } from './reactivity';
import type { GestureProps } from './gestures';
import { primitive, type ElementAttributes, type TextContent, type KuitoNode } from './jsx';
import type { ElementRef, ElementHandle, ScrollHandle } from './refs';
import type {
  AccessibilityNativeProps,
  SpinnerNativeProps,
  SheetNativeProps,
  ButtonNativeProps,
  CommonNativeProps,
  ContainerNativeProps,
  ImageNativeProps,
  TextFieldNativeProps,
  LayoutProps,
  PressableNativeProps,
  SafeAreaNativeProps,
  ScrollNativeProps,
  ToggleNativeProps,
  SymbolNativeProps,
  TextNativeProps,
  TextSelection,
} from './props.generated';

export type {
  BundledImageSource,
  ImageSource,
  InputMode,
  LayoutProps,
  RemoteImageSource,
  SymbolWeight,
  TextSelection,
} from './props.generated';

/**
 * Lays its children out in a column, top to bottom, with CSS flexbox's props: `gap`,
 * `alignItems`, `justifyContent`, `padding`.
 */
export const VStack = primitive<VStackProps>('VStack');
/**
 * A container that responds to touches: presses, long presses, and feedback
 * (opacity, scale, haptics) that runs natively on touch-down.
 */
export const Pressable = primitive<PressableProps>('Pressable');
/**
 * A VStack padded clear of what the system draws over it: the status bar, the
 * notch, the home indicator, the navigation bar.
 */
export const SafeArea = primitive<SafeAreaProps>('SafeArea');
/** A native bottom sheet presenting its children above the screen while `open` is true. */
export const Sheet = primitive<SheetProps>('Sheet');
/**
 * Lays its children out in a row, with CSS flexbox's props. In a right-to-left
 * language the row runs right to left.
 */
export const HStack = primitive<HStackProps>('HStack');
/**
 * A container laid out like a VStack, for a surface more than a stack: a card, a
 * swatch, a progress bar's track.
 */
export const Box = primitive<BoxProps>('Box');
/** A view that scrolls its content, vertically or, with `horizontal`, sideways. */
export const Scroll = primitive<ScrollProps>('Scroll');
/**
 * Shows a string, wrapped over as many lines as it needs unless `lineClamp`
 * cuts it, at the user's text size. Its children are text only: strings, numbers, or signals of them.
 */
export const Text = primitive<TextProps>('Text');
/**
 * The platform's own button, titled by its children: UIButton on iOS,
 * android.widget.Button on Android.
 */
export const Button = primitive<ButtonProps>('Button');
/** A native text input. Given a signal as `value`, it writes what the user types. */
export const TextField = primitive<TextFieldProps>('TextField');
/**
 * Shows an image from a URL or bundled with the app, decoded off the main thread
 * for the size it is shown at, and cached in memory and on disk by default.
 */
export const Image = primitive<ImageProps>('Image');
/** The platform's own symbol: an SF Symbol on iOS, a Material Symbol on Android. */
export const Symbol = primitive<SymbolProps>('Symbol');
/**
 * An empty view that grows to take the free space along its stack, pushing what
 * follows it to the end.
 */
export const Spacer = primitive<SpacerProps>('Spacer');
/**
 * A thin line between views: at least 1 point tall, in the system's separator
 * color on iOS and light gray on Android.
 */
export const Divider = primitive<DividerProps>('Divider');
/**
 * An on/off switch: UISwitch on iOS, Switch on Android. Given a signal as
 * `checked`, it writes it as the user flips it.
 */
export const Toggle = primitive<ToggleProps>('Toggle');
/** The platform's indeterminate progress indicator, spinning while `animating` is true. */
export const Spinner = primitive<SpinnerProps>('Spinner');
/**
 * Groups children with no view of its own: they join its parent as if written
 * there. `<>…</>` is the same; write `Fragment` to give it a `key`.
 */
export const Fragment = primitive<FragmentProps>('Fragment');

export type Scalar = string | number | boolean | null;

/**
 * A prop's value: the value, or a signal it follows. JSX that reads a
 * signal, `opacity={level.value}`, follows it too: the compiler makes the
 * expression reactive. A function is never a value: in a prop it is a
 * handler, so derive a value with `computed(() => …)` instead.
 */
export type Prop<T> = T | ReadonlySignal<T>;

/**
 * A prop the view also changes itself, as the user types, toggles or
 * dismisses. Given a writable signal, the view writes it: no handler, and
 * nothing echoed back (docs/events.md#two-way-props). A value, or a
 * read-only signal, is shown one way.
 */
export type Bound<T> = T | Signal<T> | ReadonlySignal<T>;

/** A prop that may also animate: an animation to a value, or a motion value it follows on the UI thread. */
export type Animatable<T extends Scalar> = Prop<T> | Animation<T> | Motion<T> | Derived<T>;

/** Points, or a percentage of the containing block. */
export type LengthPercentage = number | `${number}%`;
export type LengthPercentageAuto = LengthPercentage | 'auto';
/** width, height and flex-basis: also auto and CSS's sizing keywords. */

export type SizeValue =
  | LengthPercentageAuto
  | 'min-content'
  | 'max-content'
  | 'fit-content'
  | `fit-content(${number})`
  | `fit-content(${number}%)`
  | 'stretch';

type Safe<K extends string> = K | `safe ${K}` | `unsafe ${K}`;

export type SelfAlignment = Safe<
  | 'normal'
  | 'start'
  | 'end'
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'baseline'
  | 'stretch'
  | 'self-start'
  | 'self-end'
>;

export type ContentAlignment = Safe<
  | 'normal'
  | 'start'
  | 'end'
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'stretch'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'
>;

/** ARIA's roles, which `role` takes; each maps to a VoiceOver trait and a TalkBack role. */
export type Role =
  | 'alert'
  | 'button'
  | 'checkbox'
  | 'combobox'
  | 'grid'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'none'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'scrollbar'
  | 'searchbox'
  | 'slider'
  | 'spinbutton'
  | 'summary'
  | 'switch'
  | 'tab'
  | 'tablist'
  | 'timer'
  | 'toolbar';

export type StandardAccessibilityAction =
  | 'activate'
  | 'increment'
  | 'decrement'
  | 'longpress'
  | 'magicTap'
  | 'escape';

export interface AccessibilityAction {
  /** A standard action, or a custom one that screen readers list by `label`. */
  name: StandardAccessibilityAction | (string & {});
  label?: string;
}

/**
 * One set of accessibility props, on every view and on both platforms:
 * `label`, `hint`, `role` (ARIA's names), `live`, `actions` and ARIA's
 * `aria-*` state and value facts (see docs/accessibility.md).
 */
export interface AccessibilityProps extends AccessibilityNativeProps {
  role?: Prop<Role>;
  /** The screen reader action taken, by `name`. */
  onAction?: (event: AccessibilityActionEvent) => void;
}

/** What `class` takes: names, or a list of them with falsy entries skipped. */
export type ClassNames =
  | string
  | false
  | null
  | undefined
  | { readonly [variant: string]: string | false | null | undefined }
  | readonly ClassNames[];

/** A style's declarations: CSS properties in camelCase, with CSS's values. */
export type StyleDeclarations = Record<string, string | number | boolean | null>;

/** Props every view takes; the native ones come from src/protocol/manifest.ts. */
export interface CommonProps
  extends ElementAttributes, LayoutProps, AccessibilityProps, GestureProps, CommonNativeProps {
  id?: string;
  ref?: ElementRef<ElementHandle>;
  /**
   * Class names from a .css import or styles(): a string, or a list with
   * falsy entries skipped, following the signals it reads.
   */
  class?: Prop<ClassNames>;
  /**
   * Styles of this view alone, compiled at build time: CSS properties in
   * camelCase. A value that changes must set a native prop (`opacity`).
   */
  style?: StyleDeclarations;
  onPress?: (event: PressEvent) => void;
  onPressCapture?: (event: PressEvent) => void;
}

export interface ContainerProps extends CommonProps, ContainerNativeProps {
  children?: KuitoNode;
}

/** Props of `VStack`: a container's layout, style and accessibility props. */
export interface VStackProps extends ContainerProps {}

/** A sheet height: points, a percentage of the screen (`'50%'`), or `'content'` to fit its children. */
export type SnapPoint = number | `${number}%` | 'content';

/**
 * A native bottom sheet (UISheetPresentationController on iOS, Material's
 * BottomSheetDialog on Android) presenting its children above the screen.
 * Controlled: `open` shows it, and only `open` does. When the user dismisses
 * it, `onClose` fires; set `open` back to false there.
 */
export interface SheetProps extends Omit<ContainerProps, 'borderRadius'>, SheetNativeProps {
  /** The user dismissed the sheet (swipe down, backdrop tap or back). */
  onClose?: (event: KuitoEvent<'close'>) => void;
  /** The sheet settled at another snap point. */
  onSnap?: (event: SnapEvent) => void;
  /** Moves with the sheet every frame on the UI thread: `sheetMotion()`, given to one sheet. */
  motion?: SheetMotion;
}

export type SafeAreaEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * A VStack padded by the part of the screen the system covers (status bar,
 * notch, home indicator, navigation bar), like react-native-safe-area-context:
 * only edges that overlap it get padded, and the inset adds to `padding`.
 */
export interface SafeAreaProps extends ContainerProps, SafeAreaNativeProps {}

/**
 * Props of `Pressable`, a view that reports presses, with feedback that runs
 * natively on touch-down instead of waiting for JavaScript: opacity, scale
 * and haptics. Its `onLongPress` is its own press event, not the long-press
 * gesture.
 */
export interface PressableProps extends Omit<ContainerProps, 'onLongPress'>, PressableNativeProps {
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressPhaseEvent) => void;
  onPressEnd?: (event: PressPhaseEvent) => void;
  onLongPress?: (event: PressPhaseEvent) => void;
}

/** Props of `HStack`: a container's layout, style and accessibility props. */
export interface HStackProps extends ContainerProps {}
/** Props of `Box`: a container's layout, style and accessibility props. */
export interface BoxProps extends ContainerProps {}

/** Props of `Scroll`. Its own `keyboard` options include the scroll view's. */
export interface ScrollProps extends Omit<ContainerProps, 'keyboard' | 'ref'>, ScrollNativeProps {
  /** Scrolls sideways; changing it remounts the view, as the native axis is fixed. */
  horizontal?: Prop<boolean>;
  ref?: ElementRef<ScrollHandle>;
  /** Moves with the view every frame on the UI thread: `scrollMotion()`, given to one view. */
  motion?: ScrollMotion;
  onScroll?: (event: ScrollEvent) => void;
  /** Where it came to rest: after a fling, a drag or a `scrollTo`, once per rest. */
  onScrollEnd?: (event: ScrollEndEvent) => void;
  /** Called once each time the content end comes within the threshold. */
  onReachEnd?: (event: KuitoEvent<'reachend'>) => void;
  /** Enables pull-to-refresh. */
  onRefresh?: (event: KuitoEvent<'refresh'>) => void;
}

/** Props of `Text`: every view's props, its font props, and the text as children. */
export interface TextProps extends CommonProps, TextNativeProps {
  children?: TextContent;
}

/** A native push button, titled by its children. */
export interface ButtonProps extends CommonProps, ButtonNativeProps {
  children?: TextContent;
}

/** Props of `TextField`, the native text input. */
export interface TextFieldProps extends CommonProps, TextFieldNativeProps {
  /**
   * The text the field shows for what the user typed: a card number's
   * groups, a date's slashes. The caret stays after the character it
   * followed. Runs on the UI thread, before the frame, when it can
   * (docs/keyboard.md#formatting).
   */
  format?: (text: string) => string;
  /** The text, as the user changes it. */
  onChange?: (text: string) => void;
  /** The selected range, as the user moves the caret or selects. */
  onSelectionChange?: (selection: TextSelection) => void;
  onSubmit?: (event: SubmitEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
}

/**
 * An image loaded from a URI, with built-in memory and disk caching, request
 * deduplication, a placeholder color and a fade-in transition.
 */
export interface ImageProps extends CommonProps, ImageNativeProps {
  onLoadStart?: (event: KuitoEvent<'loadstart'>) => void;
  onLoad?: (event: ImageLoadEvent) => void;
  onError?: (event: ImageErrorEvent) => void;
  onLoadEnd?: (event: KuitoEvent<'loadend'>) => void;
}

/**
 * A symbol name both platforms share, or each platform's own. The compiler
 * checks a literal name against both platforms' symbols (docs/assets.md#symbols).
 */
export type SymbolName = string | { ios: string; android: string };

/** Props of `Symbol`, the platform's symbol by name. */
export interface SymbolProps extends CommonProps, SymbolNativeProps {}

/** Props of `Toggle`, the native on/off switch. */
export interface ToggleProps extends CommonProps, ToggleNativeProps {
  /** Whether it is on, as the user toggles it. */
  onChange?: (checked: boolean) => void;
}

/** Props of `Spacer`: every view's props, and none of its own. */
export interface SpacerProps extends CommonProps {}
/** Props of `Divider`: every view's props, and none of its own. */
export interface DividerProps extends CommonProps {}

/** Props of `Fragment`: its children and a `key`. */
export interface FragmentProps extends ElementAttributes {
  children?: KuitoNode;
}

/** Props of `Spinner`, the native progress indicator. */
export interface SpinnerProps extends CommonProps, SpinnerNativeProps {}
