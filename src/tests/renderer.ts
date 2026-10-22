// The headless renderer: the view tree the kernel's batches build, laid out
// by the shared engine as the iOS renderer lays it out (native/ios/Renderer):
// pages, sheets and list rows are layout roots of their own, a safe area
// pads its overlap, and a native list binds the rows near its viewport.
import { PROPS } from '../protocol/manifest.ts';
import type { KeyEdit, Mutation, PropValue } from './batch.ts';
import { measureText, textStyle, transformed, type FontTable } from './fonts.ts';
import {
  LayoutEngine,
  type Edges,
  type LayoutInput,
  type MeasureMode,
  type Size,
} from './layout.ts';

/** The window the app runs in, in points: an iPhone 18 Pro's by default. */
export interface Screen {
  width: number;
  height: number;
  /** Pixels per point: frames round to them. */
  scale: number;
  /** What the status bar and the home indicator cover. */
  insets: Edges;
}

export const IPHONE_18_PRO: Screen = {
  width: 402,
  height: 874,
  scale: 3,
  insets: { top: 62, right: 0, bottom: 34, left: 0 },
};

/**
 * UIKit's bars, which cover a screen's top and bottom: the platform's, not
 * Kuito's layout. Measured on an iPhone 18 Pro simulator (iOS 27).
 */
const NAVIGATION_BAR = 54;
const TAB_BAR = 49;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A view of the tree, as the renderer holds it. */
export interface HeadlessView {
  /** The number the kernel and its events name the view by. */
  readonly id: number;
  readonly kind: string;
  /** The kernel's label: a list row's cell id, or a debug name. */
  readonly label: string;
  parent: number;
  readonly children: number[];
  /** Each prop's last value, as the shells receive it: colors as 0xRRGGBBAA, structured props as their data. */
  readonly props: Map<string, unknown>;
  /** A layout-only view: it has a node but no native view. */
  flattened: boolean;
  readonly node: number;
  /** Where a Scroll or a list is scrolled to. */
  offset: { x: number; y: number };
}

const NO_EDGES: Edges = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * A field's `lines` as the shells take it: a count, or a range, 1 to no limit
 * by default. A recording made before structured props holds the range as JSON.
 */
function lineRange(lines: unknown): [min: number, max: number] {
  const value: unknown = typeof lines === 'string' ? JSON.parse(lines) : (lines ?? {});

  if (typeof value === 'number') return [value, value];

  const range = typeof value === 'object' && value !== null ? value : {};
  const min = Reflect.get(range, 'min');
  const max = Reflect.get(range, 'max');

  return [typeof min === 'number' ? min : 1, typeof max === 'number' ? max : Infinity];
}

/** Kinds that lay out their own subtree, apart from their parent's (KuitoLayoutRoot, pages, rows). */
const OWN_ROOTS = new Set(['NavigationScreen', 'NavigationTab', 'Sheet', 'ListCell']);

const LISTS = new Set(['List', 'HorizontalList']);
const SCROLLS = new Set(['Scroll', 'HorizontalScroll', 'List', 'HorizontalList']);
const HORIZONTAL = new Set(['HorizontalScroll', 'HorizontalList']);

/** The props the layout engine applies, as both renderers' layout tables route them. */
const LAYOUT_PROPS = new Set(
  Object.entries(PROPS)
    .filter(([, spec]) => spec.concern === 'layout' || spec.laysOut)
    .map(([name]) => name),
);

/**
 * A layout prop's value as the engine takes it (KuitoLayoutProperties.set):
 * an enum by the index C++ typed it with.
 */
function engineValue(value: PropValue): LayoutInput {
  switch (value.type) {
    case 'number':
    case 'boolean':
    case 'text':
      return value.value;
    case 'enum':
      return { index: value.index };
    case 'null':
    case 'color':
    case 'json':
    case 'struct':
    case 'keys':
      return null;
  }
}

