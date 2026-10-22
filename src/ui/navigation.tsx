/**
 * Built-in navigation: routes declared in JSX, shown in native stacks and tab
 * bars (docs/navigation.md). The Router reads its children as the route table
 * and keeps the navigation state; screens are native stack entries, keyed so
 * each keeps its component while others are pushed above it. Routes are
 * values: `routes.show({ id })` names one, and only deep links are URLs.
 */
import {
  adapt,
  back,
  dismiss,
  entryKeys,
  focused,
  initialState,
  linkDestination,
  linkPath,
  navigate as navigateState,
  present as presentState,
  selectTab,
  type Entry,
  type NavigationState,
  type ParamKind,
  type ParamValue,
  type Presentation,
  type RouteSpec,
  type RouteTable,
} from '../runtime/routes';
import { primitive, type Component, type KuitoElement, type KuitoNode } from './jsx';
import {
  Sheet,
  Pressable,
  type PressableProps,
  type SheetProps,
  type SnapPoint,
} from './primitives';
import { Show } from './flow';
import type { Motion, SheetMotion } from './motion';
import { url } from '../native/linking';
import {
  popStackEntry,
  pushStackEntry,
  replaceStackEntry,
  type SystemBarsStackEntry,
} from '../native/system-bars';
import type { SystemBarsProps } from '../native/system-bars-stack';

export type { ParamValue, Presentation };

/** A route's params: what its screen receives, and what a deep link's text parses into. */
export type RouteParams = { readonly [name: string]: ParamValue };

declare const resultType: unique symbol;

/**
 * What to show: a route by name and its params, as `routes.show({ id: 42 })`
 * makes it. `R` is what its screen dismisses with, for `present`.
 */
export interface Destination<R = unknown> {
  readonly route: string;
  readonly params: RouteParams;
  /** Types only: the screen's result. */
  readonly [resultType]?: R;
}

/** One route of `routes`: its params in, a destination out; no argument without params. */
export type RouteTo<P extends object = {}, R = undefined> = {} extends P
  ? (params?: P) => Destination<R>
  : (params: P) => Destination<R>;

/**
 * The app's routes by name. File-based routes declare them in the
 * `routes.generated.d.ts` the compiler writes beside them; a Router written
 * in JSX declares its own (docs/navigation.md).
 */
export interface Routes {}

/**
 * Every route by name: `routes.show({ id: 42 })`. Any name makes a
 * destination; navigating to one no route has is the error.
 */
export const routes: Routes = new Proxy(
  {},
  {
    get: (_, name) =>
      typeof name === 'string'
        ? (params: RouteParams = {}): Destination => ({ route: name, params })
        : undefined,
  },
) as never;

/** What a screen receives: its params, and `dismiss` to close it with a result. */
export type ScreenProps<P extends object = {}, R = undefined> = P & {
  /** Closes this screen; the `present` that showed it resolves with `result`. */
  dismiss: (result?: R) => void;
  /**
   * How far a back swipe has taken its stack's top screen away: 0 at rest,
   * 1 gone, every frame on the UI thread (docs/navigation.md#motion). It
   * stays 0 for a presented screen; a screen rendered outside a Router has none.
   */
  back?: Motion<number>;
  /** The sheet a screen presented as a sheet shows in, as it moves (docs/navigation.md#motion). */
  sheet?: SheetMotion;
};

/** A button in a screen's header, drawn by the platform. */
export interface HeaderItem {
  /** What it says; with an icon, what a screen reader reads. */
  label: string;
  /** A symbol shown instead of the label: an SF Symbol on iOS, a Material Symbol on Android. */
  icon?: string | { ios?: string; android?: string };
  onPress: () => void;
  disabled?: boolean;
}

/** The search field a screen's header carries. */
export interface HeaderSearch {
  placeholder?: string;
  /** The text as the user types it. */
  onChange: (text: string) => void;
  /** The user pressed the search key. */
  onSubmit?: (text: string) => void;
}

