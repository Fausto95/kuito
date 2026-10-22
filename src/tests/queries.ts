// Finding views in the headless tree as a user finds them on screen: by
// their text and by their accessibility role and name. Only what is shown
// counts: a hidden subtree, a closed sheet and a screen under another are
// not on screen.
import type { HeadlessRenderer, HeadlessView, Rect } from './renderer.ts';

/** Makes the data a test reads its own realm's (HeadlessHost.adopt, adoptList). */
export interface Realm {
  adopt<T>(value: T): T;
  adoptList<T>(items: readonly T[]): T[];
}

/** A view of the headless tree, as a query finds it. Reads what the view holds now. */
export class TestView {
  readonly #renderer: HeadlessRenderer;
  readonly #view: HeadlessView;
  readonly #realm: Realm;

  constructor(renderer: HeadlessRenderer, view: HeadlessView, realm: Realm) {
    this.#renderer = renderer;
    this.#view = view;
    this.#realm = realm;
    views.set(this, view);
  }

  /** The number the kernel names the view by. */
  get id(): number {
    return this.#view.id;
  }

  /** Its primitive: `Text`, `Pressable`, `HStack`, ... */
  get kind(): string {
    return this.#view.kind;
  }

  /** A label's text as shown (textTransform applied), a button's title; null for others. */
  get text(): string | null {
    return this.#renderer.text(this.#view);
  }

  /** Each native prop's last value, as a shell receives it: colors as 0xRRGGBBAA, JSON as text. */
  get props(): Readonly<Record<string, unknown>> {
    return this.#realm.adopt(Object.fromEntries(this.#view.props));
  }

  /** The frame the layout engine gave it, in points, relative to its parent. */
  get frame(): Rect {
    return this.#realm.adopt(this.#renderer.frame(this.#view));
  }

  /** Where it shows in the window, scrolling included: where a touch on it lands. */
  get windowFrame(): Rect {
    return this.#realm.adopt(this.#renderer.windowFrame(this.#view));
  }

  get parent(): TestView | null {
    const parent = this.#renderer.views.get(this.#view.parent);

    return this.#view.parent === 0 || !parent
      ? null
      : new TestView(this.#renderer, parent, this.#realm);
  }

  get children(): TestView[] {
    return this.#realm.adoptList(
      this.#view.children.map(
        (id) => new TestView(this.#renderer, this.#renderer.view(id), this.#realm),
      ),
    );
  }
}

const views = new WeakMap<TestView, HeadlessView>();

/** The renderer's own view behind `view`, for the host's events. */
export function headlessOf(view: TestView): HeadlessView {
  const found = views.get(view);

  if (!found) throw new Error('Not a view a query of this test found');

  return found;
}

/** ARIA's role for a platform role the kernel sends (src/runtime/accessibility-props.ts). */
const ARIA: Readonly<Record<string, string>> = {
  header: 'heading',
  image: 'img',
  search: 'searchbox',
  adjustable: 'slider',
};

/** What the platforms report for a view with no `role`. */
const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  Button: 'button',
  Toggle: 'switch',
  Image: 'img',
  Symbol: 'img',
  TextField: 'textbox',
  MultilineTextField: 'textbox',
  Spinner: 'progressbar',
  // UIDatePicker's compact style and Android's are buttons that open the picker.
  'module:DatePicker': 'button',
  // HTML's select is a combobox; UIKit's pop-up button and Android's drop-down list say so.
  'module:Select': 'combobox',
  // ARIA's role for one exclusive choice among several; both platforms check one segment.
  'module:SegmentedControl': 'radiogroup',
  // ARIA's role for a picture made of shapes, as SVG's <svg role="img">.
  'module:Drawing': 'img',
};

export type TextMatch = string | RegExp;

export interface RoleOptions {
  /** The accessible name: its `label`, or the text inside it. */
  name?: TextMatch;
}

const matches = (text: string, match: TextMatch) =>
  typeof match === 'string' ? text === match : match.test(text);

