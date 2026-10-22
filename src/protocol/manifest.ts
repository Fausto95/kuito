// The protocol between the kernel and the renderers, written once: every view
// kind, native prop, native event and payload. scripts/generate-protocol.ts
// turns it into the kernel's tables (src/runtime/protocol.generated.ts), the
// app's prop types (src/ui/props.generated.d.ts) and the prop tables in
// docs/primitives.md; test/protocol-parity.test.ts holds the renderers to it.
// Plain data: Node runs it directly and nothing here executes. The native
// module contract lives beside it in modules.ts.
import { DEV_LINK, type DevLinkProtocol } from './dev-link.ts';
import { MODULES, type ModuleProtocol } from './modules.ts';
import {
  ACTIONS,
  EDGES,
  GESTURES,
  GRADIENT,
  HEADER_ITEMS,
  HEADER_SEARCH,
  IMAGE_SOURCE,
  KEYS,
  LAYOUT_ANIMATION,
  LINES,
  OFFSETS,
  SCROLL_REQUEST,
  SELECTION,
  SNAP_POINTS,
  SYMBOL_NAME,
  TAB_ICON,
  type Schema,
} from './schemas.ts';

export type Platform = 'ios' | 'android';

export const PLATFORMS: readonly Platform[] = ['ios', 'android'];

/**
 * The renderer table that owns a prop: `layout` is KuitoLayoutProperties in
 * both renderers' properties/ directory, and so on.
 */
export type Concern =
  | 'animation'
  | 'layout'
  | 'decoration'
  | 'text'
  | 'control'
  | 'press'
  | 'image'
  | 'scroll'
  | 'list'
  | 'safeArea'
  | 'sheet'
  | 'navigation'
  | 'accessibility'
  | 'keyboard'
  | 'input'
  | 'gesture'
  | 'symbol'
  | 'motion';

export type Kind =
  | 'VStack'
  | 'Pressable'
  | 'SafeArea'
  | 'Sheet'
  | 'HStack'
  | 'Box'
  | 'Scroll'
  | 'HorizontalScroll'
  | 'Text'
  | 'Button'
  | 'TextField'
  | 'MultilineTextField'
  | 'Image'
  | 'Symbol'
  | 'Spacer'
  | 'Divider'
  | 'Toggle'
  | 'Spinner'
  | 'List'
  | 'HorizontalList'
  | 'ListCell'
  | 'NavigationStack'
  | 'NavigationScreen'
  | 'NavigationTabs'
  | 'NavigationTab';

/** A row of a kind's prop table in docs/primitives.md. */
export interface DocRow {
  /** App-facing names: native props, aliases, event props or `horizontal`. */
  props: readonly string[];
  /** How the names join in the first column; `' / '` by default. */
  join?: ', ' | ' / ';
  /** Marks props React Native does not have. */
  kuito?: true;
  text: string;
}

export interface Variant {
  /** An app prop (`horizontal`), or a native prop the variant kind takes too (`lines`). */
  prop: string;
  kind: Kind;
}

export interface KindSpec {
  /** Its children are native views; a leaf's are not (Text's are its label). */
  container: boolean;
  /**
   * The layout engine's defaults for the kind, as the expression in
   * native/shared/layout/KuitoLayoutStyle.cpp's kinds table.
   */
  layout: string;
  /** The platform measures its content: a leaf of the layout engine. */
  measured: boolean;
  /** Exported from kuito with typed props. */
  primitive: boolean;
  /** A plain container the host can flatten away (docs/flattening.md). */
  flattenable?: true;
  /**
   * The kind a prop picks while it is truthy, for a native view that is
   * fixed when made: a scroll view's axis, a field's wrapping. Changing it
   * remounts the view.
   */
  variant?: Variant;
  docs?: readonly DocRow[];
}

/**
 * How a value crosses the host boundary. Scalars cross as themselves; `color`
 * is a CSS color string; `length` is points or a percentage string, and
 * `lengthAuto` and `size` add their keywords; `json` is structured data;
 * `keys` is a list's unique keys, sent as edits to the keys it had
 * (docs/lists.md#keys).
 */
export type ValueType =
  | 'number'
  | 'boolean'
  | 'string'
  | 'color'
  | 'enum'
  | 'length'
  | 'lengthAuto'
  | 'size'
  | 'json'
  | 'keys';

/** `all`, every container kind, or the kinds listed. */
export type Kinds = 'all' | 'containers' | readonly Kind[];

/**
 * How a view reports a change it made itself: the event, and the payload
 * field that carries the new value, or the value the event always means.
 */
export type Report =
  | { event: string; field: string }
  /** Several payload fields as one object: a selection's start and end. */
  | { event: string; fields: readonly string[] }
  | { event: string; value: boolean | number | string };

/** Another app-facing name for a prop on one kind. */
export interface Alias {
  name: string;
  /** Its TypeScript type when it differs from the prop's. */
  ts?: string;
  doc?: string;
  /** The kind takes only the alias: the prop's own name is not typed on it. */
  only?: true;
}

/**
 * What null means for a prop: the value a renderer gets when the prop is
 * unset (removed, undefined, or a style condition or variant that set it
 * stops applying). Both renderers resolve it from this rule before any setter
 * runs, so no setter decides it alone (docs/native-renderer.md#unset-props).
 * - `{ value }`: the same as setting this value; a color's is `#rrggbb`.
 * - `initial`: the view's own initial state, which no value of the prop
 *   writes: the kind's layout default, the platform's text color, no label.
 * - `required`: unsetting is an error (`unsupportedValue`).
 */
export type Unset =
  | { value: boolean | number | string | readonly string[] }
  | 'initial'
  | 'required';

/**
 * What a write of the prop can disturb (docs/native-renderer.md#prop-effects).
 * A paint write never marks layout. A measure write dirties that leaf, up to
 * the first fixed-size ancestor. A layout write lays out from that node. A
 * structure write changes the tree.
 */
export type Effect = 'paint' | 'measure' | 'layout' | 'structure';

/** The groups of animatable props a `transition` names, as CSS's `transition` does. */
export type TransitionGroup =
  | 'opacity'
  | 'backgroundColor'
  | 'transform'
  | 'borderRadius'
  | 'borderColor'
  | 'shadow'
  | 'width'
  | 'height';

export interface PropSpec {
  concern: Concern;
  type: ValueType;
  unset: Unset;
  /** What a write can disturb. Generated into C++, Swift and Kotlin. */
  effect: Effect;
  /** An enum's values; the TypeScript type is their union unless `ts` names one. */
  values?: readonly (string | number)[];
  /** The TypeScript type: inside Prop<> for a scalar, the whole type for json. */
  ts?: string;
  /** An exported TypeScript name for an enum's union. */
  typeName?: { name: string; doc: string };
  /** The kinds whose typed props include it. */
  kinds: Kinds;
  /** Implemented on these platforms; both by default. */
  platforms?: readonly Platform[];
  /** Consumed by the kernel, which never sends it to a renderer. */
  kernel?: true;
  /** Sent after the view's other props when they reach it together: a selection indexes into the text. */
  last?: true;
  /**
   * A request the view acts on each time it receives one, not state it
   * keeps: the kernel never records it as the view's prop, so planning the
   * view again does not unset it.
   */
  request?: true;
  /**
   * Also takes an animation or a motion value (Animatable); the
   * `transition` group that says how it moves.
   */
  animatable?: TransitionGroup;
  /** A json prop that may also be a signal. */
  reactive?: true;
  /** A json prop's shape, which C++ checks its value against once (src/protocol/schemas.ts). */
  schema?: Schema;
  /** Set by the kernel or a component, never typed on a primitive. */
  internal?: true;
  required?: true;
  /** A decoration prop the layout engine applies too: a border insets, overflow shrinks. */
  laysOut?: true;
  /** A layout prop that still needs a native view, so its node is never flattened. */
  needsView?: true;
  /**
   * The view changes it itself (the user types, toggles, dismisses) and
   * reports it, by kind. Bound to a signal, the kernel writes the signal
   * (docs/events.md#two-way-props); the prop's type is `Bound<T>`.
   */
  reports?: Partial<Record<Kind, Report>>;
  /**
   * Set as a field of one object prop with related options, never on its
   * own: `keyboard={{ dismiss }}` sets keyboardDismissMode.
   */
  group?: { name: string; field: string };
  aliases?: Partial<Record<Kind, Alias>>;
  doc?: string;
}