/** A screen's native header: its buttons on either side, a large title and a search field. */
export interface ScreenHeader {
  /** Before the title, in reading order; after the back button on iOS. */
  leading?: readonly HeaderItem[];
  /** After the title. */
  trailing?: readonly HeaderItem[];
  /** The title shown large under the bar. */
  largeTitle?: boolean;
  search?: HeaderSearch;
}

/** How a link's text parses into a param: as `String` (the default), `Number` or `Boolean`. */
export type ParamType = StringConstructor | NumberConstructor | BooleanConstructor;

/** Props of `Route`: its name and path, its screen, and how the screen is presented. */
export interface RouteProps<P extends object = {}, R = undefined> {
  /** Its key in `routes`. */
  name: string;
  /** Segments, `:name` params and a final `*name`: what a deep link's path matches. */
  path: string;
  /** How a link's text parses into each param; a path param left out is a string. */
  params?: { [K in keyof P]?: ParamType };
  screen: Component<ScreenProps<P, R>>;
  /** The native header's title. */
  title?: string | ((params: P) => string);
  presentation?: Presentation;
  /** The screen's color, under the bars too; the platform's background without. */
  backgroundColor?: string;
  /** A sheet route's heights, as `<Sheet snapPoints>` takes them; the platform's default without. */
  snapPoints?: readonly SnapPoint[];
  /** The native header: false hides it; its items, large title and search otherwise (docs/navigation.md#headers). */
  header?: false | ScreenHeader | ((params: P) => false | ScreenHeader);
  /** The system bars while this screen is focused, as a `<SystemBars>`'s props (docs/system-ui.md). */
  systemBars?: SystemBarsProps;
}

/** What a route file exports as `options`: its Route's props but name, path, params and screen. */
export type RouteOptions<P extends object = {}> = Omit<
  RouteProps<P>,
  'name' | 'path' | 'params' | 'screen'
>;

/** Props of `Tab`: its name, title and icon in the tab bar, and its routes. */
export interface TabProps {
  name: string;
  title: string;
  /**
   * The platform's symbol name: an SF Symbol on iOS, a Material Symbol on
   * Android. `{ ios, android }` names one per platform; `{ uri }` is any image
   * (docs/navigation.md).
   */
  icon?: TabIcon;
  children: KuitoNode;
}

export type TabIcon = string | { ios?: string; android?: string } | { uri: string };

/** Props of `Router`: the first destination, deep links, and the routes. */
export interface RouterProps {
  /** The first screen shown; the first route's by default. */
  initial?: Destination;
  /**
   * Deep links: the link that launched the app, and each one that arrives
   * while it runs, navigate to the route their path matches. Off by default.
   */
  linking?: boolean;
  children: KuitoNode;
}

interface VStackProps {
  children?: KuitoNode;
}

/** A header item as the renderers take it: which side, and no handler. */
interface HeaderItemView {
  label: string;
  icon?: HeaderItem['icon'];
  disabled?: boolean;
  placement: 'leading' | 'trailing';
}

interface ScreenViewProps {
  title: string;
  header: boolean;
  headerItems?: readonly HeaderItemView[];
  largeTitle?: boolean;
  search?: { placeholder?: string };
  backgroundColor?: string;
  onDismiss: () => void;
  onHeaderItem?: (event: { index: number }) => void;
  onSearch?: (event: { text: string }) => void;
  onSearchSubmit?: (event: { text: string }) => void;
  children?: KuitoNode;
}

/** A Sheet that presents a modal or full-screen route rather than a sheet. */
interface PresentedViewProps extends SheetProps {
  presentation: Exclude<Presentation, 'push'>;
}

interface TabsViewProps {
  selectedIndex: number;
  onSelect: (event: { index: number }) => void;
  children?: KuitoNode;
}

interface TabViewProps {
  title: string;
  icon?: TabIcon;
  onError: (event: { error: string }) => void;
  children?: KuitoNode;
}

interface StackViewProps extends VStackProps {
  /** How far a back swipe has taken its top screen away, as the platform draws it. */
  motion?: BackMotion;
}

/** A stack's motion source: its back swipe's progress. */
interface BackMotion {
  readonly progress: Motion<number>;
}