/** Applies `edits` as a native list does, rejecting one that does not fit the keys. */
function applyKeys(keys: readonly string[], edits: readonly KeyEdit[]): string[] {
  const result = keys.slice();

  for (const { op, index, key } of edits) {
    const at = result.indexOf(key);

    if (op === 'insert' ? at !== -1 : op === 'remove' ? at !== index : at === -1)
      throw new Error(`The list cannot ${op} ${key} at ${index}: its keys are ${result.join()}`);

    if (op !== 'insert') result.splice(at, 1);
    if (op !== 'remove') result.splice(index, 0, key);
  }

  return result;
}

/** `%.1f` as Swift's String(format:) writes it: exact halves round to even. */
function point(value: number): string {
  const tenths = value * 10;
  const floor = Math.floor(tenths);
  const rounded =
    tenths - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(tenths);
  const text = (rounded / 10).toFixed(1);

  return text === '0.0' && (value < 0 || Object.is(value, -0)) ? '-0.0' : text;
}

/** A native list's rows: their keys, their cells and the sizes they measured. */
interface ListState {
  keys: string[];
  /** Each bound key's cell id. */
  cells: Map<string, string>;
  sizes: Map<string, Size>;
}

export interface RendererEvents {
  /** A native event, as a shell sends it: the view's number, the event, its payload's fields. */
  emit(id: number, event: string, payload?: Readonly<Record<string, unknown>>): void;
}

/** Whether a prop's new value is the one the view has: values are plain data. */
const sameValue = (current: unknown, next: unknown): boolean =>
  current === next ||
  (typeof current === 'object' &&
    current !== null &&
    typeof next === 'object' &&
    next !== null &&
    JSON.stringify(current) === JSON.stringify(next));

export class HeadlessRenderer {
  readonly engine = new LayoutEngine();
  readonly views = new Map<number, HeadlessView>();
  /** The root: a column the size of the window. */
  readonly root: HeadlessView;
  screen: Screen = IPHONE_18_PRO;
  fonts: FontTable;

  /** The renderer's share of the cost counters (docs/performance.md#cost-counters). */
  readonly counts = {
    propWrites: 0,
    wastedPropWrites: 0,
    layoutPasses: 0,
    wastedLayoutPasses: 0,
    viewsCreated: 0,
  };

  private readonly lists = new Map<number, ListState>();
  /** The batch wrote a measure, layout or structure prop, or edited the tree. */
  private layoutWanted = false;
  /** Measure writes whose climb may have stopped below the root. */
  private readonly contentNodes: number[] = [];
  /** Scroll views with a request to land once the batch is laid out. */
  private readonly requested = new Set<number>();
  private readonly events: RendererEvents;
  private cellCount = 0;

  constructor(fonts: FontTable, events: RendererEvents) {
    this.fonts = fonts;
    this.events = events;

    this.root = {
      id: 0,
      kind: 'VStack',
      label: '',
      parent: 0,
      children: [],
      props: new Map(),
      flattened: false,
      node: this.engine.create('VStack'),
      offset: { x: 0, y: 0 },
    };
  }

  view(id: number): HeadlessView {
    const view = id === 0 ? this.root : this.views.get(id);

    if (!view) throw new Error(`No view ${id} is in the tree`);

    return view;
  }

  // MARK: - Mutations

  /** A decoded batch, record by record, then laid out as the frame after it would be. */
  apply(mutations: readonly Mutation[]): void {
    const touched = new Set<number>();

    for (const mutation of mutations) this.mutate(mutation, touched);

    for (const id of touched) if (id === 0 || this.views.has(id)) this.relink(this.view(id));

    if (this.layoutWanted || this.engine.dirty(this.root.node)) this.layout();
    this.landScrolls();
  }