/** `number?` may be absent: native writes NaN in its slot (docs/events.md#typed-events). */
export type FieldType = 'number' | 'number?' | 'string' | 'boolean';

/**
 * A native event's payload: its fields, generated as `<name>` interfaces and
 * as the fixed layout native writes the event in (docs/events.md#typed-events).
 */
export type Payload = Readonly<Record<string, FieldType>>;

/** An image source's field: a payload's, or optional request headers by name. */
export type SourceFieldType = FieldType | 'headers?';

/** An object Image's `src` takes: its JSON fields, generated as `<name>` interfaces. */
export type ImageSourceFields = Readonly<Record<string, SourceFieldType>>;

/**
 * A native event, by what each kind sends with it (`all` for every kind): a
 * payload's name, or null for none.
 */
export type EventSpec = Partial<Record<Kind | 'all', string | null>>;

/** An app's event prop and the native event it listens to. */
export interface EventPropSpec {
  event: string;
  /**
   * Passes the value the view reports with the event (its prop's `reports`
   * field: a TextField's text, a Toggle's checked) instead of the event.
   */
  value?: true;
  /** A native prop set to true while the event has a listener, for events costly to send. */
  announce?: string;
  /** Native props that make the event fire every frame, for a handler on the UI thread. */
  everyFrame?: Readonly<Record<string, number | string | boolean>>;
  /**
   * The prop takes a motion source rather than a handler
   * (docs/motion.md#motion-sources): the event moves the source's motion
   * values, one per payload field, every frame the view moves.
   */
  source?: true;
}

/** SF Symbols' weights; Android's Material Symbols font has one, which heavier weights embolden. */
const SYMBOL_WEIGHTS = [
  'ultralight',
  'thin',
  'light',
  'regular',
  'medium',
  'semibold',
  'bold',
  'heavy',
  'black',
];

const KIND_SPECS = {
  VStack: {
    container: true,
    layout: 'column()',
    measured: false,
    primitive: true,
    flattenable: true,
  },
  Pressable: {
    container: true,
    layout: 'column()',
    measured: false,
    primitive: true,
    docs: [
      { props: ['onPress'], text: 'A completed press. Not called when a long press fired.' },
      { props: ['onPressStart', 'onPressEnd'], text: 'Touch down / up or cancel.' },
      { props: ['onLongPress'], text: 'Held for `longPressDuration` ms (500 by default).' },
      { props: ['disabled'], text: 'Ignores touches.' },
      { props: ['hitArea'], text: 'Extra touchable margin in points.' },
      {
        props: ['pressedOpacity'],
        kuito: true,
        text: 'Opacity while pressed, like `TouchableOpacity`. 1 = none.',
      },
      {
        props: ['pressedScale'],
        kuito: true,
        text: 'Scale while pressed, e.g. `0.97`. 1 = none.',
      },
      {
        props: ['haptic'],
        kuito: true,
        text: '`light`, `medium`, `heavy` or `selection` on press-in.',
      },
    ],
  },
  SafeArea: {
    container: true,
    layout: 'column()',
    measured: false,
    primitive: true,
    docs: [
      {
        props: ['edges'],
        text: 'Which of `top`, `right`, `bottom`, `left` to pad; all four by default.',
      },
    ],
  },
  Sheet: {
    container: true,
    layout: 'column()',
    measured: false,
    primitive: true,
    docs: [
      {
        props: ['open'],
        text: 'Shows the sheet while true. Controlled: set it back to false in `onClose`.',
      },
      {
        props: ['onClose'],
        text: 'The user dismissed it (swipe, backdrop or back); set `open` back to false.',
      },
      {
        props: ['snapPoints'],
        text: "Resting heights, smallest first: points, `'50%'`, or `'content'` (default).",
      },
      { props: ['onSnap'], text: '`{ index }` of the snap point the sheet settled at.' },
      { props: ['grabber'], text: 'The drag handle; shown by default.' },
      {
        props: ['dismissible'],
        text: 'Whether swiping down or tapping outside dismisses it; true by default.',
      },
      { props: ['borderRadius'], text: "The sheet's corner radius." },
      {
        props: ['motion'],
        text: '`sheetMotion()`: its `height` and its `progress` between its snap points move with the sheet every frame, on the UI thread ([motion sources](motion.md#motion-sources)).',
      },
    ],
  },
  HStack: { container: true, layout: 'row()', measured: false, primitive: true, flattenable: true },
  Box: { container: true, layout: 'column()', measured: false, primitive: true, flattenable: true },
  Scroll: {
    container: true,
    layout: 'scrolling(column())',
    measured: false,
    primitive: true,
    variant: { prop: 'horizontal', kind: 'HorizontalScroll' },
    docs: [
      { props: ['horizontal'], text: 'Scroll sideways. Changing it remounts the view.' },
      {
        props: ['onScroll', 'scrollInterval'],
        join: ', ',
        text: '`{ x, y, contentWidth, contentHeight, layoutWidth, layoutHeight }` in points, at most once per throttle (50 ms by default).',
      },
      {
        props: ['onScrollEnd'],
        text: "HTML's `scrollend`: the same fields, where it came to rest after a fling, a drag or a `scrollTo`, once per rest.",
      },
      {
        props: ['onReachEnd', 'reachEndThreshold'],
        join: ', ',
        text: 'Once each time the end comes within the threshold, in visible lengths (0.5 by default).',
      },
      {
        props: ['onRefresh', 'refreshing'],
        join: ', ',
        text: 'Pull-to-refresh (vertical only).',
      },
      { props: ['scrollbar'], text: 'Shows or hides the scrollbar.' },
      {
        props: ['motion'],
        text: '`scrollMotion()`: its `offset`, `velocity` and `overscroll` move with the view every frame, on the UI thread ([motion sources](motion.md#motion-sources)).',
      },
      {
        props: ['paging', 'snapOffsets'],
        join: ', ',
        text: 'Where a drag comes to rest: whole pages, or the offsets given ([paging and snapping](#paging-and-snapping)).',
      },
      {
        props: ['keyboard'],
        text: '`{ dismiss, persistTaps, inset, avoid }`: when dragging dismisses the keyboard, what a tap outside the field does, whether content stays clear of it (true by default) ([keyboard](keyboard.md#scroll-views)).',
      },
    ],
  },
  HorizontalScroll: {
    container: true,
    layout: 'scrolling(row())',
    measured: false,
    primitive: false,
  },
  Text: { container: false, layout: 'column()', measured: true, primitive: true },
  Button: { container: false, layout: 'control()', measured: true, primitive: true },
  TextField: {
    container: false,
    layout: 'column()',
    measured: true,
    primitive: true,
    variant: { prop: 'lines', kind: 'MultilineTextField' },
  },
  MultilineTextField: { container: false, layout: 'column()', measured: true, primitive: false },
  Image: {
    container: false,
    layout: 'column()',
    measured: false,
    primitive: true,
    docs: [
      {
        props: ['src'],
        text: 'A URL string, `{ uri, headers? }`, or an imported image ([assets](assets.md)).',
      },
      {
        props: ['objectFit'],
        text: "CSS's `object-fit`: `cover` (default), `contain`, `fill` or `none`.",
      },
      { props: ['tintColor'], text: 'Recolors opaque pixels, for icons.' },
      { props: ['onLoadStart', 'onLoadEnd'], text: 'Around every load, success or failure.' },
      { props: ['onLoad'], text: '`{ width, height }` of the image in pixels.' },
      { props: ['onError'], text: '`{ error }`, e.g. `"HTTP 404"`.' },
      {
        props: ['aspectRatio'],
        kuito: true,
        text: 'Width ÷ height: sizes the view before the image arrives.',
      },
      { props: ['placeholder'], kuito: true, text: 'Color shown while loading.' },
      {
        props: ['thumbhash'],
        kuito: true,
        text: 'A base64 [ThumbHash](https://evanw.github.io/thumbhash/): its blurred preview shows while loading, over `placeholder`.',
      },
      {
        props: ['fadeDuration'],
        kuito: true,
        text: 'Cross-fade in milliseconds when the image appears; 0 by default.',
      },
      {
        props: ['cache'],
        kuito: true,
        text: '`memory-disk` (default), `memory`, `disk` or `none`.',
      },
    ],
  },
  Symbol: {
    container: false,
    layout: 'column()',
    measured: false,
    primitive: true,
    docs: [
      {
        props: ['name'],
        kuito: true,
        text: 'An SF Symbol on iOS and a Material Symbol on Android, or `{ ios, android }`.',
      },
      { props: ['size'], kuito: true, text: 'In points; 24 by default, and the view’s size.' },
      {
        props: ['weight'],
        kuito: true,
        text: '`ultralight` to `black`; `regular` by default.',
      },
      { props: ['tintColor'], kuito: true, text: 'The symbol’s color; black by default.' },
    ],
  },
  Spacer: {
    container: false,
    layout: 'spacer()',
    measured: false,
    primitive: true,
    flattenable: true,
  },
  Divider: { container: false, layout: 'divider()', measured: false, primitive: true },
  Toggle: { container: false, layout: 'control()', measured: true, primitive: true },
  Spinner: { container: false, layout: 'control()', measured: true, primitive: true },
  // A list's rows are modules of their own, rendered into its cells.
  List: {
    container: false,
    layout: 'scrolling(column())',
    measured: true,
    primitive: false,
    variant: { prop: 'horizontal', kind: 'HorizontalList' },
  },
  HorizontalList: {
    container: false,
    layout: 'scrolling(row())',
    measured: true,
    primitive: false,
  },
  ListCell: { container: true, layout: 'column()', measured: false, primitive: false },
  NavigationStack: { container: true, layout: 'navigation()', measured: false, primitive: false },
  NavigationScreen: { container: true, layout: 'column()', measured: false, primitive: false },
  NavigationTabs: { container: true, layout: 'navigation()', measured: false, primitive: false },
  NavigationTab: { container: true, layout: 'column()', measured: false, primitive: false },
} satisfies Record<Kind, KindSpec>;