const NavigationStack = primitive<StackViewProps>('NavigationStack');
const NavigationScreen = primitive<ScreenViewProps>('NavigationScreen');
const NavigationTabs = primitive<TabsViewProps>('NavigationTabs');
const NavigationTab = primitive<TabViewProps>('NavigationTab');
const PresentedSheet = primitive<PresentedViewProps>('Sheet');

interface SheetRouteProps {
  snapPoints?: readonly SnapPoint[];
  onClose: () => void;
  /** The screen, given the sheet's motion. */
  render: (sheet: SheetMotion) => KuitoNode;
}

/** A route presented as a sheet: its screen reads the sheet's motion as `sheet`. */
function SheetRoute(props: SheetRouteProps): KuitoNode {
  const kuito = globalThis.__kuito;

  if (!kuito) throw new Error('A sheet route must render inside the Kuito runtime');

  const sheet = kuito.useMotionSource('Sheet', 'sheet');

  return (
    <Sheet
      open
      motion={sheet}
      {...(props.snapPoints && { snapPoints: props.snapPoints })}
      onClose={props.onClose}
    >
      {props.render(sheet)}
    </Sheet>
  );
}

const PRESENTATIONS: readonly Presentation[] = ['push', 'sheet', 'modal', 'fullScreen'];

function presentationOf(value: unknown, where: string): Presentation {
  if (value === undefined) return 'push';

  if (!PRESENTATIONS.includes(value as Presentation))
    throw new TypeError(where + " presentation must be 'push', 'sheet', 'modal' or 'fullScreen'");

  return value as Presentation;
}

function outside(name: string): never {
  throw new Error('<' + name + '> belongs inside a <Router>');
}

/** A route: what `routes[name]` shows. Only meaningful inside a Router. */
export function Route<P extends object, R>(_props: RouteProps<P, R>): KuitoNode {
  return outside('Route');
}

/** A native tab bar; each Tab is a stack of its own. */
export function Tabs(_props: { children: KuitoNode }): KuitoNode {
  return outside('Tabs');
}

/** One tab of `Tabs`: a stack of its own routes, kept while the user switches tabs. */
export function Tab(_props: TabProps): KuitoNode {
  return outside('Tab');
}

interface ScreenSpec {
  /** Its params are spread over `dismiss`. */
  screen: Component<{
    dismiss: (result?: unknown) => void;
    back?: Motion<number>;
    sheet?: SheetMotion;
  }>;
  title?: string | ((params: RouteParams) => string);
  header: false | ScreenHeader | ((params: RouteParams) => false | ScreenHeader);
  systemBars: SystemBarsProps;
  snapPoints?: readonly SnapPoint[];
  backgroundColor?: string;
}

interface Table {
  routes: RouteTable;
  /** Each route's screen and options: from its props, or from its module once it shows. */
  screens: Array<() => ScreenSpec>;
  tabs: Array<{ name: string; title: string; icon?: TabIcon }>;
}

function isElement(value: unknown): value is KuitoElement {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value;
}

function elements(children: unknown): KuitoElement[] {
  if (Array.isArray(children)) return children.flatMap(elements);

  return isElement(children) ? [children] : [];
}

/**
 * A prop as written: compiled JSX hands expressions over as thunks the kernel
 * marked, which a component (also a function) is not.
 */
function read(value: unknown): unknown {
  return typeof value === 'function' && '__kuitoExprKey' in value ? value() : value;
}

function text(value: unknown, what: string): string {
  const given = read(value);

  if (typeof given !== 'string') throw new TypeError(what + ' must be a string');

  return given;
}

const isText = (value: unknown) => typeof value === 'string';

function tabIcon(value: unknown, tab: string): TabIcon | undefined {
  if (value === undefined || typeof value === 'string') return value;

  if (typeof value === 'object' && value !== null) {
    if ('uri' in value && isText(value.uri)) return { uri: value.uri as string };

    const names = value as { ios?: unknown; android?: unknown };
    const keys = Object.keys(value);

    if (
      keys.length > 0 &&
      keys.every((key) => key === 'ios' || key === 'android') &&
      (names.ios === undefined || isText(names.ios)) &&
      (names.android === undefined || isText(names.android))
    )
      return names as TabIcon;
  }

  throw new TypeError(
    '<Tab name="' + tab + '"> icon must be a symbol name, { ios, android } or { uri }',
  );
}

