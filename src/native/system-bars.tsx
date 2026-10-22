import type { KuitoNode } from '../ui/jsx';
import { report } from './scope';
import {
  BAR_PROPS,
  STATUS_BAR_PROPS,
  initialSystemBars,
  mergeSystemBars,
  systemBarsCalls,
  type StatusBarOptions,
  type SystemBarsCall,
  type SystemBarsMethod,
  type SystemBarsProps,
  type SystemBarsSender,
  type SystemBarsState,
} from './system-bars-stack';
import { hexColor, systemUI } from './system-ui';

/** A pushed set of props: a mounted SystemBars', or a route's (src/ui/navigation.tsx). */
export interface SystemBarsStackEntry {
  readonly props: SystemBarsProps;
}

interface VStack {
  entries: SystemBarsStackEntry[];
  /** The bars as the app launched; read when something first crosses. */
  launch: SystemBarsState | null;
  /** What the platform shows; null while the app hasn't changed it. */
  applied: SystemBarsState | null;
  scheduled: boolean;
}

declare global {
  var __kuitoSystemBarsStack: VStack | undefined;
}

/**
 * A Live Patch runs the app's bundle again, while mounted SystemBars keep
 * their entries; the stack lives beside the bundle so they stay in it.
 */
const stack = (): VStack =>
  (globalThis.__kuitoSystemBarsStack ??= {
    entries: [],
    launch: null,
    applied: null,
    scheduled: false,
  });

/** kuito.config.ts may have hidden the status bar. */
function launched(): SystemBarsState {
  const { statusBar } = initialSystemBars;
  const hidden = { ...statusBar.hidden, value: systemUI.statusBarHiddenAtLaunch() };

  return { ...initialSystemBars, statusBar: { ...statusBar, hidden } };
}

const sets = ({ statusBar, ...bars }: SystemBarsProps) =>
  Object.keys(bars).length > 0 || (statusBar !== undefined && Object.keys(statusBar).length > 0);

const sender: SystemBarsSender = systemUI;

function send<M extends SystemBarsMethod>(call: SystemBarsCall<M>): Promise<void> {
  return sender[call.method](...call.args);
}

/** The one writer: what the stack now merges to, less what the platform already shows. */
function apply() {
  const current = stack();

  current.scheduled = false;

  // Until something is set, nothing crosses: a Router whose routes leave the
  // bars alone runs without the module.
  if (!current.applied && !current.entries.some((e) => sets(e.props))) return;

  const launch = (current.launch ??= launched());
  const next = mergeSystemBars(
    launch,
    current.entries.map((entry) => entry.props),
  );

  systemBarsCalls(current.applied ?? launch, next).forEach((call) =>
    send(call).catch(report('SystemBars could not ' + call.method)),
  );

  current.applied = next;
}

/** Changes made together, as a screen's SystemBars mounting, cross once. */
function schedule() {
  const current = stack();

  if (current.scheduled) return;

  current.scheduled = true;
  void Promise.resolve().then(apply);
}

/** `keys` of `props`, without the ones left out or `undefined`. */
function pick<T extends object>(props: T, keys: readonly (keyof T)[]): Partial<T> {
  const result: Partial<T> = {};

  keys.forEach((key) => {
    if (props[key] !== undefined) result[key] = props[key];
  });

  return result;
}

const checkColor = (
  props: { backgroundColor?: string; navigationBarColor?: string },
  prefix: string,
) => {
  if (props.backgroundColor !== undefined)
    props.backgroundColor = hexColor(props.backgroundColor, prefix + 'backgroundColor must be');

  if (props.navigationBarColor !== undefined)
    props.navigationBarColor = hexColor(
      props.navigationBarColor,
      prefix + 'navigationBarColor must be',
    );
};

/** The props as given, without the ones left out, the colors checked. */
function own(props: SystemBarsProps): SystemBarsProps {
  const result = pick(props, [...BAR_PROPS, 'immersive']);

  if (props.statusBar !== undefined) {
    if (typeof props.statusBar !== 'object' || props.statusBar === null)
      throw new TypeError('SystemBars statusBar must be an object of status bar props');

    const statusBar: StatusBarOptions = pick(props.statusBar, STATUS_BAR_PROPS);

    checkColor(statusBar, 'SystemBars statusBar.');
    result.statusBar = statusBar;
  }

  checkColor(result, 'SystemBars ');

  return result;
}

export function pushStackEntry(props: SystemBarsProps): SystemBarsStackEntry {
  const entry = { props: own(props) };

  stack().entries.push(entry);
  schedule();

  return entry;
}

export function popStackEntry(entry: SystemBarsStackEntry): void {
  const current = stack();

  current.entries = current.entries.filter((each) => each !== entry);
  schedule();
}

/** A new entry in `entry`'s place; an entry already popped stays out. */
export function replaceStackEntry(
  entry: SystemBarsStackEntry,
  props: SystemBarsProps,
): SystemBarsStackEntry {
  const current = stack();
  const replacement = { props: own(props) };

  current.entries = current.entries.map((each) => (each === entry ? replacement : each));
  schedule();

  return replacement;
}

/**
 * The system bars and root view around the app, declared for as long as it
 * is mounted (docs/system-ui.md): the last mounted SystemBars wins each prop
 * it sets, and unmounting gives it back. A prop that names chrome a platform
 * doesn't have, as the navigation bar on iOS, does nothing there.
 */
function SystemBarsComponent(props: SystemBarsProps): KuitoNode {
  const kuito = globalThis.__kuito;

  if (!kuito) throw new Error('SystemBars requires the Kuito runtime');

  const entry = kuito.useRef<SystemBarsStackEntry>();

  kuito.useLifecycle('mount', () => {
    entry.current = pushStackEntry(props);

    return () => {
      if (entry.current) popStackEntry(entry.current);

      entry.current = null;
    };
  });

  // Reads every prop, so a change replaces the entry where it stands.
  kuito.useLifecycle('effect', () => {
    const next = own(props);

    if (entry.current) entry.current = replaceStackEntry(entry.current, next);
  });

  return null;
}

/** `fn` with `statics` as its properties, getters kept as getters (Object.assign would read them). */
function withStatics<F extends object, S extends object>(fn: F, statics: S): F & S {
  return Object.defineProperties(fn, Object.getOwnPropertyDescriptors(statics)) as never;
}

// Pure: it gives this module's own function its statics, so a bundle that never renders SystemBars drops it.
/**
 * The system chrome around the app, declared for as long as it is mounted: the
 * status bar, the root view's color, Android's navigation bar, immersive mode
 * and iOS's home indicator. The last mounted one wins each prop it sets.
 */
export const SystemBars = /* @__PURE__ */ withStatics(SystemBarsComponent, {
  /** Android: the status bar's height in dp. Null on iOS. */
  get statusBarHeight(): number | null {
    return systemUI.statusBarHeight();
  },
});