export const KINDS: Readonly<Record<Kind, KindSpec>> = KIND_SPECS;

const SCROLL_VIEWS: readonly Kind[] = ['Scroll', 'HorizontalScroll'];
const SCROLLABLE: readonly Kind[] = [...SCROLL_VIEWS, 'List', 'HorizontalList'];
const LISTS: readonly Kind[] = ['List', 'HorizontalList'];
const LABELS: readonly Kind[] = ['Text', 'Button'];

/** A single-line field and the multi-line one `lines` makes it. */
const FIELDS: readonly Kind[] = ['TextField', 'MultilineTextField'];

const SELF_ALIGNMENTS = [
  'normal',
  'start',
  'end',
  'flex-start',
  'flex-end',
  'center',
  'baseline',
  'stretch',
  'self-start',
  'self-end',
];

const CONTENT_ALIGNMENTS = [
  'normal',
  'start',
  'end',
  'flex-start',
  'flex-end',
  'center',
  'stretch',
  'space-between',
  'space-around',
  'space-evenly',
];

/** Alignment keywords with CSS's overflow positions, as SelfAlignment and ContentAlignment type them. */
const safe = (keywords: readonly string[]) => [
  ...keywords,
  ...keywords.map((keyword) => 'safe ' + keyword),
  ...keywords.map((keyword) => 'unsafe ' + keyword),
];

const transform = (identity: number, doc?: string): PropSpec => ({
  concern: 'animation',
  type: 'number',
  unset: { value: identity },
  kinds: 'all',
  effect: 'paint',
  animatable: 'transform',
  ...(doc ? { doc } : {}),
});

/** Unset, a layout prop restores the kind's default in the layout engine. */
const layout = (type: ValueType, kinds: Kinds = 'all', ts?: string): PropSpec => ({
  concern: 'layout',
  type,
  unset: 'initial',
  kinds,
  effect: 'layout',
  ...(ts ? { ts } : {}),
});

const decoration = (type: ValueType, unset: Unset, effect: Effect = 'paint'): PropSpec => ({
  concern: 'decoration',
  type,
  unset,
  kinds: 'all',
  effect,
});

const fact = (type: ValueType, ts?: string): PropSpec => ({
  concern: 'accessibility',
  type,
  unset: 'initial',
  kinds: 'all',
  effect: 'paint',
  ...(ts ? { ts } : {}),
});

