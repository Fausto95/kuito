/*
 * The SystemBars stack as values: every mounted <SystemBars> is an entry,
 * the last entry that sets a prop wins it, and only what differs from what
 * the platform shows crosses. Each status bar prop keeps the `animated` of
 * the entry that set it, so giving a prop back to the entry below animates
 * as that entry asked. Imports nothing (docs/system-ui.md).
 */

/** The color of the bar's content: the system's choice, or light or dark. */
export type StatusBarContent = 'auto' | 'light' | 'dark';

export type StatusBarTransition = 'none' | 'fade' | 'slide';

/** Light buttons for a dark navigation bar, dark buttons for a light one. */
export type NavigationBarButtonStyle = 'light' | 'dark';

/** The SystemUI module's names for each content color. */
const NATIVE_STYLES = {
  auto: 'default',
  light: 'light-content',
  dark: 'dark-content',
} as const satisfies Record<StatusBarContent, string>;

/** SystemBars' `statusBar` part. */
export type StatusBarOptions = {
  /** The color of the status bar's text and icons. */
  content?: StatusBarContent;
  hidden?: boolean;
  /** Whether changes to content, hidden and backgroundColor animate. */
  animated?: boolean;
  /** iOS: how showing and hiding animates, when animated. */
  transition?: StatusBarTransition;
  /** Android: drawn behind the status bar; a hex color. */
  backgroundColor?: string;
  /** Android: false lays the app out below the status bar instead of under it. */
  translucent?: boolean;
};

/**
 * Props of `SystemBars`, and a route's `systemBars`: what the system chrome
 * around the app shows while they hold.
 */
export type SystemBarsProps = {
  /** The status bar's content color, visibility and, on Android, color. */
  statusBar?: StatusBarOptions;
  /** The root view's color, seen behind the app's views. */
  backgroundColor?: string;
  /** Android: drawn behind the navigation bar. */
  navigationBarColor?: string;
  /** Android: light buttons for a dark navigation bar, dark buttons for a light one. */
  navigationBarButtonStyle?: NavigationBarButtonStyle;
  /** Android: hides the navigation bar; a swipe from the edge shows it for a moment. */
  navigationBarHidden?: boolean;
  /**
   * Full screen: hides the status bar, the navigation bar and the home
   * indicator, and on iOS edge swipes reach the app first. The entry's own
   * props, and later entries, win over what it hides.
   */
  immersive?: boolean;
  /** iOS: lets the home indicator fade out while the user doesn't touch the screen. */
  homeIndicatorAutoHidden?: boolean;
};

/** What the status bar shows, each prop with how its last change animates. */
export type StatusBarState = {
  content: { value: StatusBarContent; animated: boolean };
  hidden: { value: boolean; animated: boolean; transition: StatusBarTransition };
  backgroundColor: { value: string; animated: boolean };
  translucent: boolean;
};

/** What the bars show. */
export type SystemBarsState = {
  statusBar: StatusBarState;
  /** Null is the shell's own root color. */
  backgroundColor: string | null;
  navigationBarColor: string;
  navigationBarButtonStyle: NavigationBarButtonStyle | 'default';
  navigationBarHidden: boolean;
  homeIndicatorAutoHidden: boolean;
  /** iOS: edge swipes reach the app before the system's gestures. */
  screenEdgesDeferred: boolean;
};

/** The platform's bars before the app changes them: the shell's own. */
export const initialSystemBars: SystemBarsState = {
  statusBar: {
    content: { value: 'auto', animated: false },
    hidden: { value: false, animated: false, transition: 'fade' },
    backgroundColor: { value: '#00000000', animated: false },
    translucent: true,
  },
  backgroundColor: null,
  navigationBarColor: '#00000000',
  navigationBarButtonStyle: 'default',
  navigationBarHidden: false,
  homeIndicatorAutoHidden: false,
  screenEdgesDeferred: false,
};

function applyStatusBar(state: StatusBarState, entry: StatusBarOptions): StatusBarState {
  const animated = entry.animated === true;

  return {
    content: entry.content === undefined ? state.content : { value: entry.content, animated },
    hidden:
      entry.hidden === undefined
        ? state.hidden
        : { value: entry.hidden, animated, transition: entry.transition ?? 'fade' },
    backgroundColor:
      entry.backgroundColor === undefined
        ? state.backgroundColor
        : { value: entry.backgroundColor, animated },
    translucent: entry.translucent ?? state.translucent,
  };
}

/** The props that set a bar of their own name. */
export const BAR_PROPS = [
  'backgroundColor',
  'navigationBarColor',
  'navigationBarButtonStyle',
  'navigationBarHidden',
  'homeIndicatorAutoHidden',
] as const satisfies readonly (keyof SystemBarsProps & keyof SystemBarsState)[];