  /**
   * A Scroll's requests land after the layout the same batch brought, where
   * the platforms land them, and it reports where it rests. A list's land
   * on the list as an offset; only rows bound near it show.
   */
  private landScrolls(): void {
    for (const id of this.requested) {
      const view = this.views.get(id);
      const request = view?.props.get('scrollTo');

      if (!view || typeof request !== 'object' || request === null) continue;

      const horizontal = HORIZONTAL.has(view.kind);
      const { content, viewport } = this.scrollMetrics(view);
      const length = horizontal ? viewport.width : viewport.height;
      const end = Math.max((horizontal ? content.width : content.height) - length, 0);
      const target =
        'page' in request && typeof request.page === 'number'
          ? request.page * length
          : 'offset' in request && typeof request.offset === 'number'
            ? request.offset
            : 'end' in request && request.end === true
              ? end
              : null;

      if (target === null) continue;

      const along = Math.min(Math.max(target, 0), end);

      this.scrollTo(
        view,
        horizontal ? { x: along, y: view.offset.y } : { x: view.offset.x, y: along },
      );

      if (!LISTS.has(view.kind)) this.events.emit(view.id, 'scrollend', this.scrollPayload(view));
    }

    this.requested.clear();
  }

  /** What a scroll view reports of where it is: `scroll` and `scrollend`'s payload. */
  scrollPayload(view: HeadlessView): Record<string, number> {
    const { content, viewport } = this.scrollMetrics(view);

    return {
      x: view.offset.x,
      y: view.offset.y,
      contentWidth: content.width,
      contentHeight: content.height,
      layoutWidth: viewport.width,
      layoutHeight: viewport.height,
    };
  }

  private mutate(m: Mutation, touched: Set<number>): void {
    switch (m.op) {
      case 'create': {
        const parent = this.view(m.parent);
        const view: HeadlessView = {
          id: m.id,
          kind: m.kind,
          label: m.label,
          parent: m.parent,
          children: [],
          props: new Map(),
          flattened: m.flattened,
          node: this.engine.create(m.kind, (width, wm, height, hm) =>
            this.measure(view, width, wm, height, hm),
          ),
          offset: { x: 0, y: 0 },
        };

        this.views.set(m.id, view);
        parent.children.push(m.id);
        this.layoutWanted = true;
        if (!m.flattened) this.counts.viewsCreated++;
        touched.add(m.parent);

        if (LISTS.has(m.kind))
          this.lists.set(m.id, { keys: [], cells: new Map(), sizes: new Map() });

        return;
      }
      case 'remove': {
        const view = this.view(m.id);
        const parent = this.view(view.parent);

        parent.children.splice(parent.children.indexOf(m.id), 1);
        touched.add(view.parent);
        this.layoutWanted = true;
        this.destroy(view);

        return;
      }
      case 'move': {
        const view = this.view(m.id);
        const from = this.view(view.parent);

        from.children.splice(from.children.indexOf(m.id), 1);
        this.view(m.parent).children.splice(m.index, 0, m.id);
        view.parent = m.parent;
        touched.add(from.id);
        touched.add(m.parent);
        this.layoutWanted = true;

        return;
      }
      case 'flatten':
        this.view(m.id).flattened = m.flattened;
        this.layoutWanted = true;
        if (!m.flattened) this.counts.viewsCreated++;

        return;
      case 'prop':
        return this.setProp(this.view(m.id), m.name, m);
      // Commands act on state the platform keeps and the tree does not
      // (focus, the keyboard); the mutation log has them.
      case 'command':
        return;
      case 'ui':
      case 'uiScript':
      case 'uiKernel':
      case 'uiBundle':
        throw new Error(`A ${m.op} record is not a view mutation`);
    }
  }

  /**
   * The user typed into a field: it shows `text` with the caret at `caret`
   * and measures again, as a native field does without a batch.
   */
  typed(view: HeadlessView, text: string, caret: number): void {
    view.props.set('text', text);
    view.props.set('selection', { start: caret, end: caret });
    this.engine.markContentDirty(view.node);
    this.contentNodes.push(view.node);
    this.layoutWanted = true;
  }