const PROP_SPECS = {
  // Animation: animatable props and how they animate.
  opacity: {
    effect: 'paint',
    concern: 'animation',
    type: 'number',
    unset: { value: 1 },
    kinds: 'all',
    animatable: 'opacity',
  },
  backgroundColor: {
    effect: 'paint',
    concern: 'animation',
    type: 'color',
    unset: 'initial',
    kinds: 'all',
    animatable: 'backgroundColor',
  },
  translateX: transform(0),
  translateY: transform(0),
  scale: transform(1),
  scaleX: transform(1),
  scaleY: transform(1),
  rotate: transform(0, 'Degrees.'),
  transition: {
    effect: 'paint',
    concern: 'animation',
    type: 'json',
    unset: 'initial',
    kinds: 'all',
    kernel: true,
    ts: 'Transition',
    doc: 'How the animatable props move when they change, enter or leave, by group; a CSS `transition` compiles to it.',
  },
  animate: {
    effect: 'paint',
    concern: 'animation',
    type: 'json',
    unset: 'initial',
    kinds: 'all',
    kernel: true,
    ts: 'AnimatedProps',
    doc: 'Animatable props whose every change moves as `transition` says; the first value applies at once.',
  },
  enter: {
    effect: 'paint',
    concern: 'animation',
    type: 'json',
    unset: 'initial',
    kinds: 'all',
    kernel: true,
    ts: 'Effect',
    doc: 'Where the view enters from: `fade.and(slide.up(12))`.',
  },
  exit: {
    effect: 'paint',
    concern: 'animation',
    type: 'boolean',
    unset: { value: false },
    kinds: 'all',
    ts: 'Effect',
    doc: 'Where the view leaves to; it stays on screen until it is there. The renderer gets `true`, and keeps the view until `exited`.',
  },
  exited: {
    effect: 'structure',
    concern: 'animation',
    type: 'boolean',
    unset: { value: false },
    kinds: 'all',
    internal: true,
    doc: "The UI thread's word that an exiting view's animation ended: the renderer lets it go.",
  },
  layout: {
    effect: 'paint',
    concern: 'animation',
    type: 'json',
    schema: LAYOUT_ANIMATION,
    unset: 'initial',
    kinds: 'all',
    ts: 'Animation<number>',
    doc: 'How the view moves to a new frame the layout gives it: `layout={spring()}`.',
  },

  // Layout: applied to the view's node in the shared engine (native/shared/layout).
  hidden: {
    ...layout('boolean'),
    needsView: true,
    doc: 'Takes the view out of layout and off screen, as CSS `display: none`.',
  },
  padding: layout('length'),
  paddingTop: layout('length'),
  paddingRight: layout('length'),
  paddingBottom: layout('length'),
  paddingLeft: layout('length'),
  width: { ...layout('size'), animatable: 'width' },
  height: { ...layout('size'), animatable: 'height' },
  minWidth: layout('size'),
  maxWidth: layout('size'),
  minHeight: layout('size'),
  maxHeight: layout('size'),
  aspectRatio: {
    ...layout('number'),
    doc: 'Width divided by height; sizes the missing side from the other.',
  },
  alignItems: { ...layout('enum', 'containers', 'SelfAlignment'), values: safe(SELF_ALIGNMENTS) },
  justifyContent: {
    ...layout('enum', 'containers', 'ContentAlignment'),
    values: safe(CONTENT_ALIGNMENTS),
  },
  gap: layout('length', 'containers'),
  position: { ...layout('enum'), values: ['relative', 'absolute'] },
  top: layout('lengthAuto'),
  right: layout('lengthAuto'),
  bottom: layout('lengthAuto'),
  left: layout('lengthAuto'),
  margin: layout('lengthAuto'),
  marginTop: layout('lengthAuto'),
  marginRight: layout('lengthAuto'),
  marginBottom: layout('lengthAuto'),
  marginLeft: layout('lengthAuto'),
  rowGap: layout('length', 'containers'),
  columnGap: layout('length', 'containers'),
  flexDirection: {
    ...layout('enum', 'containers'),
    values: ['row', 'column', 'row-reverse', 'column-reverse'],
  },
  flexWrap: {
    ...layout('enum', 'containers'),
    values: ['nowrap', 'wrap', 'wrap-reverse', 'balance'],
  },
  flexLineCount: {
    ...layout('number', 'containers'),
    doc: 'The minimum number of lines a wrapping container breaks into (CSS Flexbox 2).',
  },
  flexGrow: layout('number'),
  flexShrink: layout('number'),
  flexBasis: layout('size', 'all', "SizeValue | 'content'"),
  flex: {
    ...layout('number'),
    doc: 'A grow factor from a zero basis, as CSS `flex: n`; 0 is inflexible.',
  },
  alignSelf: {
    ...layout('enum', 'all', "SelfAlignment | 'auto'"),
    values: ['auto', ...safe(SELF_ALIGNMENTS)],
  },
  alignContent: {
    ...layout('enum', 'containers', 'ContentAlignment'),
    values: safe(CONTENT_ALIGNMENTS),
  },
  direction: {
    ...layout('enum'),
    values: ['ltr', 'rtl'],
    doc: "The way lines run; unset, the parent's, and the app's first language's at the root.",
  },
  boxSizing: { ...layout('enum'), values: ['border-box', 'content-box'] },

  // Decoration: corners, clipping, borders, shadows and gradients.
  borderRadius: { ...decoration('number', { value: 0 }), animatable: 'borderRadius' },
  overflow: {
    ...decoration('enum', 'initial', 'layout'),
    values: ['visible', 'hidden', 'clip', 'scroll'],
    laysOut: true,
    doc: 'hidden and scroll clip; as in CSS, either lets a flex item shrink below its content.',
  },
  borderWidth: { ...decoration('number', { value: 0 }, 'layout'), laysOut: true },
  borderColor: { ...decoration('color', { value: '#000000' }), animatable: 'borderColor' },
  shadowColor: { ...decoration('color', 'initial'), animatable: 'shadow' },
  shadowRadius: { ...decoration('number', { value: 0 }), animatable: 'shadow' },
  shadowOffsetX: { ...decoration('number', { value: 0 }), animatable: 'shadow' },
  shadowOffsetY: { ...decoration('number', { value: 0 }), animatable: 'shadow' },
  backgroundGradient: {
    ...decoration('json', 'initial'),
    schema: GRADIENT,
    ts: '{ angle: number; colors: string[] }',
  },

  // Text: content and typography.
  // A field's text is its `value`; a Text's or Button's is its children,
  // which the kernel sends as `text`.
  text: {
    effect: 'measure',
    concern: 'text',
    type: 'string',
    unset: { value: '' },
    kinds: FIELDS,
    reports: {
      TextField: { event: 'change', field: 'text' },
      MultilineTextField: { event: 'change', field: 'text' },
    },
    aliases: {
      TextField: { name: 'value', only: true, doc: "The field's text, as HTML's `value`." },
      MultilineTextField: { name: 'value', only: true },
    },
  },
  color: { effect: 'paint', concern: 'text', type: 'color', unset: 'initial', kinds: 'all' },
  fontSize: {
    effect: 'measure',
    concern: 'text',
    type: 'number',
    unset: { value: 17 },
    kinds: LABELS,
  },
  fontWeight: {
    effect: 'measure',
    concern: 'text',
    type: 'enum',
    unset: { value: 'normal' },
    kinds: LABELS,
    values: ['normal', 'bold', 100, 200, 300, 400, 500, 600, 700, 800, 900],
    doc: 'normal/bold or 100-900.',
  },
  fontFamily: {
    effect: 'measure',
    concern: 'text',
    type: 'string',
    unset: 'initial',
    kinds: LABELS,
  },
  fontStyle: {
    effect: 'measure',
    concern: 'text',
    type: 'enum',
    unset: { value: 'normal' },
    kinds: LABELS,
    values: ['normal', 'italic'],
  },
  lineHeight: {
    effect: 'measure',
    concern: 'text',
    type: 'number',
    unset: 'initial',
    kinds: LABELS,
  },
  letterSpacing: {
    effect: 'measure',
    concern: 'text',
    type: 'number',
    unset: { value: 0 },
    kinds: LABELS,
  },
  textAlign: {
    effect: 'paint',
    concern: 'text',
    type: 'enum',
    unset: 'initial',
    kinds: LABELS,
    values: ['left', 'center', 'right'],
  },
  textTransform: {
    effect: 'measure',
    concern: 'text',
    type: 'enum',
    unset: { value: 'none' },
    kinds: LABELS,
    values: ['none', 'uppercase', 'lowercase', 'capitalize'],
  },
  lineClamp: {
    effect: 'measure',
    concern: 'text',
    type: 'number',
    unset: { value: 0 },
    kinds: LABELS,
    doc: '0 = unlimited.',
  },

  // Control: enabled, placeholders, toggles and indicators.
  disabled: {
    effect: 'paint',
    concern: 'control',
    type: 'boolean',
    unset: { value: false },
    kinds: ['Pressable', 'Button', 'Toggle', ...FIELDS],
    doc: 'Takes no presses or input, as HTML `disabled`.',
  },
  placeholder: {
    effect: 'measure',
    concern: 'control',
    type: 'string',
    unset: 'initial',
    kinds: FIELDS,
  },
  placeholderTextColor: {
    effect: 'paint',
    concern: 'control',
    type: 'color',
    unset: 'initial',
    kinds: FIELDS,
    aliases: {
      TextField: { name: 'placeholderColor', only: true, doc: "The placeholder's color." },
      MultilineTextField: { name: 'placeholderColor', only: true },
    },
  },
  selectionColor: {
    effect: 'paint',
    concern: 'control',
    type: 'color',
    unset: 'initial',
    kinds: FIELDS,
    doc: 'The cursor and selection color.',
  },
  checked: {
    effect: 'paint',
    concern: 'control',
    type: 'boolean',
    unset: { value: false },
    kinds: ['Toggle'],
    reports: { Toggle: { event: 'change', field: 'value' } },
    doc: 'On or off, as an HTML checkbox.',
  },
  animating: {
    effect: 'paint',
    concern: 'control',
    type: 'boolean',
    unset: { value: true },
    kinds: ['Spinner'],
    doc: 'Spins while true; true by default.',
  },

  // Press: Pressable's feedback, long-press delay, hit area and disabling.
  pressedOpacity: {
    effect: 'paint',
    concern: 'press',
    type: 'number',
    unset: { value: 1 },
    kinds: ['Pressable'],
    doc: 'Opacity while pressed (like TouchableOpacity); 1 means no change.',
  },
  pressedScale: {
    effect: 'paint',
    concern: 'press',
    type: 'number',
    unset: { value: 1 },
    kinds: ['Pressable'],
    doc: 'Scale while pressed, e.g. 0.97; 1 means no change.',
  },
  longPressDuration: {
    effect: 'paint',
    concern: 'press',
    type: 'number',
    unset: { value: 500 },
    kinds: ['Pressable'],
    doc: 'Milliseconds before onLongPress; 500 by default.',
  },
  hitArea: {
    effect: 'paint',
    concern: 'press',
    type: 'number',
    unset: { value: 0 },
    kinds: ['Pressable'],
    doc: 'Extra touchable margin around the view, in points.',
  },
  haptic: {
    effect: 'paint',
    concern: 'press',
    type: 'enum',
    unset: 'initial',
    kinds: ['Pressable'],
    values: ['light', 'medium', 'heavy', 'selection'],
    doc: 'Haptic feedback on press-in.',
  },

  // Image: source, fit and loading options.
  src: {
    effect: 'measure',
    concern: 'image',
    type: 'json',
    schema: IMAGE_SOURCE,
    unset: 'initial',
    kinds: ['Image'],
    ts: 'ImageSource',
    reactive: true,
    doc: 'A URL, or a bundled image as its import gives it.',
  },
  objectFit: {
    effect: 'paint',
    concern: 'image',
    type: 'enum',
    unset: { value: 'cover' },
    kinds: ['Image'],
    values: ['cover', 'contain', 'fill', 'none'],
    doc: "CSS's `object-fit`: `cover` fills and crops, `contain` fits, `fill` distorts, `none` keeps its size, centered.",
  },
  placeholderColor: {
    effect: 'paint',
    concern: 'image',
    type: 'color',
    unset: 'initial',
    kinds: ['Image'],
    aliases: {
      Image: { name: 'placeholder', only: true, doc: 'Color shown while the image loads.' },
    },
  },
  fadeDuration: {
    effect: 'paint',
    concern: 'image',
    type: 'number',
    unset: { value: 0 },
    kinds: ['Image'],
    doc: 'Cross-fade duration in milliseconds when the image appears; 0 by default.',
  },
  tintColor: {
    effect: 'paint',
    concern: 'image',
    type: 'color',
    unset: 'initial',
    kinds: ['Image', 'Symbol'],
    doc: "Recolors the image's opaque pixels, for icons.",
  },
  cache: {
    effect: 'paint',
    concern: 'image',
    type: 'enum',
    unset: { value: 'memory-disk' },
    kinds: ['Image'],
    values: ['memory-disk', 'memory', 'disk', 'none'],
    doc: 'Which caches may serve and keep the image; `memory-disk` by default.',
  },

  // Symbol: the platform's own symbols, by name (docs/assets.md#symbols).
  name: {
    effect: 'measure',
    concern: 'symbol',
    type: 'json',
    schema: SYMBOL_NAME,
    unset: 'required',
    kinds: ['Symbol'],
    ts: 'SymbolName',
    required: true,
    doc: 'An SF Symbol on iOS and a Material Symbol on Android, or `{ ios, android }`.',
  },
  size: {
    effect: 'measure',
    concern: 'symbol',
    type: 'number',
    unset: { value: 24 },
    kinds: ['Symbol'],
    doc: 'Point size of the symbol and of its view; 24 by default.',
  },
  weight: {
    effect: 'measure',
    concern: 'symbol',
    type: 'enum',
    unset: { value: 'regular' },
    kinds: ['Symbol'],
    values: SYMBOL_WEIGHTS,
    typeName: { name: 'SymbolWeight', doc: "A symbol's stroke weight, after SF Symbols'." },
    doc: 'Stroke weight; `regular` by default.',
  },

  // Scroll: events, end-reached, pull-to-refresh and indicators.
  emitsScroll: {
    effect: 'paint',
    concern: 'scroll',
    type: 'boolean',
    unset: { value: false },
    kinds: SCROLLABLE,
    internal: true,
  },
  scrollInterval: {
    effect: 'paint',
    concern: 'scroll',
    type: 'number',
    unset: { value: 50 },
    kinds: SCROLLABLE,
    doc: 'At most one scroll event per this many milliseconds; 50 by default.',
  },
  reachEndThreshold: {
    effect: 'paint',
    concern: 'scroll',
    type: 'number',
    unset: { value: 0.5 },
    kinds: SCROLLABLE,
    doc: 'Distance from the end, in visible lengths, that counts as the end; 0.5 by default.',
  },
  refreshable: {
    effect: 'paint',
    concern: 'scroll',
    type: 'boolean',
    unset: { value: false },
    kinds: SCROLLABLE,
    internal: true,
  },
  refreshing: {
    effect: 'paint',
    concern: 'scroll',
    type: 'boolean',
    unset: { value: false },
    kinds: SCROLLABLE,
    reports: {
      Scroll: { event: 'refresh', value: true },
      HorizontalScroll: { event: 'refresh', value: true },
      List: { event: 'refresh', value: true },
      HorizontalList: { event: 'refresh', value: true },
    },
    doc: 'Shows the pull-to-refresh spinner while true.',
  },
  scrollbar: {
    effect: 'paint',
    concern: 'scroll',
    type: 'boolean',
    unset: { value: true },
    kinds: SCROLLABLE,
    doc: 'Shows the scrollbar while scrolling; true by default.',
  },

  // List: a native list's rows, columns and scroll requests (docs/lists.md).
  keys: {
    effect: 'structure',
    concern: 'list',
    type: 'keys',
    unset: 'initial',
    kinds: LISTS,
    internal: true,
  },
  spanningKeys: {
    effect: 'structure',
    concern: 'list',
    type: 'json',
    schema: KEYS,
    unset: { value: [] },
    kinds: LISTS,
    internal: true,
  },
  stickyKeys: {
    effect: 'structure',
    concern: 'list',
    type: 'json',
    schema: KEYS,
    unset: { value: [] },
    kinds: ['List'],
    internal: true,
  },
  numColumns: {
    effect: 'layout',
    concern: 'list',
    type: 'number',
    unset: { value: 1 },
    kinds: LISTS,
    internal: true,
  },
  inverted: {
    effect: 'layout',
    concern: 'list',
    type: 'boolean',
    unset: { value: false },
    kinds: LISTS,
    internal: true,
  },
  estimatedItemSize: {
    effect: 'layout',
    concern: 'list',
    type: 'number',
    unset: 'initial',
    kinds: LISTS,
    internal: true,
  },
  initialScrollKey: {
    effect: 'paint',
    concern: 'list',
    type: 'string',
    unset: 'initial',
    kinds: LISTS,
    internal: true,
  },
  scrollTo: {
    effect: 'paint',
    concern: 'scroll',
    type: 'json',
    schema: SCROLL_REQUEST,
    unset: 'initial',
    kinds: SCROLLABLE,
    internal: true,
    request: true,
  },
  emitsViewable: {
    effect: 'paint',
    concern: 'list',
    type: 'boolean',
    unset: { value: false },
    kinds: LISTS,
    internal: true,
  },
  viewableThreshold: {
    effect: 'paint',
    concern: 'list',
    type: 'number',
    unset: { value: 0 },
    kinds: LISTS,
    internal: true,
  },
  cellKey: {
    effect: 'structure',
    concern: 'list',
    type: 'string',
    unset: 'initial',
    kinds: ['ListCell'],
    internal: true,
  },

  // Safe area, sheets and navigation.
  edges: {
    effect: 'layout',
    concern: 'safeArea',
    type: 'json',
    schema: EDGES,
    unset: { value: ['top', 'right', 'bottom', 'left'] },
    kinds: ['SafeArea'],
    ts: 'readonly SafeAreaEdge[]',
    reactive: true,
    doc: 'Which edges to pad; all four by default.',
  },
  open: {
    effect: 'layout',
    concern: 'sheet',
    type: 'boolean',
    unset: { value: false },
    kinds: ['Sheet'],
    required: true,
    reports: { Sheet: { event: 'close', value: false } },
  },
  snapPoints: {
    effect: 'layout',
    concern: 'sheet',
    type: 'json',
    schema: SNAP_POINTS,
    unset: { value: ['content'] },
    kinds: ['Sheet'],
    ts: 'readonly SnapPoint[]',
    reactive: true,
    doc: "Heights the sheet rests at, smallest first; `['content']` by default.",
  },
  grabber: {
    effect: 'layout',
    concern: 'sheet',
    type: 'boolean',
    unset: { value: true },
    kinds: ['Sheet'],
    doc: 'Shows the drag handle; true by default.',
  },
  dismissible: {
    effect: 'paint',
    concern: 'sheet',
    type: 'boolean',
    unset: { value: true },
    kinds: ['Sheet'],
    doc: 'Whether swiping down or tapping outside dismisses it; true by default.',
  },
  sheetCornerRadius: {
    effect: 'paint',
    concern: 'sheet',
    type: 'number',
    unset: 'initial',
    kinds: ['Sheet'],
    aliases: { Sheet: { name: 'borderRadius', only: true } },
  },
  title: {
    effect: 'paint',
    concern: 'navigation',
    type: 'string',
    unset: 'initial',
    kinds: ['NavigationScreen', 'NavigationTab'],
    internal: true,
  },
  header: {
    effect: 'layout',
    concern: 'navigation',
    type: 'boolean',
    unset: { value: true },
    kinds: ['NavigationScreen'],
    internal: true,
  },
  icon: {
    effect: 'paint',
    concern: 'navigation',
    type: 'json',
    schema: TAB_ICON,
    unset: 'initial',
    kinds: ['NavigationTab'],
    internal: true,
  },
  selectedIndex: {
    effect: 'layout',
    concern: 'navigation',
    type: 'number',
    unset: { value: 0 },
    kinds: ['NavigationTabs'],
    internal: true,
  },
  sharedId: {
    effect: 'paint',
    concern: 'navigation',
    type: 'string',
    unset: 'initial',
    kinds: 'all',
    doc: 'A view the navigation stack flies to the view with the same sharedId on the screen it pushes or pops to (docs/navigation.md#shared-elements).',
  },

  // Accessibility: what screen readers read and do (docs/accessibility.md).
  accessible: {
    ...fact('boolean'),
    doc: "Makes the view one screen reader element, read as its label or its children's text.",
  },
  label: { ...fact('string'), doc: 'What a screen reader says for the view.' },
  hint: {
    ...fact('string'),
    doc: 'What happens when the view is activated, read after the label.',
  },
  // The kernel maps ARIA's role (the app's `role`) onto these platform roles
  // (src/runtime/accessibility-props.ts).
  role: {
    ...fact('enum'),
    internal: true,
    values: [
      'none',
      'adjustable',
      'alert',
      'button',
      'checkbox',
      'combobox',
      'grid',
      'header',
      'image',
      'imagebutton',
      'keyboardkey',
      'link',
      'list',
      'menu',
      'menubar',
      'menuitem',
      'progressbar',
      'radio',
      'radiogroup',
      'scrollbar',
      'search',
      'spinbutton',
      'summary',
      'switch',
      'tab',
      'tablist',
      'text',
      'timer',
      'togglebutton',
      'toolbar',
    ],
  },
  'aria-hidden': {
    ...fact('boolean'),
    unset: { value: false },
    doc: 'Screen readers skip the view and its subtree.',
  },
  actions: {
    ...fact('json', 'readonly AccessibilityAction[]'),
    schema: ACTIONS,
    unset: { value: [] },
    reactive: true,
    doc: 'Actions a screen reader offers; `onAction` receives the one taken.',
  },
  live: {
    ...fact('enum'),
    unset: { value: 'off' },
    values: ['off', 'polite', 'assertive'],
    doc: "ARIA's `aria-live`: announces changes to the view's content, on iOS too.",
  },
  // ARIA's state and value facts.
  'aria-disabled': fact('boolean'),
  'aria-selected': fact('boolean'),
  'aria-checked': fact('boolean', "boolean | 'mixed'"),
  'aria-busy': fact('boolean'),
  'aria-expanded': fact('boolean'),
  'aria-valuemin': fact('number'),
  'aria-valuemax': fact('number'),
  'aria-valuenow': fact('number'),
  'aria-valuetext': fact('string'),

  // Keyboard: return key, submit behavior, focus, dismissal and avoidance.
  enterKeyHint: {
    effect: 'paint',
    concern: 'keyboard',
    type: 'enum',
    unset: { value: 'enter' },
    kinds: FIELDS,
    values: ['enter', 'done', 'go', 'next', 'search', 'send'],
    doc: "HTML's `enterkeyhint`: the enter key's label. `next` moves focus to the next input natively.",
  },
  submitBehavior: {
    effect: 'paint',
    concern: 'keyboard',
    type: 'enum',
    unset: 'initial',
    kinds: FIELDS,
    values: ['submit', 'blurAndSubmit', 'newline'],
    doc: 'What the enter key does: `newline` (default with `lines`) adds a line; after onSubmit, `blurAndSubmit` (default without) hides the keyboard, or moves to the next input with enterKeyHint `next`, and `submit` keeps the focus.',
  },
  autoFocus: {
    effect: 'paint',
    concern: 'keyboard',
    type: 'boolean',
    unset: { value: false },
    kinds: FIELDS,
    doc: 'Focuses the input once it is on screen.',
  },
  keyboardDismissMode: {
    effect: 'paint',
    concern: 'keyboard',
    type: 'enum',
    unset: { value: 'none' },
    kinds: SCROLLABLE,
    values: ['none', 'on-drag', 'interactive'],
    group: { name: 'keyboard', field: 'dismiss' },
    doc: 'Whether dragging dismisses the keyboard; `interactive` follows the finger (iOS; Android dismisses on drag).',
  },
  keyboardShouldPersistTaps: {
    effect: 'paint',
    concern: 'keyboard',
    type: 'enum',
    unset: { value: 'never' },
    kinds: SCROLLABLE,
    values: ['never', 'always', 'handled'],
    group: { name: 'keyboard', field: 'persistTaps' },
    doc: 'While the keyboard shows, what a tap outside the focused input does: `never` (default) dismisses it and the tap goes nowhere; `handled` dismisses only when no pressable, button, switch or input took the tap; `always` leaves the keyboard up.',
  },
  automaticallyAdjustKeyboardInsets: {
    effect: 'layout',
    concern: 'keyboard',
    type: 'boolean',
    unset: { value: true },
    kinds: SCROLLABLE,
    group: { name: 'keyboard', field: 'inset' },
    doc: 'Insets the content by the part the keyboard covers and scrolls the focused input into view. True by default.',
  },
  keyboardAvoidance: {
    effect: 'layout',
    concern: 'keyboard',
    type: 'enum',
    unset: { value: 'none' },
    kinds: 'containers',
    values: ['none', 'padding', 'position'],
    group: { name: 'keyboard', field: 'avoid' },
    doc: 'Keeps the view clear of the keyboard, natively and in step with its animation: `padding` pads the bottom by the part the keyboard covers; `position` lifts the view until its focused input (or its bottom) shows.',
  },

  // Gestures: the view's native gestures (docs/motion.md, "Native contract").
  gestures: {
    effect: 'paint',
    concern: 'gesture',
    type: 'json',
    schema: GESTURES,
    unset: 'initial',
    kinds: 'all',
    internal: true,
  },

  // Input: what a field takes and how the keyboard helps, as HTML's input attributes.
  // Props join at the end: a recording names props by number (docs/devtools.md).
  type: {
    effect: 'paint',
    concern: 'input',
    type: 'enum',
    unset: { value: 'text' },
    kinds: FIELDS,
    values: ['text', 'password', 'email', 'number', 'tel', 'url', 'search'],
    doc: "HTML's input `type`: the keyboard, and `password` hides the text.",
  },
  inputMode: {
    effect: 'paint',
    concern: 'input',
    type: 'enum',
    unset: 'initial',
    kinds: FIELDS,
    values: ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'],
    typeName: { name: 'InputMode', doc: "A keyboard, by HTML's `inputmode` values." },
    doc: "HTML's `inputmode`: the keyboard to show instead of the type's; `none` shows none.",
  },
  autoComplete: {
    effect: 'paint',
    concern: 'input',
    type: 'enum',
    unset: 'initial',
    kinds: FIELDS,
    values: [
      'off',
      'username',
      'current-password',
      'new-password',
      'one-time-code',
      'email',
      'name',
      'given-name',
      'family-name',
      'tel',
      'street-address',
      'postal-code',
      'country-name',
      'cc-number',
    ],
    doc: "HTML's `autocomplete`: what the field holds, for autofill and the password manager.",
  },
  autoCapitalize: {
    effect: 'paint',
    concern: 'input',
    type: 'enum',
    unset: 'initial',
    kinds: FIELDS,
    values: ['none', 'sentences', 'words', 'characters'],
    doc: "HTML's `autocapitalize`. Unset, `sentences` for `text` and `search` fields and `none` for the others.",
  },
  maxLength: {
    effect: 'paint',
    concern: 'input',
    type: 'number',
    unset: 'initial',
    kinds: FIELDS,
    doc: "HTML's `maxlength`: the most UTF-16 code units the user can enter. Text the app sets is not cut.",
  },
  spellCheck: {
    effect: 'paint',
    concern: 'input',
    type: 'boolean',
    unset: 'initial',
    kinds: FIELDS,
    doc: "HTML's `spellcheck`, which also turns autocorrection on or off. Unset, on for `text` and `search` fields.",
  },

  // Layout's logical sides (docs/styles.md#right-to-left), last for the same reason.
  paddingInlineStart: {
    ...layout('length'),
    doc: 'Padding on the side lines start from: the left in `ltr`, the right in `rtl`.',
  },
  paddingInlineEnd: {
    ...layout('length'),
    doc: 'Padding on the side lines end at: the right in `ltr`, the left in `rtl`.',
  },
  marginInlineStart: {
    ...layout('lengthAuto'),
    doc: 'Margin on the side lines start from: the left in `ltr`, the right in `rtl`.',
  },
  marginInlineEnd: {
    ...layout('lengthAuto'),
    doc: 'Margin on the side lines end at: the right in `ltr`, the left in `rtl`.',
  },
  insetInlineStart: {
    ...layout('lengthAuto'),
    doc: '`left` in `ltr`, `right` in `rtl`.',
  },
  insetInlineEnd: {
    ...layout('lengthAuto'),
    doc: '`right` in `ltr`, `left` in `rtl`.',
  },
  lines: {
    effect: 'measure',
    concern: 'input',
    type: 'json',
    schema: LINES,
    unset: 'initial',
    kinds: FIELDS,
    ts: 'number | { min?: number; max?: number }',
    reactive: true,
    doc: 'Wraps the text over lines: a count sets the height, `{ min, max }` grows with the text (1 and no limit by default). Adding or removing it remounts the field.',
  },
  emitsSelection: {
    effect: 'paint',
    concern: 'input',
    type: 'boolean',
    unset: { value: false },
    kinds: FIELDS,
    internal: true,
  },
  selection: {
    effect: 'paint',
    concern: 'input',
    type: 'json',
    schema: SELECTION,
    unset: 'initial',
    kinds: FIELDS,
    ts: 'TextSelection',
    last: true,
    reports: {
      TextField: { event: 'selectionchange', fields: ['start', 'end'] },
      MultilineTextField: { event: 'selectionchange', fields: ['start', 'end'] },
    },
    doc: "The selected range, `{ start, end }` in UTF-16 offsets as HTML's `selectionStart` and `selectionEnd`; `start === end` is the caret. Two-way when given a signal; unset, the caret goes to the end.",
  },
  thumbhash: {
    effect: 'paint',
    concern: 'image',
    type: 'string',
    unset: 'initial',
    kinds: ['Image'],
    doc: 'A ThumbHash of the image, in base64: its blurred preview shows, over `placeholder`, until the image loads.',
  },
  paging: {
    effect: 'paint',
    concern: 'scroll',
    type: 'boolean',
    unset: { value: false },
    kinds: SCROLL_VIEWS,
    doc: 'Comes to rest a whole view length at a time; false by default.',
  },
  snapOffsets: {
    effect: 'paint',
    concern: 'scroll',
    type: 'json',
    schema: OFFSETS,
    unset: { value: [] },
    kinds: SCROLL_VIEWS,
    ts: 'readonly number[]',
    reactive: true,
    doc: 'Offsets in points where a drag comes to rest, besides the start and the end; ignored while paging.',
  },
  maxFontScale: {
    effect: 'measure',
    concern: 'text',
    type: 'number',
    unset: 'initial',
    kinds: ['Text'],
    doc: "The most the user's text size enlarges this text, as a factor of `fontSize`: at `1` it never grows past `fontSize`. No limit by default.",
  },
  // How the Router presents a route over the app (docs/navigation.md): a
  // sheet, a modal page at full height, or a cover of the whole screen.
  presentation: {
    effect: 'layout',
    concern: 'sheet',
    type: 'enum',
    unset: { value: 'sheet' },
    kinds: ['Sheet'],
    values: ['sheet', 'modal', 'fullScreen'],
    internal: true,
  },
  // A screen's header slot (docs/navigation.md#headers): its bar buttons as
  // `[{ label, icon, disabled, placement }]`, its large title, and its
  // search field as `{ placeholder }`.
  headerItems: {
    effect: 'layout',
    concern: 'navigation',
    type: 'json',
    schema: HEADER_ITEMS,
    unset: 'initial',
    kinds: ['NavigationScreen'],
    internal: true,
  },
  largeTitle: {
    effect: 'layout',
    concern: 'navigation',
    type: 'boolean',
    unset: { value: false },
    kinds: ['NavigationScreen'],
    internal: true,
  },
  search: {
    effect: 'layout',
    concern: 'navigation',
    type: 'json',
    schema: HEADER_SEARCH,
    unset: 'initial',
    kinds: ['NavigationScreen'],
    internal: true,
  },
  // A field with a `format` sends its edits as `format` events and reports
  // the change once a kernel has answered (docs/keyboard.md#formatting).
  formats: {
    effect: 'paint',
    concern: 'input',
    type: 'boolean',
    unset: { value: false },
    kinds: FIELDS,
    internal: true,
  },

  // Motion sources: the view sends its `motion` events (docs/motion.md#motion-sources).
  emitsMotion: {
    effect: 'paint',
    concern: 'motion',
    type: 'boolean',
    unset: { value: false },
    kinds: [...SCROLLABLE, 'Sheet', 'NavigationStack'],
    internal: true,
  },
} satisfies Record<string, PropSpec>;

