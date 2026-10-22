import type { Component, KuitoNode } from './jsx';
import type { Prop, ScrollProps } from './primitives';
import type { ReadonlySignal, Signal } from './reactivity';
import type { ElementRef, ScrollHandle, KuitoNativeEvent } from './refs';
import { isStore } from './store';

export interface ListItem<T> {
  item: T;
  /** The item's position, a signal like `For`'s index: it follows items before it as they come and go. */
  index: ReadonlySignal<number>;
  /** Whether the row is on screen, by `viewability`'s threshold. */
  visible: ReadonlySignal<boolean>;
}

/** A component, or an element rendered as is. */
type Slot = Component<Record<string, never>> | KuitoNode;

/** An item entering or leaving the visible rows, with whether it is now visible. */
export interface ViewableItem<T> {
  item: T;
  key: string;
  index: number;
  visible: boolean;
}

export interface Viewability {
  /** The fraction of a row, 0 to 1, that must be on screen for it to count as visible; 0 by default. */
  threshold?: number;
}

export interface ScrollToIndexOptions {
  index: number;
  animated?: boolean;
  /** Where the item lands: 0 at the start of the list, 0.5 centered, 1 at the end. */
  align?: number;
  /** Points to keep before the item, as CSS's `scroll-margin`. */
  margin?: number;
}

/** What a List ref holds: its native list, and methods that scroll it to an item too. */
export interface ListHandle extends ScrollHandle {
  scrollToIndex(params: ScrollToIndexOptions): void;
  scrollToItem(params: Omit<ScrollToIndexOptions, 'index'> & { item: unknown }): void;
}

/**
 * Props of `List`: its items, how a row renders, and a Scroll's other props.
 * A list rests where its rows do: paging and snap offsets are a Scroll's.
 */
export interface ListProps<T> extends Omit<
  ScrollProps,
  'children' | 'ref' | 'paging' | 'snapOffsets' | 'onScrollEnd'
> {
  /** The items, or a signal of them. */
  data: Prop<readonly T[]>;
  renderItem: (info: ListItem<T>) => KuitoNode;
  /** A unique key per item; defaults to `item.key`, then `item.id`, then the index. */
  itemKey?: (item: T, index: number) => string;
  /** The item's section: each run of items with the same section gets a header row. */
  sectionKey?: (item: T, index: number) => string;
  /** Renders a section's header row, given its section and its first item. */
  renderSection?: (info: { section: string; item: T }) => KuitoNode;
  /** Section headers stay at the top while their section scrolls under them; vertical lists only. */
  stickySections?: boolean;
  separator?: Slot;
  header?: Slot;
  footer?: Slot;
  /** Rendered instead of the rows when `data` is empty. */
  empty?: Slot;
  /** Lays items out in rows of this many; `gap` spaces both directions. */
  columns?: number;
  /** Starts at the end, with the first item at the bottom (or the right). */
  inverted?: boolean;
  /** Scrolls to this item when the list first shows it; no `getItemLayout` needed. */
  initialIndex?: number;
  /** The length of a row not measured yet; the average measured row by default. */
  estimatedItemSize?: number;
  onViewableChange?: (info: {
    viewableItems: ViewableItem<T>[];
    changed: ViewableItem<T>[];
  }) => void;
  viewability?: Viewability;
  ref?: ElementRef<ListHandle>;
}

/** The native List's element: it also takes the list's internal props, such as scrollTo. */
type NativeList = ScrollHandle & {
  setProperty(key: 'scrollTo', value: Record<string, unknown>): void;
  setProperty(key: 'emitsViewable', value: boolean): void;
};

/** Keys of the rows that are not items; an item key must not take one. */
const HEADER = '#header';
const FOOTER = '#footer';
const EMPTY = '#empty';
/** A section's header row is this followed by its section. */
const SECTION = '#section:';

/**
 * Compiled JSX passes attribute expressions as `__kuitoExpr` thunks, which
 * reading resolves; plain callbacks pass through.
 */
function read<T>(value: T): T {
  if (!isCompiledThunk(value)) return value;

  // The compiler wraps the attribute's own expression, so it returns a T.
  const evaluate: () => T = value as never;

  return evaluate();
}