  /** A prop from the kernel or the UI thread, by name. */
  setProp(view: HeadlessView, name: string, value: PropValue): void {
    this.counts.propWrites++;

    if (value.type !== 'keys' && sameValue(view.props.get(name), value.value))
      this.counts.wastedPropWrites++;

    if (value.type === 'keys') {
      const list = this.lists.get(view.id);
      const keys = applyKeys(list?.keys ?? [], value.value);

      if (list) list.keys = keys;
      view.props.set(name, keys);
    } else {
      view.props.set(name, value.value);
    }

    const effect = PROPS[name as keyof typeof PROPS]?.effect;

    if (effect === 'layout' || effect === 'measure' || effect === 'structure')
      this.layoutWanted = true;

    if (LAYOUT_PROPS.has(name)) this.engine.set(view.node, name, engineValue(value));

    if (effect === 'measure' && this.engine.measured(view.node)) {
      this.engine.markContentDirty(view.node);
      this.contentNodes.push(view.node);
    }

    if (name === 'cellKey') this.cellRendered(view);
    if (name === 'scrollTo' && value.value !== null) this.requested.add(view.id);
    if (name === 'edges' && view.kind === 'SafeArea') view.props.set('safeAreaInset', null);
    if (value.type === 'keys' || name === 'estimatedItemSize') this.engine.markDirty(view.node);
  }

  private destroy(view: HeadlessView): void {
    [...view.children].forEach((child) => this.destroy(this.view(child)));
    this.views.delete(view.id);
    this.lists.delete(view.id);
    this.engine.destroy(view.node);
  }

  /**
   * Re-inserts the nodes of `parent`'s children that its node lays out, in
   * tree order; the rest lay out on their own and inherit from it.
   */
  private relink(parent: HeadlessView): void {
    const children = parent.children.map((id) => this.view(id));

    children
      .filter((child) => !OWN_ROOTS.has(child.kind))
      .forEach((child, index) => this.engine.insert(parent.node, child.node, index));

    children
      .filter((child) => OWN_ROOTS.has(child.kind))
      .forEach((child) => this.engine.inheritFrom(child.node, parent.node));
  }

  /** The app's direction, its first language's: the root's, which every view inherits unless it has its own. */
  set direction(direction: 'ltr' | 'rtl') {
    this.engine.set(this.root.node, 'direction', direction);
  }

  // MARK: - Measuring

  private measure(
    view: HeadlessView,
    width: number,
    wm: MeasureMode,
    height: number,
    hm: MeasureMode,
  ): Size {
    const props = Object.fromEntries(view.props);
    const scale = this.screen.scale;
    const text = (value: unknown, fallback: Partial<ReturnType<typeof textStyle>> = {}) => {
      const style = { ...textStyle(props), ...fallback };

      return measureText(
        this.fonts,
        scale,
        transformed(typeof value === 'string' ? value : '', props.textTransform),
        style,
        width,
        wm,
        height,
        hm,
      );
    };
    const up = (value: number) => Math.ceil(value * scale - 1e-6) / scale;

    switch (view.kind) {
      case 'Text':
        return text(props.text);
      case 'Button': {
        // UIButton(type: .system): its title in 15 pt, 6 pt above and below.
        const title = text(props.text, {
          fontSize: typeof props.fontSize === 'number' ? props.fontSize : 15,
        });

        return { width: title.width, height: up(title.height + 12) };
      }
      case 'TextField': {
        // UITextField's rounded border adds 14 pt on each side and 6 above
        // and below; a background removes it.
        const bordered = props.backgroundColor === undefined || props.backgroundColor === null;
        const shown =
          typeof props.text === 'string' && props.text !== '' ? props.text : props.placeholder;
        const field = text(shown);
        const lineHeight = text('M').height;

        return {
          width: bordered ? Math.max(field.width + 28, 33) : field.width,
          height: up(lineHeight + 1.7 + (bordered ? 12 : 0)),
        };
      }
      case 'MultilineTextField': {
        // UITextView without insets: its text's lines, within `lines`; more scroll inside.
        const line = text('M').height;
        const content = text(props.text);
        const [min, max] = lineRange(props.lines);
        const count = Math.min(Math.max(Math.round(content.height / line), min), max);
        const shown =
          props.text === '' || props.text === undefined ? text(props.placeholder) : content;

        return { width: wm === 'exactly' ? width : shown.width, height: up(count * line) };
      }
      case 'Toggle':
        return { width: 63, height: 28 };
      case 'Spinner':
        return { width: 20, height: 20 };
      case 'List':
      case 'HorizontalList':
        return this.measureList(view, width, wm, hm);
      default:
        // A native module's view: the platform draws it at whatever size the layout gives it.
        return { width: wm === 'exactly' ? width : 0, height: hm === 'exactly' ? height : 0 };
    }
  }