export type NativePropName = keyof typeof PROP_SPECS;

export const PROPS: Readonly<Record<NativePropName, PropSpec>> = PROP_SPECS;

/** Payloads, by the name of the interface generated for each. */
export const PAYLOADS: Readonly<Record<string, Payload>> = {
  TouchPayload: { locationX: 'number', locationY: 'number', pageX: 'number', pageY: 'number' },
  TextPayload: { text: 'string' },
  TextSelection: { start: 'number', end: 'number' },
  TextEdit: { text: 'string', start: 'number', end: 'number' },
  ValuePayload: { value: 'boolean' },
  IndexPayload: { index: 'number' },
  ErrorPayload: { error: 'string' },
  ImageSizePayload: { width: 'number', height: 'number' },
  ScrollPayload: {
    x: 'number',
    y: 'number',
    contentWidth: 'number',
    contentHeight: 'number',
    layoutWidth: 'number',
    layoutHeight: 'number',
  },
  /**
   * Where a scrolling view is along its axis, in its scroll range; how fast it
   * moves, in points per second toward its end; and how far past an end it is
   * pulled, negative before the start (docs/motion.md#motion-sources).
   */
  ScrollMotionPayload: { offset: 'number', velocity: 'number', overscroll: 'number' },
  /**
   * How tall a sheet stands on screen, in points, and where that is between
   * its lowest snap point (0) and its highest (1); below 0 while dragged
   * toward closing (docs/motion.md#motion-sources).
   */
  SheetMotionPayload: { height: 'number', progress: 'number' },
  /** How far a back swipe has taken a stack's top screen away: 0 at rest, 1 gone. */
  BackMotionPayload: { progress: 'number' },
  AccessibilityActionPayload: { actionName: 'string' },
  BindCellsPayload: { cell: 'string', key: 'string' },
  ViewableKeysPayload: { first: 'string', last: 'string' },
  KeyboardFramePayload: {
    screenX: 'number',
    screenY: 'number',
    width: 'number',
    height: 'number',
    duration: 'number',
    easing: 'string',
  },
  /** How far the keyboard stands over the window's bottom, in points, this frame (docs/keyboard.md#keyboard). */
  KeyboardMotionPayload: { height: 'number' },
  AccessibilityStatusPayload: { screenReaderEnabled: 'boolean', reduceMotionEnabled: 'boolean' },
  DevtoolsSelectPayload: { view: 'number' },
  DevtoolsUpdatesPayload: { on: 'boolean' },
  /**
   * A gesture's state and the fields its kind reports (docs/motion.md),
   * React Native Gesture Handler's: a state change carries `oldState`; a
   * pan its translation and velocity; a pinch its scale and focal point; a
   * rotation its angle in radians and anchor; a long press its duration.
   */
  GesturePayload: {
    handlerTag: 'number',
    state: 'number',
    oldState: 'number?',
    numberOfPointers: 'number',
    pointerType: 'number',
    x: 'number?',
    y: 'number?',
    absoluteX: 'number?',
    absoluteY: 'number?',
    translationX: 'number?',
    translationY: 'number?',
    velocityX: 'number?',
    velocityY: 'number?',
    scale: 'number?',
    focalX: 'number?',
    focalY: 'number?',
    rotation: 'number?',
    anchorX: 'number?',
    anchorY: 'number?',
    velocity: 'number?',
    duration: 'number?',
  },
};