export const STATUS_BAR_PROPS = [
  'content',
  'hidden',
  'animated',
  'transition',
  'backgroundColor',
  'translucent',
] as const satisfies readonly (keyof StatusBarOptions)[];

/**
 * `entry` laid over `state`: the props it sets replace theirs. Immersive is
 * what it hides, animated, under the entry's own props, so the stack's
 * order alone decides each bar; false sets nothing.
 */
function applyEntry(state: SystemBarsState, entry: SystemBarsProps): SystemBarsState {
  const { statusBar = {} } = entry;
  const hides = entry.immersive === true;
  const next: SystemBarsState = hides
    ? {
        ...state,
        navigationBarHidden: true,
        homeIndicatorAutoHidden: true,
        screenEdgesDeferred: true,
      }
    : { ...state };

  BAR_PROPS.forEach((key) => {
    if (entry[key] !== undefined) Object.assign(next, { [key]: entry[key] });
  });

  return {
    ...next,
    statusBar: applyStatusBar(
      state.statusBar,
      hides ? { hidden: true, animated: true, ...statusBar } : statusBar,
    ),
  };
}

export function mergeSystemBars(
  defaults: SystemBarsState,
  entries: readonly SystemBarsProps[],
): SystemBarsState {
  return entries.reduce(applyEntry, defaults);
}

/** The SystemUI module's functions SystemBars calls, by their arguments. */
type Methods = {
  setStatusBarStyle: [(typeof NATIVE_STYLES)[StatusBarContent], boolean];
  setStatusBarHidden: [boolean, StatusBarTransition];
  setStatusBarBackgroundColor: [string, boolean];
  setStatusBarTranslucent: [boolean];
  setBackgroundColor: [string | null];
  setNavigationBarColor: [string];
  setNavigationBarButtonStyle: [NavigationBarButtonStyle | 'default'];
  setNavigationBarHidden: [boolean];
  setHomeIndicatorAutoHidden: [boolean];
  setScreenEdgesDeferred: [boolean];
};

export type SystemBarsMethod = keyof Methods;

/** A SystemUI call; `M` keeps a call's method and arguments together for the one that sends it. */
export type SystemBarsCall<M extends SystemBarsMethod = SystemBarsMethod> = {
  [K in M]: { method: K; args: Methods[K] };
}[M];

export type SystemBarsSender = { [K in SystemBarsMethod]: (...args: Methods[K]) => Promise<void> };

/** A bar's plain value, as `call` sends it when it changes. */
const bar =
  <K extends Exclude<keyof SystemBarsState, 'statusBar'>>(
    key: K,
    call: (value: SystemBarsState[K]) => SystemBarsCall,
  ) =>
  (from: SystemBarsState, to: SystemBarsState) =>
    Object.is(from[key], to[key]) ? null : call(to[key]);

const calls: ((from: SystemBarsState, to: SystemBarsState) => SystemBarsCall | null)[] = [
  ({ statusBar: from }, { statusBar: { content } }) =>
    from.content.value === content.value
      ? null
      : { method: 'setStatusBarStyle', args: [NATIVE_STYLES[content.value], content.animated] },
  ({ statusBar: from }, { statusBar: { hidden } }) =>
    from.hidden.value === hidden.value
      ? null
      : {
          method: 'setStatusBarHidden',
          args: [hidden.value, hidden.animated ? hidden.transition : 'none'],
        },
  ({ statusBar: from }, { statusBar: { backgroundColor } }) =>
    from.backgroundColor.value === backgroundColor.value
      ? null
      : {
          method: 'setStatusBarBackgroundColor',
          args: [backgroundColor.value, backgroundColor.animated],
        },
  ({ statusBar: from }, { statusBar: { translucent } }) =>
    from.translucent === translucent
      ? null
      : { method: 'setStatusBarTranslucent', args: [translucent] },
  bar('backgroundColor', (color) => ({ method: 'setBackgroundColor', args: [color] })),
  bar('navigationBarColor', (color) => ({ method: 'setNavigationBarColor', args: [color] })),
  bar('navigationBarButtonStyle', (style) => ({
    method: 'setNavigationBarButtonStyle',
    args: [style],
  })),
  bar('navigationBarHidden', (hidden) => ({ method: 'setNavigationBarHidden', args: [hidden] })),
  bar('homeIndicatorAutoHidden', (hidden) => ({
    method: 'setHomeIndicatorAutoHidden',
    args: [hidden],
  })),
  bar('screenEdgesDeferred', (deferred) => ({
    method: 'setScreenEdgesDeferred',
    args: [deferred],
  })),
];

/** What takes the platform from showing `from` to showing `to`. */
export function systemBarsCalls(from: SystemBarsState, to: SystemBarsState): SystemBarsCall[] {
  return calls.flatMap((call) => call(from, to) ?? []);
}