  // MARK: - Lists (KuitoListView, KuitoListLayout)

  private listGeometry(view: HeadlessView): {
    frames: Map<string, Rect>;
    length: number;
    cross: number;
  } {
    const list = this.lists.get(view.id);
    const horizontal = HORIZONTAL.has(view.kind);
    const insets = this.engine.box(view.node).inset;
    const number = (name: string) => {
      const value = view.props.get(name);

      return typeof value === 'number' ? value : 0;
    };
    const rowGap = number('rowGap') || number('gap');
    const columnGap = number('columnGap') || number('gap');
    const estimated = view.props.get('estimatedItemSize');
    const sizes = [...(list?.sizes.values() ?? [])];
    const placeholder =
      typeof estimated === 'number'
        ? estimated
        : sizes.length === 0
          ? 44
          : sizes.reduce((sum, size) => sum + (horizontal ? size.width : size.height), 0) /
            sizes.length;
    const cross = sizes.reduce(
      (max, size) => Math.max(max, horizontal ? size.height : size.width),
      0,
    );
    const frames = new Map<string, Rect>();
    const width = Math.max(this.engine.box(view.node).width - insets.left - insets.right, 0);
    let at = horizontal ? insets.left : insets.top;

    for (const key of list?.keys ?? []) {
      const size = list?.sizes.get(key);

      if (horizontal) {
        const rect = {
          x: at,
          y: insets.top,
          width: size?.width ?? placeholder,
          height: size?.height ?? cross,
        };

        frames.set(key, rect);
        at += rect.width + columnGap;
      } else {
        const rect = { x: insets.left, y: at, width, height: size?.height ?? placeholder };

        frames.set(key, rect);
        at += rect.height + rowGap;
      }
    }

    const keys = list?.keys.length ?? 0;
    const end = horizontal ? insets.right : insets.bottom;

    return {
      frames,
      length: (keys === 0 ? at : at - (horizontal ? columnGap : rowGap)) + end,
      cross,
    };
  }

  private measureList(view: HeadlessView, width: number, wm: MeasureMode, hm: MeasureMode): Size {
    const { length, cross } = this.listGeometry(view);

    if (HORIZONTAL.has(view.kind))
      return { width: wm === 'minContent' ? 0 : length, height: cross };

    return {
      width: wm === 'exactly' || wm === 'atMost' ? width : cross,
      height: hm === 'minContent' ? 0 : length,
    };
  }

  /** The rows near the list's viewport, a screen ahead and half one behind, get cells. */
  private bindWindow(view: HeadlessView): void {
    const list = this.lists.get(view.id);
    const box = this.engine.box(view.node);
    const horizontal = HORIZONTAL.has(view.kind);
    const length = horizontal ? box.width : box.height;

    if (!list || list.keys.length === 0 || length <= 0 || this.hiddenUnder(view)) return;

    const offset = horizontal ? view.offset.x : view.offset.y;
    const { frames } = this.listGeometry(view);
    const start = offset - length / 2;
    const end = offset + length * 2;

    for (const key of list.keys) {
      const frame = frames.get(key);

      if (!frame || list.cells.has(key)) continue;

      const from = horizontal ? frame.x : frame.y;
      const to = from + (horizontal ? frame.width : frame.height);

      if (to < start || from > end) continue;

      const cell = `__kuito:list-${view.id}:cell-${this.cellCount++}`;

      list.cells.set(key, cell);
      this.events.emit(view.id, 'bind', { cell, key });
    }
  }

  /** A row rendered its key: the list measures it at its column's width. */
  private cellRendered(cell: HeadlessView): void {
    const list = this.lists.get(cell.parent);
    const key = cell.props.get('cellKey');

    if (!list || typeof key !== 'string') return;

    this.markDirtyRow(cell, list, key);
  }