/**
 * The JSON objects an Image's `source` takes, by the interface generated for
 * each: a URL, or an image the compiler bundled into both shells
 * (docs/assets.md). The first field names the image, which both renderers
 * read; the kernel sizes the view from a bundled image's width and height.
 * A URL's headers go with its request; the caches key it by URL alone.
 */
export const IMAGE_SOURCES: Readonly<Record<string, ImageSourceFields>> = {
  RemoteImageSource: { uri: 'string', headers: 'headers?' },
  BundledImageSource: { asset: 'string', width: 'number', height: 'number' },
};

const SCROLL_PAYLOADS = {
  Scroll: 'ScrollPayload',
  HorizontalScroll: 'ScrollPayload',
  List: 'ScrollPayload',
  HorizontalList: 'ScrollPayload',
} as const;

const MOTION_SOURCES = {
  Scroll: 'ScrollMotionPayload',
  HorizontalScroll: 'ScrollMotionPayload',
  List: 'ScrollMotionPayload',
  HorizontalList: 'ScrollMotionPayload',
  Sheet: 'SheetMotionPayload',
  NavigationStack: 'BackMotionPayload',
} as const;

const SCROLL_SIGNALS = {
  Scroll: null,
  HorizontalScroll: null,
  List: null,
  HorizontalList: null,
};