const isSymbol = (value: unknown) =>
  typeof value === 'string' ||
  (typeof value === 'object' &&
    value !== null &&
    Object.entries(value).every(
      ([key, name]) => (key === 'ios' || key === 'android') && isText(name),
    ));

/** `value` as an object of `keys` alone, each of which `valid` accepts when given. */
function fields(
  value: unknown,
  valid: Readonly<Record<string, (field: unknown) => boolean>>,
  what: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError(what + ' must be an object');

  Object.entries(value).forEach(([key, field]) => {
    const check = valid[key];

    if (!check)
      throw new TypeError(what + ' has no ' + key + '; it takes ' + Object.keys(valid).join(', '));

    if (field !== undefined && !check(field))
      throw new TypeError(what + "'s " + key + ' is not valid');
  });

  return value as Record<string, unknown>;
}

const isFunction = (value: unknown) => typeof value === 'function';
const isFlag = (value: unknown) => typeof value === 'boolean';

const ITEM_FIELDS = { label: isText, icon: isSymbol, onPress: isFunction, disabled: isFlag };
const SEARCH_FIELDS = { placeholder: isText, onChange: isFunction, onSubmit: isFunction };
const HEADER_FIELDS = {
  leading: Array.isArray,
  trailing: Array.isArray,
  largeTitle: isFlag,
  search: (value: unknown) => typeof value === 'object' && value !== null,
};

/** A side's items, checked, as the renderers take them. */
function headerItems(
  value: unknown,
  placement: HeaderItemView['placement'],
  where: string,
): Array<{ view: HeaderItemView; onPress: () => void }> {
  if (value === undefined) return [];

  const what = where + " header's " + placement + ' items';

  return (value as unknown[]).map((given) => {
    const item = fields(given, ITEM_FIELDS, what);

    if (item.label === undefined || item.onPress === undefined)
      throw new TypeError(what + ' each need a label and an onPress');

    const { label, icon, disabled, onPress } = item as unknown as HeaderItem;

    return {
      view: {
        label,
        ...(icon !== undefined && { icon }),
        ...(disabled === true && { disabled: true }),
        placement,
      },
      onPress,
    };
  });
}

/** A screen's header, checked: whether it shows, its items in order, large title and search. */
interface ShownHeader {
  shown: boolean;
  items: Array<{ view: HeaderItemView; onPress: () => void }>;
  largeTitle: boolean;
  search?: HeaderSearch;
}

function screenHeader(header: unknown, where: string): ShownHeader {
  if (header === false) return { shown: false, items: [], largeTitle: false };

  const options = fields(header, HEADER_FIELDS, where + ' header') as ScreenHeader;
  const search = options.search;

  if (search !== undefined) {
    fields(search, SEARCH_FIELDS, where + " header's search");

    if (search.onChange === undefined)
      throw new TypeError(where + " header's search needs an onChange");
  }

  return {
    shown: true,
    items: [
      ...headerItems(options.leading, 'leading', where),
      ...headerItems(options.trailing, 'trailing', where),
    ],
    largeTitle: options.largeTitle === true,
    ...(search && { search }),
  };
}

const KINDS = new Map<unknown, ParamKind>([
  [String, 'string'],
  [Number, 'number'],
  [Boolean, 'boolean'],
]);

function paramKinds(value: unknown, route: string): Record<string, ParamKind> {
  if (value === undefined) return {};

  if (typeof value !== 'object' || value === null)
    throw new TypeError(
      '<Route name="' + route + '"> params must be an object of String, Number or Boolean',
    );

  return Object.fromEntries(
    Object.entries(value).map(([name, type]) => {
      const kind = KINDS.get(type);

      if (!kind)
        throw new TypeError(
          '<Route name="' + route + '"> param ' + name + ' must be String, Number or Boolean',
        );

      return [name, kind];
    }),
  );
}