function isCompiledThunk(value: unknown): value is () => unknown {
  return typeof value === 'function' && '__kuitoExprKey' in value;
}

function isSignal<V>(value: V | ReadonlySignal<V>): value is ReadonlySignal<V> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'value' in value;
}

function isComponent(value: Slot): value is Component<Record<string, never>> {
  return typeof value === 'function' && !isCompiledThunk(value);
}

/** Keys of store items that have no key or id: one per object, as long as it lives. */
const identities = new WeakMap<object, string>();
let identityCount = 0;

function identityKey(item: object): string {
  const known = identities.get(item);

  if (known !== undefined) return known;

  const made = '@' + ++identityCount;

  identities.set(item, made);

  return made;
}

function defaultKey(item: unknown, index: number): string {
  if (typeof item === 'object' && item !== null) {
    const key: unknown = 'key' in item ? item.key : undefined;
    const id: unknown = 'id' in item ? item.id : undefined;

    if (typeof key === 'string' || typeof key === 'number') return String(key);

    if (typeof id === 'string' || typeof id === 'number') return String(id);

    // A store's object is the same item wherever it moves.
    if (isStore(item)) return identityKey(item);
  }

  return String(index);
}

function slot(value: Slot): KuitoNode {
  const resolved = read(value);

  return isComponent(resolved) ? __kuitoJSX(resolved, null) : resolved;
}

function kernel(): NonNullable<typeof globalThis.__kuito> {
  if (!globalThis.__kuito) throw new Error('List must render inside a Kuito app');

  return globalThis.__kuito;
}

/** List's own props; everything else configures its native List. */
const LIST_PROPS = new Set([
  'data',
  'renderItem',
  'itemKey',
  'sectionKey',
  'renderSection',
  'stickySections',
  'separator',
  'header',
  'footer',
  'empty',
  'columns',
  'inverted',
  'initialIndex',
  'estimatedItemSize',
  'onViewableChange',
  'viewability',
  'ref',
]);

/**
 * The List's props as live bindings: a prop read through a getter is
 * reactive, so it is forwarded as a function the native prop re-evaluates,
 * never as a value frozen when the list renders. One passed as it is (a
 * callback, an identity, a stylesheet's class) cannot change, so it is
 * forwarded as it is.
 */
function listProps(props: object): Record<string, unknown> {
  const forwarded: Record<string, unknown> = {};

  // forEach, not for-of: each read needs its own `key` on device Hermes.
  Object.keys(props).forEach((key) => {
    if (LIST_PROPS.has(key) || key === 'key') return;

    const descriptor = Object.getOwnPropertyDescriptor(props, key);

    forwarded[key] =
      descriptor && 'value' in descriptor
        ? (descriptor.value as unknown)
        : (): unknown => Reflect.get(props, key);
  });

  return forwarded;
}

/**
 * What a bound row's bindings read, kept while its key is in the data: a
 * change re-renders only the parts of the row that read it.
 */
interface Row<T> {
  item: Signal<T>;
  index: Signal<number>;
  last: Signal<boolean>;
  visible: Signal<boolean>;
}

/** The items, their keys and the rows the native list shows, for one `data` array. */
interface Model<T> {
  data: readonly T[];
  keys: string[];
  index: Record<string, number>;
  /** The item rows, with each section's header before its items. */
  items: string[];
  /** Section header rows, in order. */
  sections: string[];
  /** Each section header's first item, by position. */
  heads: Record<string, number>;
  /** Items that end their section (or the data): no separator follows them. */
  ends: Record<string, true>;
  rows: string[];
  slots: string;
}

/** `cell` and `key` from a native bind request. */
function bindRequest(event: unknown): { list: string; cell: string; key: string } | null {
  if (typeof event !== 'object' || event === null) return null;

  const target: unknown = 'target' in event ? event.target : null;
  const list: unknown =
    typeof target === 'object' && target !== null && 'id' in target ? target.id : null;
  const cell: unknown = 'cell' in event ? event.cell : null;
  const key: unknown = 'key' in event ? event.key : null;

  if (typeof list !== 'string' || typeof cell !== 'string' || typeof key !== 'string') return null;

  return { list, cell, key };
}