const PRESS_PHASE = { Pressable: 'TouchPayload' } as const;

/** Events native views send, by name (`<id>.<event>`, docs/events.md). */
export const EVENTS: Readonly<Record<string, EventSpec>> = {
  press: { Pressable: 'TouchPayload', Button: null },
  pressin: PRESS_PHASE,
  pressout: PRESS_PHASE,
  longpress: PRESS_PHASE,
  change: { TextField: 'TextPayload', MultilineTextField: 'TextPayload', Toggle: 'ValuePayload' },
  submit: { TextField: 'TextPayload', MultilineTextField: 'TextPayload' },
  focus: { TextField: null, MultilineTextField: null },
  blur: { TextField: null, MultilineTextField: null },
  selectionchange: { TextField: 'TextSelection', MultilineTextField: 'TextSelection' },
  // The user's edit of a field with a `format`, which a kernel answers with the text it shows.
  format: { TextField: 'TextEdit', MultilineTextField: 'TextEdit' },
  loadstart: { Image: null },
  load: { Image: 'ImageSizePayload' },
  error: { Image: 'ErrorPayload', NavigationTab: 'ErrorPayload' },
  loadend: { Image: null },
  scroll: SCROLL_PAYLOADS,
  motion: MOTION_SOURCES,
  reachend: SCROLL_SIGNALS,
  // HTML's scrollend: where a scroll view came to rest, once per rest.
  scrollend: { Scroll: 'ScrollPayload', HorizontalScroll: 'ScrollPayload' },
  refresh: SCROLL_SIGNALS,
  close: { Sheet: null },
  snap: { Sheet: 'IndexPayload' },
  dismiss: { NavigationScreen: null },
  headeritem: { NavigationScreen: 'IndexPayload' },
  search: { NavigationScreen: 'TextPayload' },
  searchsubmit: { NavigationScreen: 'TextPayload' },
  select: { NavigationTabs: 'IndexPayload' },
  bind: { List: 'BindCellsPayload', HorizontalList: 'BindCellsPayload' },
  viewable: { List: 'ViewableKeysPayload', HorizontalList: 'ViewableKeysPayload' },
  accessibilityaction: { all: 'AccessibilityActionPayload' },
  gesture: { all: 'GesturePayload' },
};