/** A route's screen and its options, checked: from its props, or its module's exports. */
function screenSpec(where: string, screen: unknown, props: Record<string, unknown>): ScreenSpec {
  const title = read(props.title);
  const systemBars = read(props.systemBars);

  if (typeof screen !== 'function') throw new TypeError(where + ' needs a screen');

  if (title !== undefined && typeof title !== 'string' && typeof title !== 'function')
    throw new TypeError(where + ' title must be a string or a function');

  if (systemBars !== undefined && (typeof systemBars !== 'object' || systemBars === null))
    throw new TypeError(where + " systemBars must be a SystemBars' props");

  const header = read(props.header);

  if (
    header !== undefined &&
    header !== false &&
    typeof header !== 'function' &&
    (typeof header !== 'object' || header === null)
  )
    throw new TypeError(
      where + " header must be false, a header's options or a function of the params",
    );

  const snapPoints = read(props.snapPoints);
  const backgroundColor = read(props.backgroundColor);

  if (backgroundColor !== undefined && typeof backgroundColor !== 'string')
    throw new TypeError(where + ' backgroundColor must be a color, like #08080b');

  if (snapPoints !== undefined && !Array.isArray(snapPoints))
    throw new TypeError(where + ' snapPoints must be an array, as <Sheet snapPoints> takes');

  return {
    screen: screen as never,
    title: title as never,
    header: (header ?? {}) as ScreenSpec['header'],
    systemBars: (systemBars ?? {}) as SystemBarsProps,
    ...(snapPoints && { snapPoints: snapPoints as readonly SnapPoint[] }),
    ...(backgroundColor !== undefined && { backgroundColor }),
  };
}

/** The route table, from the Router's children. */
function readTable(children: unknown): Table {
  const table: Table = { routes: { tabs: [], routes: [] }, screens: [], tabs: [] };
  const routes: RouteSpec[] = [];

  const addRoute = (element: KuitoElement, tab: number | null) => {
    const props = element.props;
    const name = text(props.name, '<Route> name');
    const path = text(props.path, '<Route name="' + name + '"> path');
    const load = read(props.load);
    const where = '<Route name="' + name + '">';
    const presentation = presentationOf(read(props.presentation), where);

    if (routes.some((spec) => spec.name === name))
      throw new TypeError('Two routes are named ' + name + '; a name is its key in routes');

    routes.push({
      name,
      path,
      params: paramKinds(read(props.params), name),
      tab: presentation === 'push' ? tab : null,
      presentation,
    });

    if (typeof load !== 'function') {
      const spec = screenSpec(where, read(props.screen), props);

      table.screens.push(() => spec);

      return;
    }

    table.screens.push(() => {
      const module: unknown = load();

      if (typeof module !== 'object' || module === null)
        throw new TypeError(where + "'s module did not load");

      const options = 'options' in module ? module.options : undefined;

      if (options !== undefined && (typeof options !== 'object' || options === null))
        throw new TypeError(where + "'s options must be an object");

      return screenSpec(
        where,
        'default' in module ? module.default : undefined,
        (options ?? {}) as Record<string, unknown>,
      );
    });
  };

  elements(children).forEach((element) => {
    if (element.type === Route) {
      addRoute(element, null);
    } else if (element.type === Tabs) {
      elements(element.props.children).forEach((tab) => {
        if (tab.type !== Tab) throw new TypeError('<Tabs> takes <Tab> children');

        const index = table.tabs.length;

        const name = text(tab.props.name, '<Tab> name');
        const icon = tabIcon(read(tab.props.icon), name);

        table.tabs.push({
          name,
          title: text(tab.props.title, '<Tab> title'),
          ...(icon !== undefined && { icon }),
        });

        elements(tab.props.children).forEach((route) => {
          if (route.type !== Route) throw new TypeError('<Tab> takes <Route> children');

          addRoute(route, index);
        });
      });
    } else {
      throw new TypeError('<Router> takes <Route> and <Tabs> children');
    }
  });

  table.routes = { tabs: table.tabs.map((tab) => tab.name), routes };

  return table;
}