  private markDirtyRow(cell: HeadlessView, list: ListState, key: string): void {
    const listView = this.view(cell.parent);
    const width = HORIZONTAL.has(listView.kind)
      ? NaN
      : Math.max(
          this.engine.box(listView.node).width -
            this.engine.box(listView.node).inset.left -
            this.engine.box(listView.node).inset.right,
          0,
        );

    this.engine.calculate(cell.node, width, NaN, this.screen.scale);

    const { width: measured, height } = this.engine.box(cell.node);
    const previous = list.sizes.get(key);

    if (previous?.width === measured && previous.height === height) return;

    list.sizes.set(key, { width: measured, height });
    this.engine.markDirty(listView.node);
  }

  // MARK: - Layout

  /** Whether `view` or an ancestor is hidden: its frames are zero and nothing is bound. */
  hiddenUnder(view: HeadlessView): boolean {
    for (
      let current: HeadlessView | undefined = view;
      current && current.id !== 0;
      current = this.views.get(current.parent)
    )
      if (current.props.get('hidden') === true) return true;

    return false;
  }

  /** One frame's layout: every root, then the safe areas and lists it changed, until settled. */
  layout(): void {
    const contained = this.contentNodes.splice(0);
    const wanted = this.layoutWanted;

    this.layoutWanted = false;

    // A paint-only batch never marks layout: publishing every box is what
    // frames views that did not change (docs/native-renderer.md#prop-effects).
    if (wanted || this.engine.dirty(this.root.node) || this.ownRootDirty()) {
      const before = this.engine.cost();

      for (let pass = 0; pass < 8; pass++) {
        if (this.engine.dirty(this.root.node) || this.ownRootDirty()) this.calculateRoots();
        else for (const node of contained) this.calculateContained(node);

        if (!this.settleSafeAreas() && !this.remeasureRows()) break;
      }

      // A device lays out only what is dirty: a pass that computed no node is none.
      const after = this.engine.cost();

      if (after.nodesLaidOut > before.nodesLaidOut) {
        this.counts.layoutPasses++;

        if (after.wastedFrames - before.wastedFrames === after.nodesFramed - before.nodesFramed)
          this.counts.wastedLayoutPasses++;
      }
    }

    // UIKit lays out the lists that need it newest first, and each binds
    // its rows as it lays out: the kernel hears of the last list's first.
    [...this.lists.keys()].reverse().forEach((id) => this.bindWindow(this.view(id)));
  }

  /** A page, sheet or row whose own node is waiting for a pass. */
  private ownRootDirty(): boolean {
    for (const view of this.views.values())
      if (OWN_ROOTS.has(view.kind) && this.engine.dirty(view.node)) return true;

    return false;
  }

  /**
   * Lays out the highest dirty ancestor of `node` at the size it already
   * has. The screen root is left to calculateRoots: a cache hit there never
   * visits a dirty descendant.
   */
  private calculateContained(node: number): void {
    if (!this.engine.dirty(node)) return;

    let top = node;
    let parent = this.engine.parent(top);

    while (parent !== 0 && this.engine.dirty(parent)) {
      top = parent;
      parent = this.engine.parent(top);
    }

    if (parent === 0) return;

    const box = this.engine.box(top);

    if (box.width === 0 && box.height === 0) return;

    this.engine.calculate(top, box.width, box.height, this.screen.scale);
  }

  private calculateRoots(): void {
    const { width, height, scale } = this.screen;

    this.engine.calculate(this.root.node, width, height, scale);

    // Roots inside roots lay out after the one that sizes them: document order does it.
    for (const view of this.inOrder())
      if (OWN_ROOTS.has(view.kind) && view.kind !== 'ListCell') {
        const size = this.rootSize(view);

        this.engine.setInset(view.node, this.rootInset(view));
        this.engine.calculate(view.node, size.width, size.height, scale);
      }

    for (const [id, list] of this.lists)
      for (const child of this.view(id).children) {
        const cell = this.view(child);
        const key = cell.props.get('cellKey');

        if (typeof key === 'string') this.markDirtyRow(cell, list, key);
      }
  }