/**
 * A list of items virtualized by the platform: a UICollectionView
 * or RecyclerView owns scrolling, recycling and which rows exist, and asks
 * for a row only when it comes near the screen (docs/lists.md). The list
 * receives the items' keys; a row renders into the cell the native list
 * names, and a recycled cell is re-bound in place.
 *
 * Props are read where they are used, never destructured up front: a read
 * inside a binding or a handler sees the current value.
 */
export function List<T>(props: ListProps<T>): KuitoNode {
  const kuito = kernel();
  const list = kuito.useRef<NativeList>();
  const cache = kuito.useRef<Model<T>>();
  const viewable = kuito.useRef<ViewableItem<T>[]>();
  const scrolls = kuito.useRef<number>();
  // Reporting the viewable range costs the native list work on every
  // scroll: it starts for onViewableChange, or once a row reads `visible`.
  const reporting = kuito.useRef<boolean>();
  const bound = kuito.useRef<Map<string, Row<T>>>();
  const rowsByKey = (bound.current ??= new Map<string, Row<T>>());
  const columns = () => Math.max(1, Math.floor(props.columns ?? 1));
  // `data` is the items, or a signal of them: reading it here tracks either.
  const items = (): readonly T[] => {
    const data = props.data;

    return isSignal(data) ? data.value : data;
  };

  function slots(): string[] {
    const present: string[] = [];

    if (props.header !== undefined) present.push(HEADER);

    if (items().length === 0 && props.empty !== undefined) present.push(EMPTY);

    if (props.footer !== undefined) present.push(FOOTER);

    return present;
  }

  /** Recomputed when `data` or the slots change; otherwise the same arrays. */
  const model = kuito.computed((): Model<T> => {
    const data = items();
    const present = slots();
    const signature = present.join();
    const prior = cache.current;
    // A store array is the same array after a push: this runs again only
    // when one of its items or their keys changed.
    const same = !!prior && prior.data === data && !isStore(data);

    if (same && prior.slots === signature) return prior;

    const keys = same ? prior.keys : keysOf(data);
    const index = same ? prior.index : indexOf(keys);
    const grouped = same ? prior : sectionsOf(data, keys);
    const rows = [
      ...present.filter((key) => key === HEADER),
      ...(keys.length === 0 ? present.filter((key) => key === EMPTY) : grouped.items),
      ...present.filter((key) => key === FOOTER),
    ];

    return (cache.current = {
      data,
      keys,
      index,
      items: grouped.items,
      sections: grouped.sections,
      heads: grouped.heads,
      ends: grouped.ends,
      rows,
      slots: signature,
    });
  });

  /** The item rows with a header before each run of items that share a section. */
  function sectionsOf(
    data: readonly T[],
    keys: string[],
  ): Pick<Model<T>, 'items' | 'sections' | 'heads' | 'ends'> {
    const sectionOf = props.sectionKey;
    const heads: Record<string, number> = Object.create(null);
    const ends: Record<string, true> = Object.create(null);
    const sections: string[] = [];

    if (keys.length > 0) ends[keys[keys.length - 1]] = true;

    if (!sectionOf) return { items: keys, sections, heads, ends };

    const items: string[] = [];
    let current: string | null = null;

    data.forEach((item, position) => {
      const section = sectionOf(item, position);

      if (typeof section !== 'string')
        throw new TypeError('List sectionKey must return a string; got ' + typeof section);

      if (section !== current) {
        const header = SECTION + section;

        if (header in heads)
          throw new Error(
            'List: the section "' +
              section +
              '" comes twice. Keep the items of a section next to each other in data.',
          );

        if (position > 0) ends[keys[position - 1]] = true;

        heads[header] = position;
        sections.push(header);
        items.push(header);
        current = section;
      }

      items.push(keys[position]);
    });

    return { items, sections, heads, ends };
  }

  function keysOf(data: readonly T[]): string[] {
    const keyOf = props.itemKey ?? defaultKey;

    return data.map((item, index) => {
      const key = keyOf(item, index);

      if (typeof key !== 'string')
        throw new TypeError('List itemKey must return a string; got ' + typeof key);

      return key;
    });
  }

  function indexOf(keys: string[]): Record<string, number> {
    const index: Record<string, number> = Object.create(null);

    keys.forEach((key, position) => {
      if (
        key in index ||
        key === HEADER ||
        key === FOOTER ||
        key === EMPTY ||
        key.startsWith(SECTION)
      )
        throw new Error(
          'List: two rows have the key "' + key + '". Return a unique key per item from itemKey.',
        );

      index[key] = position;
    });

    return index;
  }

  /** Where the row of `key` is: an item's position, or a section header's first item. */
  function positionOf(key: string, { index, heads }: Model<T>): number | undefined {
    if (key in index) return index[key];

    return key in heads ? heads[key] : undefined;
  }

  /** The row of `key`, made the first time it binds, at its place in `current`. */
  function rowOf(key: string, position: number, current: Model<T>): Row<T> {
    const known = rowsByKey.get(key);

    if (known) {
      place(known, key, position, current);

      return known;
    }

    const made: Row<T> = {
      item: kuito.createSignal(current.data[position]),
      index: kuito.createSignal(position),
      last: kuito.createSignal(key in current.ends),
      visible: kuito.createSignal((viewable.current ?? []).some((entry) => entry.key === key)),
    };

    rowsByKey.set(key, made);

    return made;
  }

  function place(row: Row<T>, key: string, position: number, current: Model<T>): void {
    row.item.value = current.data[position];
    row.index.value = position;
    row.last.value = key in current.ends;
  }

  /** A section header: it follows its section's first item. */
  function renderHeader(key: string, row: Row<T>): KuitoNode {
    const render = props.renderSection;

    return render ? render({ section: key.slice(SECTION.length), item: row.item.value }) : null;
  }

  function render(row: Row<T>): KuitoNode {
    const separator = props.separator;
    const info: ListItem<T> = {
      item: row.item.value,
      index: row.index,
      get visible() {
        if (!reporting.current) {
          reporting.current = true;
          // After the row's plan commits, which may still throw: a prop
          // written now would go with it.
          void Promise.resolve().then(() => list.current?.setProperty('emitsViewable', true));
        }

        return row.visible;
      },
    };

    return [
      props.renderItem(info),
      separator !== undefined && columns() === 1
        ? () => (row.last.value ? null : slot(separator))
        : null,
    ];
  }

  /** Read where the row renders, so the signals behind a slot re-render it. */
  function slotted(key: string): Slot | undefined {
    if (key === HEADER) return props.header;

    if (key === FOOTER) return props.footer;

    if (key === EMPTY) return props.empty;

    return undefined;
  }

  function bind(list: string, cell: string, key: string): void {
    if (slotted(key) !== undefined)
      return kuito.renderCell(list, cell, key, () => {
        const value = slotted(key);

        return value === undefined ? null : slot(value);
      });

    const current = model.value;
    const position = positionOf(key, current);

    if (position === undefined) return;

    const row = rowOf(key, position, current);

    kuito.renderCell(list, cell, key, () =>
      key in current.heads ? renderHeader(key, row) : render(row),
    );
  }

  /**
   * New data: each row moves to its item's place, which re-renders only what
   * read what changed, and rows whose key left the data render nothing.
   */
  function refresh(): void {
    const current = model.value;

    rowsByKey.forEach((row, key) => {
      const position = positionOf(key, current);

      if (position === undefined) rowsByKey.delete(key);
      else place(row, key, position, current);
    });

    const id = list.current?.id;

    if (!id) return;

    kuito.boundCells(id).forEach(({ cell, key }) => {
      if (slotted(key) !== undefined || positionOf(key, current) !== undefined)
        return bind(id, cell, key);

      // The native list keeps a cell whose key left and shows it again,
      // unasked, if the key returns. Emptied, it stops re-rendering a stale
      // item whose views could claim ids that item's live row now owns.
      kuito.renderCell(id, cell, key, null);
    });
  }

  function token(key: string, visible: boolean): ViewableItem<T> {
    const { data, index } = model.value;

    return { item: data[index[key]], key, index: index[key], visible };
  }

  /** The native list reports its visible rows as the keys of the first and last. */
  function viewableRange(event: unknown): void {
    if (typeof event !== 'object' || event === null) return;

    const first: unknown = 'first' in event ? event.first : null;
    const last: unknown = 'last' in event ? event.last : null;
    const { rows, index } = model.value;
    const start = typeof first === 'string' ? rows.indexOf(first) : -1;
    const end = typeof last === 'string' ? rows.indexOf(last) : -1;
    const keys =
      start === -1 || end < start ? [] : rows.slice(start, end + 1).filter((key) => key in index);
    const previous = viewable.current ?? [];
    const viewableItems = keys.map((key) => token(key, true));
    const changed = [
      ...viewableItems.filter((entry) => !previous.some((prior) => prior.key === entry.key)),
      ...previous
        .filter((prior) => !keys.includes(prior.key))
        .map((prior) => ({ ...prior, visible: false })),
    ];

    viewable.current = viewableItems;

    const shown = new Set(keys);

    rowsByKey.forEach((row, key) => (row.visible.value = shown.has(key)));

    if (changed.length > 0) props.onViewableChange?.({ viewableItems, changed });
  }

  function element(): NativeList {
    if (!list.current) throw new Error('List is not on screen');

    return list.current;
  }

  /**
   * A request to scroll to a row, as the element's own scrollTo requests
   * are: a prop the native list acts on each time it receives one. Numbered,
   * as the kernel skips an object prop equal to the last one sent and the
   * same request again must scroll again; a key request never equals an
   * offset one, so the two numberings cannot collide.
   */
  function scrollToKey(
    key: string | undefined,
    params: Omit<ScrollToIndexOptions, 'index'>,
    what: string,
  ): void {
    if (key === undefined) throw new RangeError('List cannot scroll to ' + what + ': no such item');

    scrolls.current = (scrolls.current ?? 0) + 1;

    element().setProperty('scrollTo', {
      key,
      animated: params.animated ?? true,
      align: params.align ?? 0,
      margin: params.margin ?? 0,
      request: scrolls.current,
    });
  }

  const handle: ListHandle = {
    get id() {
      return element().id;
    },
    get parent() {
      return element().parent;
    },
    get children() {
      return element().children;
    },
    focus: () => element().focus(),
    blur: () => element().blur(),
    setProperty: (key, value) => element().setProperty(key, value),
    addEventListener: (type, listener, options) =>
      element().addEventListener(type, listener, options),
    removeEventListener: (type, listener, options) =>
      element().removeEventListener(type, listener, options),
    dispatchEvent: (event: KuitoNativeEvent) => element().dispatchEvent(event),
    scrollToIndex: (params) =>
      scrollToKey(model.value.keys[params.index], params, 'index ' + params.index),
    scrollToItem: (params) =>
      scrollToKey(
        model.value.keys[model.value.data.findIndex((item) => Object.is(item, params.item))],
        params,
        'that item',
      ),
    scrollTo: (params) => element().scrollTo(params),
    scrollToEnd: (params) => element().scrollToEnd(params),
  };

  kuito.useLifecycle(
    'watch',
    () => model.value,
    () => refresh(),
  );

  kuito.useLifecycle('mount', () => {
    const outer = props.ref;

    if (!outer) return;

    outer.current = handle;

    return () => {
      if (outer.current === handle) outer.current = null;
    };
  });

  const native: Record<string, unknown> = {
    ...listProps(props),
    ref: list,
    keys: () => model.value.rows,
    spanningKeys: () => [...slots(), ...model.value.sections],
    onBindCells: (event: unknown) => {
      const request = bindRequest(event);

      if (request) bind(request.list, request.cell, request.key);
    },
    // Every row's `visible` follows the native viewable range. After the
    // handler, which turns reporting on by itself, so this decides.
    onViewableKeys: viewableRange,
    emitsViewable: !!reporting.current || props.onViewableChange !== undefined,
  };

  if (props.columns !== undefined) native.numColumns = columns;

  if (props.inverted !== undefined) native.inverted = () => !!props.inverted;

  if (props.estimatedItemSize !== undefined)
    native.estimatedItemSize = () => props.estimatedItemSize;

  if (props.stickySections) {
    if (props.horizontal || props.inverted)
      throw new TypeError('List stickySections needs a vertical list that is not inverted');

    native.stickyKeys = () => model.value.sections;
  }

  if (props.viewability !== undefined)
    native.viewableThreshold = () => props.viewability?.threshold ?? 0;

  if (props.initialIndex !== undefined)
    native.initialScrollKey = () => model.value.keys[props.initialIndex ?? 0] ?? null;

  return __kuitoJSX('List', native);
}