interface ActiveRouter {
  /** Which Router this is: a second one is an error. */
  owner: object;
  go(to: Destination, options?: { replace?: boolean }): void;
  present(to: Destination): Promise<unknown>;
  back(): void;
}

const isRouter = (value: unknown): value is ActiveRouter =>
  typeof value === 'object' && value !== null && 'go' in value && 'owner' in value;

/** The mounted Router, which the kernel holds across Live Patches. */
function mounted(): ActiveRouter | null {
  const router = globalThis.__kuito?.navigation.router;

  return isRouter(router) ? router : null;
}

function router(): ActiveRouter {
  const active = mounted();

  if (!active) throw new Error('navigate() needs a <Router> in the app');

  return active;
}

/** Shows `to` (docs/navigation.md#moving-between-routes). */
export function navigate(to: Destination, options?: { replace?: boolean }): void {
  router().go(to, options);
}

/**
 * Shows `to` as a new screen, and resolves with what it passes to its
 * `dismiss`, or undefined when the user closes it.
 */
export function present<R>(to: Destination<R>): Promise<R | undefined> {
  return router().present(to) as Promise<R | undefined>;
}

/** Closes the top presented screen, or pops the current stack. */
export function goBack(): void {
  router().back();
}

/**
 * Props of `Link`: the destination, whether it replaces the top screen, and a
 * Pressable's other props.
 */
export interface LinkProps extends Omit<PressableProps, 'onPress'> {
  to: Destination;
  replace?: boolean;
}

/** A pressable that navigates to `to`. */
export function Link(props: LinkProps): KuitoNode {
  const { to, replace, children, ...rest } = props;

  return (
    <Pressable
      {...rest}
      onPress={() => navigate(read(to) as Destination, { replace: read(replace) === true })}
    >
      {children}
    </Pressable>
  );
}