  /** Whether a row measured a new size, so its list lays out again. */
  private remeasureRows(): boolean {
    return [...this.lists.keys()].some((id) => this.engine.dirty(this.view(id).node));
  }

  /** The views in tree order. */
  private *inOrder(from: HeadlessView = this.root): Generator<HeadlessView> {
    for (const id of from.children) {
      const view = this.view(id);

      yield view;
      yield* this.inOrder(view);
    }
  }

  /** The size a page or a sheet lays out at: its container's. */
  private rootSize(view: HeadlessView): Size {
    if (view.kind === 'Sheet') {
      // A recording made before structured props holds them as JSON.
      const stored = view.props.get('snapPoints');
      const points: unknown = typeof stored === 'string' ? JSON.parse(stored) : stored;
      const first: unknown = Array.isArray(points) ? points[0] : undefined;
      const height =
        typeof first === 'string' && first.endsWith('%')
          ? (this.screen.height * Number(first.slice(0, -1))) / 100
          : typeof first === 'number'
            ? first
            : NaN;

      return { width: this.screen.width, height };
    }

    const container = this.engine.box(this.view(view.parent).node);

    return { width: container.width, height: container.height };
  }

  /** A page's safe area, as UIKit gives a controller's view: the window's, and the bars over it. */
  private rootInset(view: HeadlessView): Edges {
    if (view.kind === 'NavigationTab' || view.kind === 'ListCell') return NO_EDGES;

    const { insets } = this.screen;

    if (view.kind === 'Sheet') return { ...NO_EDGES, bottom: insets.bottom };

    const header = view.props.get('header') !== false;
    const inTabs = this.ancestors(view).some((each) => each.kind === 'NavigationTabs');

    return {
      top: insets.top + (header ? NAVIGATION_BAR : 0),
      right: insets.right,
      bottom: insets.bottom + (inTabs ? TAB_BAR : 0),
      left: insets.left,
    };
  }

  private ancestors(view: HeadlessView): HeadlessView[] {
    const found: HeadlessView[] = [];

    for (
      let current = this.views.get(view.parent);
      current;
      current = this.views.get(current.parent)
    )
      found.push(current);

    return found;
  }

  /**
   * Each SafeArea pads the part of it the system covers: its overlap with
   * its layout root's safe area (KuitoSafeAreaView). True when one changed.
   */
  private settleSafeAreas(): boolean {
    let changed = false;

    for (const view of this.views.values()) {
      if (view.kind !== 'SafeArea') continue;

      const frame = this.rootFrame(view);
      const root = this.layoutRoot(view);
      const bounds = root.id === 0 ? this.screen : this.engine.box(root.node);
      const safe = root.id === 0 ? this.screen.insets : this.rootInset(root);
      const edges = this.edges(view);
      const inset = {
        top: edges.has('top') ? Math.max(0, safe.top - frame.y) : 0,
        right: edges.has('right')
          ? Math.max(0, frame.x + frame.width - (bounds.width - safe.right))
          : 0,
        bottom: edges.has('bottom')
          ? Math.max(0, frame.y + frame.height - (bounds.height - safe.bottom))
          : 0,
        left: edges.has('left') ? Math.max(0, safe.left - frame.x) : 0,
      };
      const last = view.props.get('safeAreaInset');

      if (JSON.stringify(last) === JSON.stringify(inset)) continue;

      view.props.set('safeAreaInset', inset);
      this.engine.setInset(view.node, inset);
      changed = true;
    }

    return changed;
  }

  private edges(view: HeadlessView): Set<string> {
    // A recording made before structured props holds them as JSON.
    const stored = view.props.get('edges');
    const edges: unknown = typeof stored === 'string' ? JSON.parse(stored) : stored;

    return new Set(
      Array.isArray(edges)
        ? edges.filter((edge): edge is string => typeof edge === 'string')
        : ['top', 'right', 'bottom', 'left'],
    );
  }

  /** The nearest view that lays out `view`'s tree: a page, sheet or row, or the root. */
  layoutRoot(view: HeadlessView): HeadlessView {
    for (const ancestor of this.ancestors(view)) if (OWN_ROOTS.has(ancestor.kind)) return ancestor;

    return this.root;
  }

