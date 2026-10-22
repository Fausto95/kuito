/*
 * The router's core: routes by name, the navigation state as values, and the
 * one place a URL becomes a destination: deep links. Each tab has its own
 * stack; presented screens (sheets, modals, full-screen) sit over
 * everything. Every change returns a new state, and entries that do not
 * change are kept as they are, so a screen's component keeps its identity.
 * Imports nothing (docs/navigation.md).
 */

/** Pushed on its stack, or presented over everything in one of three ways. */
export type Presentation = 'push' | 'sheet' | 'modal' | 'fullScreen';

/** How a link's text parses into a param. */
export type ParamKind = 'string' | 'number' | 'boolean';

export type ParamValue = string | number | boolean;

export type Params = Readonly<Record<string, ParamValue>>;

/** A route as the Router reads it from its children. */
export interface RouteSpec {
  name: string;
  /** Segments, `:name` params and a final `*name`: what a deep link's path matches. */
  path: string;
  /** Each param's kind; a path param it leaves out is a string. */
  params: Readonly<Record<string, ParamKind>>;
  /** The tab whose stack it belongs to; null without tabs, and for presented routes. */
  tab: number | null;
  presentation: Presentation;
}

export interface RouteTable {
  /** The tabs' names, in order; none for a single stack. */
  tabs: readonly string[];
  routes: readonly RouteSpec[];
}

/** What to show: a route by name, with its params. */
export interface Destination {
  route: string;
  params: Params;
}

/** One screen in a stack, or presented. */
export interface Entry {
  key: string;
  /** Its route's index in the table. */
  route: number;
  params: Params;
}

export interface NavigationState {
  tab: number;
  /** One stack per tab, or the one stack. */
  stacks: readonly (readonly Entry[])[];
  /** Screens presented over everything, bottom to top. */
  presented: readonly Entry[];
  /** For unique keys. */
  next: number;
  /** The table the entries' route indices point into. */
  table: RouteTable;
}