/**
 * Events of the app rather than a view (handle 0), for app-wide state the
 * native side tracks: by target, sent as `<target>.<event>`.
 */
export const SYSTEM_EVENTS: Readonly<Record<string, Readonly<Record<string, string | null>>>> = {
  keyboard: {
    willshow: 'KeyboardFramePayload',
    didshow: 'KeyboardFramePayload',
    willhide: 'KeyboardFramePayload',
    didhide: 'KeyboardFramePayload',
    willchangeframe: 'KeyboardFramePayload',
    didchangeframe: 'KeyboardFramePayload',
    // Every frame the keyboard moves, once the app reads keyboard.height.
    move: 'KeyboardMotionPayload',
  },
  accessibility: { status: 'AccessibilityStatusPayload' },
  // Sent by the shells, not the renderers: the dev menu's element picker and
  // whether it highlights updates.
  devtools: { select: 'DevtoolsSelectPayload', updates: 'DevtoolsUpdatesPayload' },
  // Sent by the shells: the UI thread caught up with the batches it had fallen behind on.
  host: { idle: null },
};

/** React Native event props and the native event each one listens to. */
export const EVENT_PROPS: Readonly<Record<string, EventPropSpec>> = {
  onPress: { event: 'press' },
  onPressCapture: { event: 'press:capture' },
  onPressStart: { event: 'pressin' },
  onPressEnd: { event: 'pressout' },
  onLongPress: { event: 'longpress' },
  onChange: { event: 'change', value: true },
  onSubmit: { event: 'submit' },
  onFocus: { event: 'focus' },
  onBlur: { event: 'blur' },
  onLoadStart: { event: 'loadstart' },
  onLoad: { event: 'load' },
  onError: { event: 'error' },
  onLoadEnd: { event: 'loadend' },
  onScroll: { event: 'scroll', announce: 'emitsScroll', everyFrame: { scrollInterval: 0 } },
  onSelectionChange: { event: 'selectionchange', value: true, announce: 'emitsSelection' },
  onReachEnd: { event: 'reachend' },
  onScrollEnd: { event: 'scrollend' },
  onRefresh: { event: 'refresh', announce: 'refreshable' },
  onClose: { event: 'close' },
  onSnap: { event: 'snap' },
  // Navigation (docs/navigation.md): the platform removed a screen; the user
  // picked a tab, pressed a header item or searched from the header.
  onDismiss: { event: 'dismiss' },
  onHeaderItem: { event: 'headeritem' },
  onSearch: { event: 'search' },
  onSearchSubmit: { event: 'searchsubmit' },
  onSelect: { event: 'select' },
  onAction: { event: 'accessibilityaction' },
  // A native List's requests to List (docs/lists.md).
  onBindCells: { event: 'bind' },
  onViewableKeys: { event: 'viewable', announce: 'emitsViewable' },
  // The view's motion source: the event writes its motion values on the UI thread.
  motion: { event: 'motion', announce: 'emitsMotion', source: true },
};

export interface Manifest {
  kinds: Readonly<Record<Kind, KindSpec>>;
  props: Readonly<Record<string, PropSpec>>;
  payloads: Readonly<Record<string, Payload>>;
  imageSources: Readonly<Record<string, ImageSourceFields>>;
  events: Readonly<Record<string, EventSpec>>;
  systemEvents: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
  eventProps: Readonly<Record<string, EventPropSpec>>;
  modules: ModuleProtocol;
  devLink: DevLinkProtocol;
}

export const MANIFEST: Manifest = {
  kinds: KINDS,
  props: PROPS,
  payloads: PAYLOADS,
  imageSources: IMAGE_SOURCES,
  events: EVENTS,
  systemEvents: SYSTEM_EVENTS,
  eventProps: EVENT_PROPS,
  modules: MODULES,
  devLink: DEV_LINK,
};