  /** `view`'s frame in its layout root, scroll offsets included. */
  private rootFrame(view: HeadlessView): Rect {
    let { x, y } = this.engine.box(view.node);
    const { width, height } = this.engine.box(view.node);

    for (const ancestor of this.ancestors(view)) {
      if (OWN_ROOTS.has(ancestor.kind)) break;

      const box = this.engine.box(ancestor.node);

      x += box.x - ancestor.offset.x;
      y += box.y - ancestor.offset.y;
    }

    return { x, y, width, height };
  }

  /** `view`'s frame in the window: what a touch on it reports as `pageX`/`pageY`. */
  windowFrame(view: HeadlessView): Rect {
    const frame = this.rootFrame(view);
    const root = this.layoutRoot(view);

    if (root.id === 0) return frame;

    const origin = this.windowFrame(root);

    if (root.kind === 'ListCell') {
      const list = this.view(root.parent);
      const key = root.props.get('cellKey');
      const row = typeof key === 'string' ? this.listGeometry(list).frames.get(key) : undefined;
      const at = this.windowFrame(list);

      return {
        ...frame,
        x: at.x + (row?.x ?? 0) - list.offset.x + frame.x,
        y: at.y + (row?.y ?? 0) - list.offset.y + frame.y,
      };
    }

    if (root.kind === 'Sheet') {
      const height = this.engine.box(root.node).height;

      return { ...frame, x: frame.x, y: this.screen.height - height + frame.y };
    }

    return { ...frame, x: origin.x + frame.x, y: origin.y + frame.y };
  }

  /** The view's frame from the layout, relative to its parent's node: what the device tree prints. */
  frame(view: HeadlessView): Rect {
    const { x, y, width, height } = this.engine.box(view.node);

    return { x, y, width, height };
  }

  /** Whether `view` is in a list row, whose frame follows the list's scrolling. */
  inRow(view: HeadlessView): boolean {
    return (
      view.kind === 'ListCell' || this.ancestors(view).some((each) => each.kind === 'ListCell')
    );
  }

  /** The text a view shows: a label's text as transformed, a button's title. */
  text(view: HeadlessView): string | null {
    const text = view.props.get('text');

    return typeof text === 'string' ? transformed(text, view.props.get('textTransform')) : null;
  }

  /**
   * Every view, one line each in id order, as the iOS renderer's
   * describeTree prints them (docs/devtools.md#recording-and-replay).
   */
  describeTree(): string {
    return [...this.views.keys()]
      .sort((a, b) => a - b)
      .map((id) => {
        const view = this.view(id);
        const frame = this.frame(view);
        let line = `${id} ${view.kind} in ${view.parent}`;

        line += this.inRow(view)
          ? ' in a list row'
          : ` ${point(frame.x)},${point(frame.y)} ${point(frame.width)}x${point(frame.height)}`;

        if (view.flattened) line += ' layout-only';

        const text = view.kind === 'Text' ? this.text(view) : null;

        if (text !== null) line += ` "${text}"`;

        return line;
      })
      .join('\n');
  }

  /** Scrolls a Scroll or a list to `offset`; a list binds the rows that come near. */
  scrollTo(view: HeadlessView, offset: { x: number; y: number }): void {
    view.offset = offset;
    if (LISTS.has(view.kind)) this.bindWindow(view);
  }

  /** The content and viewport a scroll event reports. */
  scrollMetrics(view: HeadlessView): { content: Size; viewport: Size } {
    const box = this.engine.box(view.node);

    if (LISTS.has(view.kind)) {
      const { length, cross } = this.listGeometry(view);

      return {
        content: HORIZONTAL.has(view.kind)
          ? { width: length, height: cross }
          : { width: box.width, height: length },
        viewport: { width: box.width, height: box.height },
      };
    }

    return { content: box.content, viewport: { width: box.width, height: box.height } };
  }

  static scrolls(kind: string): boolean {
    return SCROLLS.has(kind);
  }
}