export interface Queries {
  /** The one view showing `text`; throws when none or several do. */
  getByText(text: TextMatch): TestView;
  getAllByText(text: TextMatch): TestView[];
  queryByText(text: TextMatch): TestView | null;
  /** The one view with `role` (and `name`, when given); throws when none or several have it. */
  getByRole(role: string, options?: RoleOptions): TestView;
  getAllByRole(role: string, options?: RoleOptions): TestView[];
  queryByRole(role: string, options?: RoleOptions): TestView | null;
}

/** The views under `from` that are on screen, in tree order. */
function* shown(renderer: HeadlessRenderer, from: HeadlessView): Generator<HeadlessView> {
  const children = from.children.map((id) => renderer.view(id));
  // A stack shows its top screen.
  const screens = children.filter((child) => child.kind === 'NavigationScreen');
  const top = screens[screens.length - 1];

  for (const child of children) {
    if (child.props.get('hidden') === true) continue;
    if (child.kind === 'NavigationScreen' && child !== top) continue;
    if (child.kind === 'Sheet' && child.props.get('open') !== true) continue;

    yield child;
    yield* shown(renderer, child);
  }
}

/** The text a screen reader reads for the view: its label, or the text inside it. */
function accessibleName(renderer: HeadlessRenderer, view: HeadlessView): string {
  const label = view.props.get('label');

  if (typeof label === 'string') return label;

  return [view, ...shown(renderer, view)]
    .map((each) => renderer.text(each))
    .filter((text): text is string => text !== null && text !== '')
    .join(' ');
}

function roleOf(view: HeadlessView): string | null {
  const role = view.props.get('role');

  if (typeof role === 'string') return ARIA[role] ?? role;

  return IMPLICIT_ROLES[view.kind] ?? null;
}

function describe(found: readonly HeadlessView[], what: string): string {
  return `${found.length} views show ${what}: ${found.map((view) => `${view.kind} ${view.id}`).join(', ')}`;
}

/** Queries over the views under `scope` (the root for the whole screen). */
export function queriesOf(
  renderer: HeadlessRenderer,
  scope: () => HeadlessView,
  realm: Realm,
): Queries {
  const wrap = (views: HeadlessView[]) =>
    realm.adoptList(views.map((view) => new TestView(renderer, view, realm)));
  const byText = (text: TextMatch) =>
    [...shown(renderer, scope())].filter((view) => {
      const shownText = renderer.text(view);

      return shownText !== null && matches(shownText, text);
    });
  const byRole = (role: string, { name }: RoleOptions = {}) =>
    [...shown(renderer, scope())].filter(
      (view) =>
        roleOf(view) === role &&
        (name === undefined || matches(accessibleName(renderer, view), name)),
    );
  const one = (found: HeadlessView[], what: string) => {
    if (found.length === 1) return wrap(found)[0];
    if (found.length === 0) throw new Error(`No view shows ${what}.\n\n${renderer.describeTree()}`);

    throw new Error(describe(found, what));
  };
  const textName = (text: TextMatch) => `the text ${String(text)}`;
  const roleName = (role: string, options?: RoleOptions) =>
    `the role ${role}` + (options?.name === undefined ? '' : ` named ${String(options.name)}`);

  return {
    getByText: (text) => one(byText(text), textName(text)),
    getAllByText: (text) => {
      const found = byText(text);

      if (found.length === 0) throw new Error(`No view shows ${textName(text)}.`);

      return wrap(found);
    },
    queryByText: (text) => {
      const found = byText(text);

      if (found.length > 1) throw new Error(describe(found, textName(text)));

      return found.length ? wrap(found)[0] : null;
    },
    getByRole: (role, options) => one(byRole(role, options), roleName(role, options)),
    getAllByRole: (role, options) => {
      const found = byRole(role, options);

      if (found.length === 0) throw new Error(`No view has ${roleName(role, options)}.`);

      return wrap(found);
    },
    queryByRole: (role, options) => {
      const found = byRole(role, options);

      if (found.length > 1) throw new Error(describe(found, roleName(role, options)));

      return found.length ? wrap(found)[0] : null;
    },
  };
}