/** The app's navigation: one per app. */
export function Router(props: RouterProps): KuitoNode {
  const kuito = globalThis.__kuito;

  if (!kuito) throw new Error('Router requires the Kuito runtime');

  // Kept by the kernel across renders and Live Patches: this Router's identity.
  const owner = kuito.useRef<object>('owner');

  owner.current ??= {};

  const active = mounted();

  if (active && active.owner !== owner.current)
    throw new Error('An app has one <Router>, and this is a second one');

  const table = readTable(props.children);
  const initial = read(props.initial) as Destination | undefined;
  const nav = kuito.useState<NavigationState>(initialState(table.routes, initial));

  // The state may predate a patch that edited the table: every read adapts it.
  const current = kuito.computed(() => adapt(nav.value, table.routes));

  // The focused route's systemBars sits on top of the SystemBars stack, so it
  // wins over SystemBars mounted before the screen showed and loses to the
  // ones the screen mounts. Moved there before the next screen renders.
  const systemBars = kuito.useRef<{ entry: SystemBarsStackEntry; key: string }>();

  const focus = (state: NavigationState) => {
    const entry = focused(state);
    const props = table.screens[entry.route]().systemBars;
    const shown = systemBars.current;

    // The same screen keeps its place: a patch may have edited its options.
    if (shown?.key === entry.key) {
      shown.entry = replaceStackEntry(shown.entry, props);

      return;
    }

    if (shown) popStackEntry(shown.entry);

    systemBars.current = { entry: pushStackEntry(props), key: entry.key };
  };

  // The presented screens' results, by entry key: resolved when the screen
  // dismisses with one, or with undefined once it is gone any other way.
  const pending = kuito.useRef<Map<string, (result: unknown) => void>>('pending');

  pending.current ??= new Map();

  // Each screen's element, made once for as long as the screen lives: its
  // props stay the same object from one navigation to the next, so the kernel
  // keeps its rendered tree rather than rendering it again. Its dismiss
  // closes through the latest render's `close`, which knows the latest table.
  const closing = kuito.useRef<(key: string, result: unknown) => void>('closing');
  const elements = kuito.useRef<Map<string, { screen: unknown; element: KuitoNode }>>('elements');

  elements.current ??= new Map();

  const settle = (state: NavigationState) => {
    const shown = entryKeys(state);

    elements.current?.forEach((_, key) => {
      if (!shown.has(key)) elements.current?.delete(key);
    });

    pending.current?.forEach((resolve, key) => {
      if (shown.has(key)) return;

      pending.current?.delete(key);
      resolve(undefined);
    });
  };

  const show = (state: NavigationState) => {
    focus(state);
    nav.value = state;
    settle(state);
  };

  // Read without subscribing: the Router itself renders again only when its
  // children change; each stack and the presented screens follow the state on their own.
  const now = kuito.untracked(() => current.value);

  focus(now);
  // A patch that removed a presented screen's route closed it.
  settle(now);

  kuito.useLifecycle('mount', () => () => {
    if (systemBars.current) popStackEntry(systemBars.current.entry);

    systemBars.current = null;

    if (mounted()?.owner === owner.current) kuito.navigation.router = null;

    pending.current?.forEach((resolve) => resolve(undefined));
    pending.current?.clear();
  });

  kuito.navigation.router = {
    owner: owner.current,
    go: (to, options) => show(navigateState(current.value, table.routes, to, options)),
    present: (to) => {
      const shown = presentState(current.value, table.routes, to);

      return new Promise((resolve) => {
        pending.current?.set(shown.key, resolve);
        show(shown.state);
      });
    },
    back: () => show(back(current.value)),
  } satisfies ActiveRouter;

  /** Closes `key`'s screen; the present that showed it resolves with `result`. */
  const close = (key: string, result: unknown) => {
    pending.current?.get(key)?.(result);
    pending.current?.delete(key);
    show(dismiss(current.value, key));
  };

  closing.current = close;

  const follow = (url: string) => {
    const destination = linkDestination(table.routes, url);

    if (!destination)
      return console.warn(
        'No route matches the link ' + url + ' (' + linkPath(url) + '); it was ignored',
      );

    show(navigateState(current.value, table.routes, destination));
  };

  // Mounting subscribes once; a patched Router follows links with its own table.
  const following = kuito.useRef<(url: string) => void>();
  const linking = read(props.linking) === true;

  following.current = follow;

  // The link the app launched with first, then each one that opens it; a
  // re-run of the Router follows none it followed already.
  const followed = kuito.useRef<string>('followed');

  if (linking)
    kuito.useLifecycle(
      'watch',
      () => url.value,
      (link: string | null) => {
        if (link === null || link === followed.current) return;

        followed.current = link;
        following.current?.(link);
      },
      { immediate: true },
      'linking',
    );

  // A header function runs again when a signal it reads changes, as the
  // screen's props follow it.
  const header = (entry: Entry) =>
    kuito.computed(() => {
      const spec = table.screens[entry.route]().header;

      return screenHeader(
        typeof spec === 'function' ? spec(entry.params) : spec,
        '<Route name="' + table.routes.routes[entry.route].name + '">',
      );
    });

  const title = (entry: Entry) => {
    const spec = table.screens[entry.route]().title;

    return typeof spec === 'function' ? spec(entry.params) : (spec ?? '');
  };

  // Each stack's back swipe, and one that never moves for presented screens.
  const tabBacks = table.tabs.map((tab) =>
    kuito.useMotionSource('NavigationStack', 'back:' + tab.name),
  );
  const onlyBack = kuito.useMotionSource('NavigationStack', 'back');
  const stillBack = kuito.useMotionSource('NavigationStack', 'back:presented');

  const content = (entry: Entry, back: BackMotion, sheet?: SheetMotion) => {
    const Screen = table.screens[entry.route]().screen;
    const made = elements.current?.get(entry.key);

    // A patch that edited the screen's component makes the element again.
    if (made?.screen === Screen) return made.element;

    const key = entry.key;
    const element = (
      <Screen
        {...entry.params}
        dismiss={(result?: unknown) => closing.current?.(key, result)}
        back={back.progress}
        {...(sheet && { sheet })}
      />
    );

    elements.current?.set(key, { screen: Screen, element });

    return element;
  };

  // The platform removed the screen: swiped, backed or closed away.
  const removed = (entry: Entry) => () => show(dismiss(current.value, entry.key));

  const screen = (entry: Entry, back: BackMotion) => {
    const shown = header(entry);

    return (
      <NavigationScreen
        key={entry.key}
        title={title(entry)}
        header={shown.value.shown}
        headerItems={
          shown.value.items.length ? shown.value.items.map((item) => item.view) : undefined
        }
        largeTitle={shown.value.largeTitle || undefined}
        search={
          shown.value.search && {
            ...(shown.value.search.placeholder !== undefined && {
              placeholder: shown.value.search.placeholder,
            }),
          }
        }
        {...(table.screens[entry.route]().backgroundColor !== undefined && {
          backgroundColor: table.screens[entry.route]().backgroundColor,
        })}
        onDismiss={removed(entry)}
        onHeaderItem={(event) => shown.value.items[event.index]?.onPress()}
        onSearch={(event) => shown.value.search?.onChange(event.text)}
        onSearchSubmit={(event) => shown.value.search?.onSubmit?.(event.text)}
      >
        {content(entry, back)}
      </NavigationScreen>
    );
  };

  const screens = (stack: readonly Entry[], back: BackMotion) =>
    stack.map((entry) => screen(entry, back));

  // A sheet shows its content alone; a modal or full-screen route is a stack
  // of its one screen, so it has the header a pushed screen has.
  const presentedView = (entry: Entry) => {
    const presentation = table.routes.routes[entry.route].presentation;

    if (presentation === 'push') throw new Error('A pushed route is never presented');

    if (presentation === 'sheet')
      return (
        <SheetRoute
          key={entry.key}
          {...(table.screens[entry.route]().snapPoints && {
            snapPoints: table.screens[entry.route]().snapPoints,
          })}
          onClose={removed(entry)}
          render={(sheet) => content(entry, stillBack, sheet)}
        />
      );

    return (
      <PresentedSheet key={entry.key} open presentation={presentation} onClose={removed(entry)}>
        <NavigationStack>{screen(entry, stillBack)}</NavigationStack>
      </PresentedSheet>
    );
  };

  /** Whether tab `name` shows its screens: it is selected, or was once. */
  const visit = (name: string, selected: boolean) => {
    if (selected) visited.current?.add(name);

    return visited.current?.has(name) === true;
  };

  // A tab mounts its screens, and loads their routes' modules, when first
  // selected: until then its stack is empty. Tabs are the same tab by name.
  const visited = kuito.useRef<Set<string>>('visited');

  visited.current ??= new Set();

  // Each stack, and the presented screens, re-plan only when their own entries change:
  // the core keeps an unchanged stack's array as it was.
  const tabStack = (name: string, index: number) =>
    kuito.computed(() => {
      const state = current.value;

      return visit(name, index === state.tab) ? state.stacks[index] : null;
    });
  const onlyStack = kuito.computed(() => current.value.stacks[0]);
  const presented = kuito.computed(() => current.value.presented);

  return (
    <>
      {table.tabs.length ? (
        <NavigationTabs
          selectedIndex={current.value.tab}
          onSelect={(event) => show(selectTab(current.value, event.index))}
        >
          {table.tabs.map((tab, index) => (
            <NavigationTab
              key={tab.name}
              title={tab.title}
              {...(tab.icon !== undefined && { icon: tab.icon })}
              onError={(event) => {
                throw new Error('<Tab name="' + tab.name + '"> icon did not load: ' + event.error);
              }}
            >
              <NavigationStack motion={tabBacks[index]}>
                <Show when={tabStack(tab.name, index)}>
                  {(stack) => screens(stack, tabBacks[index])}
                </Show>
              </NavigationStack>
            </NavigationTab>
          ))}
        </NavigationTabs>
      ) : (
        <NavigationStack motion={onlyBack}>
          <Show when={onlyStack}>{(stack) => screens(stack, onlyBack)}</Show>
        </NavigationStack>
      )}
      <Show when={presented}>{(entries) => entries.map(presentedView)}</Show>
    </>
  );
}