function segments(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '');
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The params `href` gives `pattern`, as text, or null when it does not match. */
export function matchPath(pattern: string, href: string): Record<string, string> | null {
  const wanted = segments(pattern);
  const actual = segments(href.split(/[?#]/)[0]);
  const params: Record<string, string> = {};

  for (let index = 0; index < wanted.length; index++) {
    const part = wanted[index];

    if (part.charAt(0) === '*' && index === wanted.length - 1) {
      params[part.slice(1)] = actual.slice(index).map(decode).join('/');

      return params;
    }

    if (index >= actual.length) return null;

    if (part.charAt(0) === ':') params[part.slice(1)] = decode(actual[index]);
    else if (part !== actual[index]) return null;
  }

  return actual.length === wanted.length ? params : null;
}

// Web links carry the site as their host; any other scheme is the app's own.
const WEB_SCHEMES = ['http', 'https'];

/**
 * The route path a deep link names. A web link's path; after a custom scheme,
 * the host is the first segment, so `kuito://show/42` is `/show/42`. The
 * query and fragment stay for the route to ignore.
 */
export function linkPath(url: string): string {
  const parsed = /^([a-z][a-z0-9+.-]*):(\/\/)?(.*)$/i.exec(url);

  if (!parsed) throw new TypeError(url + ' is not a URL');

  const [, scheme, slashes, rest] = parsed;
  const path =
    slashes && WEB_SCHEMES.includes(scheme.toLowerCase()) ? rest.replace(/^[^/?#]*/, '') : rest;

  return '/' + path.replace(/^\/+/, '');
}

const PARSE: Readonly<Record<ParamKind, (text: string) => ParamValue | undefined>> = {
  string: (text) => text,
  number: (text) =>
    text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : undefined,
  boolean: (text) => (text === 'true' ? true : text === 'false' ? false : undefined),
};

/** A link's query as text: `?q=the%20bear&page=2`. */
function query(href: string): Record<string, string> {
  const text = /\?([^#]*)/.exec(href)?.[1] ?? '';
  const values: Record<string, string> = {};

  text.split('&').forEach((pair) => {
    const [key, value = ''] = pair.split('=');

    if (key) values[decode(key)] = decode(value);
  });

  return values;
}

/** The destination `spec` makes of a link's path, or null when the path or a param does not fit. */
function linkTo(spec: RouteSpec, href: string): Destination | null {
  const text = matchPath(spec.path, href);

  if (!text) return null;

  const given = query(href);
  const params: Record<string, ParamValue> = {};

  for (const name of Object.keys(text)) {
    const value = PARSE[spec.params[name] ?? 'string'](text[name]);

    if (value === undefined) return null;

    params[name] = value;
  }

  for (const name of Object.keys(spec.params)) {
    if (name in params || !(name in given)) continue;

    const value = PARSE[spec.params[name]](given[name]);

    if (value === undefined) return null;

    params[name] = value;
  }

  return { route: spec.name, params };
}

/**
 * Where a deep link goes: the first route its path matches whose params
 * parse, path params from the path and the others from the query. Null when
 * none does.
 */
export function linkDestination(table: RouteTable, url: string): Destination | null {
  const href = linkPath(url);

  for (const spec of table.routes) {
    const destination = linkTo(spec, href);

    if (destination) return destination;
  }

  return null;
}

function pathParams(path: string): string[] {
  return segments(path).flatMap((segment) =>
    segment.charAt(0) === ':' || segment.charAt(0) === '*' ? [segment.slice(1)] : [],
  );
}

const list = (names: readonly string[]) =>
  names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];

/** A param's value as the error shows it: JSON, or its type when JSON has none. */
const describe = (value: unknown) => JSON.stringify(value) ?? typeof value;

/** The route `destination` names, its params checked against the route's. */
function find(table: RouteTable, destination: Destination): { route: number; params: Params } {
  const route = table.routes.findIndex((spec) => spec.name === destination.route);

  if (route === -1)
    throw new Error(
      'No route is named ' +
        destination.route +
        '; the routes are ' +
        list(table.routes.map((spec) => spec.name)),
    );

  const spec = table.routes[route];
  const params = destination.params;

  pathParams(spec.path).forEach((name) => {
    if (!(name in params))
      throw new TypeError('routes.' + spec.name + ' needs its ' + name + ' param');
  });

  Object.keys(params).forEach((name) => {
    const kind = spec.params[name] ?? 'string';

    if (typeof params[name] !== kind)
      throw new TypeError(
        'routes.' +
          spec.name +
          "'s " +
          name +
          ' param must be a ' +
          kind +
          ', not ' +
          describe(params[name]),
      );
  });

  return { route, params };
}

function entry(
  state: NavigationState,
  table: RouteTable,
  destination: Destination,
): [Entry, number] {
  const { route, params } = find(table, destination);

  return [{ key: 'screen-' + state.next, route, params }, state.next + 1];
}

function sameParams(a: Params, b: Params): boolean {
  const keys = Object.keys(a);

  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && Object.is(a[key], b[key]))
  );
}

const shows = (entry: Entry, other: Entry) =>
  entry.route === other.route && sameParams(entry.params, other.params);

/** The stack a route belongs to: its tab's, or the one stack. */
const stackOf = (spec: RouteSpec) => (spec.tab === null ? 0 : spec.tab);

/** The first route of each stack: what it shows at first and pops back to. */
function firstRoutes(table: RouteTable): number[] {
  return Array.from({ length: Math.max(table.tabs.length, 1) }, (_, stack) => {
    const route = table.routes.findIndex(
      (spec) => spec.presentation === 'push' && stackOf(spec) === stack,
    );

    if (route === -1) throw new Error('Tab ' + stack + ' has no route');

    return route;
  });
}

const first = (table: RouteTable, route: number): Destination => ({
  route: table.routes[route].name,
  params: {},
});

/** Each stack on its first route, then `destination` as navigate shows it. */
export function initialState(table: RouteTable, destination?: Destination): NavigationState {
  let state: NavigationState = { tab: 0, stacks: [], presented: [], next: 1, table };
  const stacks: Entry[][] = [];

  firstRoutes(table).forEach((route) => {
    const [root, next] = entry(state, table, first(table, route));

    stacks.push([root]);
    state = { ...state, next };
  });

  state = { ...state, stacks };

  return destination ? navigate(state, table, destination) : state;
}

/** `entries` with `next` on top: in place of the top one when replacing. */
const onTop = (entries: readonly Entry[], next: Entry, replace: boolean, keep = 0) =>
  (replace && entries.length > keep ? entries.slice(0, -1) : entries).concat([next]);

/** `state` with `next` pushed on its route's stack (or replacing its top), that tab selected. */
function pushed(
  state: NavigationState,
  table: RouteTable,
  next: Entry,
  counter: number,
  update: (stack: readonly Entry[]) => readonly Entry[],
): NavigationState {
  const spec = table.routes[next.route];

  if (spec.presentation !== 'push')
    return { ...state, presented: update(state.presented), next: counter };

  const index = stackOf(spec);
  const stack = state.stacks[index];
  const updated = update(stack);
  const tab = table.tabs.length ? index : 0;

  if (updated === stack && tab === state.tab) return state;

  return {
    ...state,
    tab,
    stacks: state.stacks.map((each, position) => (position === index ? updated : each)),
    next: counter,
  };
}

/**
 * Shows `destination`: a presented route over everything; a stack's first route pops
 * that stack to it; any other route is pushed on its stack, unless it is on
 * top already with the same params. A route in another tab selects that tab.
 */
export function navigate(
  state: NavigationState,
  table: RouteTable,
  destination: Destination,
  options: { replace?: boolean } = {},
): NavigationState {
  state = adapt(state, table);

  const [next, counter] = entry(state, table, destination);
  const replace = options.replace === true;

  return pushed(state, table, next, counter, (stack) => {
    if (table.routes[next.route].presentation !== 'push') return onTop(stack, next, replace);

    if (shows(stack[0], next)) return stack.slice(0, 1);

    if (!replace && shows(stack[stack.length - 1], next)) return stack;

    return onTop(stack, next, replace, 1);
  });
}

/**
 * Shows `destination` as a new screen, always: on top of its route's stack,
 * that tab selected, or presented. Its key is the screen's, for the result
 * it dismisses with.
 */
export function present(
  state: NavigationState,
  table: RouteTable,
  destination: Destination,
): { state: NavigationState; key: string } {
  state = adapt(state, table);

  const [next, counter] = entry(state, table, destination);

  return {
    state: pushed(state, table, next, counter, (stack) => stack.concat([next])),
    key: next.key,
  };
}

/** Every entry's key: the screens a state shows. */
export function entryKeys(state: NavigationState): Set<string> {
  return new Set([...state.stacks.flat(), ...state.presented].map((each) => each.key));
}

/** Closes the top presented screen, or pops the current stack; a stack's first screen stays. */
export function back(state: NavigationState): NavigationState {
  if (state.presented.length) return { ...state, presented: state.presented.slice(0, -1) };

  const stack = state.stacks[state.tab];

  if (stack.length < 2) return state;

  return {
    ...state,
    stacks: state.stacks.map((each, position) =>
      position === state.tab ? each.slice(0, -1) : each,
    ),
  };
}

/** The screen the user sees: the top presented one, else the top of the selected tab's stack. */
export function focused(state: NavigationState): Entry {
  const stack = state.presented.length ? state.presented : state.stacks[state.tab];

  return stack[stack.length - 1];
}

/** The platform removed `key` (swipe back, back button): it and the screens above it go. */
export function dismiss(state: NavigationState, key: string): NavigationState {
  const shown = state.presented.findIndex((each) => each.key === key);

  if (shown !== -1) return { ...state, presented: state.presented.slice(0, shown) };

  const stacks = state.stacks.map((stack) => {
    const position = stack.findIndex((each) => each.key === key);

    return position > 0 ? stack.slice(0, position) : stack;
  });

  return stacks.every((stack, index) => stack === state.stacks[index])
    ? state
    : { ...state, stacks };
}

export function selectTab(state: NavigationState, tab: number): NavigationState {
  if (!(tab >= 0 && tab < state.stacks.length) || !Number.isInteger(tab))
    throw new RangeError('There is no tab ' + tab);

  return tab === state.tab ? state : { ...state, tab };
}

const sameRoute = (a: RouteSpec, from: RouteTable, b: RouteSpec, to: RouteTable) =>
  a.name === b.name &&
  a.presentation === b.presentation &&
  (a.tab === null ? null : from.tabs[a.tab]) === (b.tab === null ? null : to.tabs[b.tab]);

const sameKinds = (a: RouteSpec['params'], b: RouteSpec['params']) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((name) => a[name] === b[name]);

function sameTable(from: RouteTable, to: RouteTable): boolean {
  return (
    from === to ||
    (from.tabs.length === to.tabs.length &&
      from.tabs.every((name, index) => name === to.tabs[index]) &&
      from.routes.length === to.routes.length &&
      from.routes.every(
        (spec, index) =>
          sameRoute(spec, from, to.routes[index], to) &&
          spec.path === to.routes[index].path &&
          sameKinds(spec.params, to.routes[index].params),
      ))
  );
}

/**
 * The state for an edited table (Live Patch). Tabs are the same tab by name,
 * routes the same route by name, presentation and tab; entries keep their
 * keys. An entry whose route is gone leaves with the entries above it; a
 * stack left empty, or a new tab, starts on its first route; the selected tab
 * follows its name, or is the first.
 */
export function adapt(state: NavigationState, table: RouteTable): NavigationState {
  const from = state.table;

  if (sameTable(from, table)) return state;

  const kept = (entries: readonly Entry[]) => {
    const result: Entry[] = [];

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const spec = from.routes[entry.route];
      const route = table.routes.findIndex((each) => sameRoute(spec, from, each, table));

      if (route === -1) break;

      result.push(route === entry.route ? entry : { ...entry, route });
    }

    return result;
  };

  let adapted: NavigationState = { ...state, stacks: [], presented: kept(state.presented), table };

  const stacks = firstRoutes(table).map((route, stack) => {
    const previous = table.tabs.length
      ? from.tabs.indexOf(table.tabs[stack])
      : from.tabs.length
        ? -1
        : 0;
    const entries = previous === -1 ? [] : kept(state.stacks[previous]);

    if (entries.length) return entries;

    const [root, next] = entry(adapted, table, first(table, route));

    adapted = { ...adapted, next };

    return [root];
  });
  const selected = from.tabs.length ? table.tabs.indexOf(from.tabs[state.tab]) : -1;

  return { ...adapted, stacks, tab: selected === -1 ? 0 : selected };
}
