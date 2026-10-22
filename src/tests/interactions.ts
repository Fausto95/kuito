// A user's touches and typing, as the shells' views turn them into native
// events (docs/events.md): the same events and payloads, through the same
// path, then the host settles what they started.
import type { HeadlessHost } from './host.ts';
import type { HeadlessView } from './renderer.ts';
import { HeadlessRenderer } from './renderer.ts';

const PRESSABLE = new Set(['Pressable', 'Button', 'Toggle']);

/** `view` or the nearest view around it that takes `kinds`: where a touch on it lands. */
function target(
  host: HeadlessHost,
  view: HeadlessView,
  accepts: (kind: string) => boolean,
  what: string,
) {
  for (
    let current: HeadlessView | undefined = view;
    current;
    current = host.renderer.views.get(current.parent)
  )
    if (accepts(current.kind)) return current;

  throw new Error(`${view.kind} ${view.id} is not inside ${what}`);
}

export interface PressOptions {
  /** Holds it past the long-press delay: `onLongPress` instead of `onPress`. */
  long?: boolean;
}

/** A tap on `view`, at its center, as a Pressable, Button or Toggle reports one. */
export async function press(
  host: HeadlessHost,
  view: HeadlessView,
  { long = false }: PressOptions = {},
) {
  const pressed = target(
    host,
    view,
    (kind) => PRESSABLE.has(kind),
    'a Pressable, Button or Toggle',
  );

  if (pressed.props.get('disabled') === true) return host.settle();

  if (pressed.kind === 'Button') {
    host.dispatch(pressed.id, 'press');

    return host.settle();
  }

  if (pressed.kind === 'Toggle') {
    host.dispatch(pressed.id, 'change', { value: pressed.props.get('checked') !== true });

    return host.settle();
  }

  const frame = host.renderer.windowFrame(pressed);
  const touch = {
    locationX: frame.width / 2,
    locationY: frame.height / 2,
    pageX: frame.x + frame.width / 2,
    pageY: frame.y + frame.height / 2,
  };

  host.dispatch(pressed.id, 'pressin', touch);
  await host.settle();

  if (long) {
    // KuitoPressableView's default long-press delay.
    await host.advance(500);
    host.dispatch(pressed.id, 'longpress', touch);
  }

  host.dispatch(pressed.id, 'pressout', touch);
  if (!long) host.dispatch(pressed.id, 'press', touch);

  return host.settle();
}

const FIELDS = new Set(['TextField', 'MultilineTextField']);

/**
 * Types `text` into a TextField at its caret: it focuses, then shows and
 * reports its text after each character. A field with a format sends the
 * edit to it first, and reports the change once the UI thread answered, as
 * a native field does (docs/keyboard.md#formatting).
 */
export async function type(host: HeadlessHost, view: HeadlessView, text: string) {
  const field = target(host, view, (kind) => FIELDS.has(kind), 'a TextField');

  host.dispatch(field.id, 'focus');

  for (const character of text) {
    const shown = textOf(field);
    const { start, end } = selectionOf(field, shown.length);
    const typed = shown.slice(0, start) + character + shown.slice(end);
    const caret = start + character.length;

    host.renderer.typed(field, typed, caret);

    if (field.props.get('formats') !== true) host.dispatch(field.id, 'change', { text: typed });
    else if (host.dispatch(field.id, 'format', { text: typed, start: caret, end: caret })) {
      host.dispatch(field.id, 'change', { text: textOf(field) });

      // The format's caret is the user's: their edit moved it.
      const moved = selectionOf(field, textOf(field).length);

      if (
        field.props.get('emitsSelection') === true &&
        (moved.start !== caret || moved.end !== caret)
      )
        host.dispatch(field.id, 'selectionchange', moved);
    }

    await host.settle();
  }

  return host.settle();
}

function textOf(field: HeadlessView): string {
  const text = field.props.get('text');

  return typeof text === 'string' ? text : '';
}

/** The field's selection as its `selection` prop last set it, or the caret at the end. */
function selectionOf(field: HeadlessView, length: number): { start: number; end: number } {
  const range = field.props.get('selection');

  if (
    typeof range !== 'object' ||
    range === null ||
    !('start' in range) ||
    !('end' in range) ||
    typeof range.start !== 'number' ||
    typeof range.end !== 'number'
  )
    return { start: length, end: length };

  return { start: Math.min(range.start, length), end: Math.min(range.end, length) };
}

/** The content length each view last reported reaching the end of. */
const reachedAt = new WeakMap<HeadlessView, number>();

export interface ScrollOffset {
  x?: number;
  y?: number;
}

/**
 * Scrolls the Scroll or list `view` is in to `offset`, as a drag that ends
 * there, on the nearest page of a paging view: a list binds the rows that
 * come near, and the view reports the scroll, its motion at rest there,
 * reaching its end when the app listens, and a Scroll where it rests.
 */
export async function scroll(host: HeadlessHost, view: HeadlessView, offset: ScrollOffset) {
  const scrolled = target(
    host,
    view,
    (kind) => HeadlessRenderer.scrolls(kind),
    'a Scroll or a list',
  );
  const { renderer } = host;
  const { content, viewport } = renderer.scrollMetrics(scrolled);
  const clamp = (value: number, content: number, viewport: number) =>
    Math.max(0, Math.min(value, Math.max(content - viewport, 0)));
  // A paging view rests on the page nearest where the drag lets go.
  const paged = (value: number, length: number) =>
    scrolled.props.get('paging') === true && length > 0
      ? Math.round(value / length) * length
      : value;
  const x = clamp(
    paged(offset.x ?? scrolled.offset.x, viewport.width),
    content.width,
    viewport.width,
  );
  const y = clamp(
    paged(offset.y ?? scrolled.offset.y, viewport.height),
    content.height,
    viewport.height,
  );

  renderer.scrollTo(scrolled, { x, y });

  // A drag that ends where it lands: the view is at rest there, within its range.
  if (scrolled.props.get('emitsMotion') === true)
    host.dispatch(scrolled.id, 'motion', {
      offset: scrolled.kind.startsWith('Horizontal') ? x : y,
      velocity: 0,
      overscroll: 0,
    });

  if (scrolled.props.get('emitsScroll') === true)
    host.dispatch(scrolled.id, 'scroll', renderer.scrollPayload(scrolled));

  // A list reports no rest, as on the platforms.
  if (!scrolled.kind.endsWith('List'))
    host.dispatch(scrolled.id, 'scrollend', renderer.scrollPayload(scrolled));

  const horizontal = scrolled.kind.startsWith('Horizontal');
  const length = horizontal ? content.width : content.height;
  const visible = horizontal ? viewport.width : viewport.height;
  const threshold = scrolled.props.get('reachEndThreshold');

  const near =
    length - ((horizontal ? x : y) + visible) <=
    (typeof threshold === 'number' ? threshold : 0.5) * visible;

  // Once per content length, as a list re-arms it when its rows grow.
  if (near && reachedAt.get(scrolled) !== length) {
    reachedAt.set(scrolled, length);
    host.dispatch(scrolled.id, 'reachend');
  }

  return host.settle();
}

/** What a DatePicker of each type shows: a pick changes that and keeps the rest of the moment. */
const SHOWN: Readonly<Record<string, { day: boolean; time: boolean }>> = {
  date: { day: true, time: false },
  time: { day: false, time: true },
  datetime: { day: true, time: true },
};

/** Midnight of `moment`'s day, in the device's zone: the host's here. */
const dayOf = (moment: number) => new Date(moment).setHours(0, 0, 0, 0);

const day = (moment: number) => new Date(moment).toDateString();

/**
 * The value a DatePicker reports for `choice`: what its type shows comes
 * from `choice`, the rest from its value, kept within `min` and `max`. A day
 * outside them cannot be picked.
 */
function momentOf(picker: HeadlessView, choice: Date | string): number {
  if (typeof choice === 'string') throw new Error('choose takes a Date for a DatePicker');

  const picked = choice.getTime();
  const type = picker.props.get('type') ?? 'date';
  const shown = typeof type === 'string' ? SHOWN[type] : undefined;
  const current = picker.props.get('value');
  const min = picker.props.get('min');
  const max = picker.props.get('max');

  if (!Number.isFinite(picked)) throw new Error('choose takes a valid Date for a DatePicker');
  if (!shown) throw new Error(`DatePicker ${picker.id} has no type ${JSON.stringify(type)}`);

  if (shown.day && typeof min === 'number' && dayOf(picked) < dayOf(min))
    throw new Error(`${day(picked)} is before its min, ${day(min)}: a user cannot pick it`);

  if (shown.day && typeof max === 'number' && dayOf(picked) > dayOf(max))
    throw new Error(`${day(picked)} is after its max, ${day(max)}: a user cannot pick it`);

  const kept = new Date(typeof current === 'number' ? current : Date.now());
  const from = { day: shown.day ? choice : kept, time: shown.time ? choice : kept };
  const whole = new Date(
    from.day.getFullYear(),
    from.day.getMonth(),
    from.day.getDate(),
    from.time.getHours(),
    from.time.getMinutes(),
    kept.getSeconds(),
    kept.getMilliseconds(),
  ).getTime();
  // In that order, as both platforms keep a pick within the bounds.
  const above = Math.max(whole, typeof min === 'number' ? min : whole);

  return Math.min(above, typeof max === 'number' ? max : above);
}

/** A view's options, as the shell received them: JSON text or the data itself. */
function optionsOf(view: HeadlessView): { value: string; label: string }[] {
  const raw = view.props.get('options');
  // None yet, as both platforms show an unset list.
  const options: unknown = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? []);

  if (
    !Array.isArray(options) ||
    !options.every(
      (option: unknown) =>
        typeof option === 'object' &&
        option !== null &&
        typeof Reflect.get(option, 'value') === 'string' &&
        typeof Reflect.get(option, 'label') === 'string',
    )
  )
    throw new Error(`${view.kind} ${view.id} has no options of { value, label }`);

  return options as { value: string; label: string }[];
}

/**
 * The value of the option of a Select or SegmentedControl that shows
 * `choice`, as a user finds it by its label.
 */
function optionOf(view: HeadlessView, choice: Date | string): string {
  const name = view.kind.replace(/^module:/, '');

  if (typeof choice !== 'string') throw new Error(`choose takes an option's label for a ${name}`);

  const options = optionsOf(view);
  const showing = options.filter(({ label }) => label === choice);
  const option = showing[0];

  if (showing.length > 1)
    throw new Error(
      `${showing.length} options of the ${name} show ${choice}: a user cannot tell them apart`,
    );

  if (!option)
    throw new Error(
      `The ${name} has no option ${choice}: it has ${options.map(({ label }) => label).join(', ')}`,
    );

  return option.value;
}

/**
 * The item of a ContextMenu that shows `choice`, as a user finds it by its
 * label once a long press opens the menu. A disabled item cannot be picked.
 */
function itemOf(menu: HeadlessView, choice: Date | string): string {
  if (typeof choice !== 'string') throw new Error("choose takes an item's label for a ContextMenu");

  const raw = menu.props.get('items');
  const items: unknown = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? []);

  if (
    !Array.isArray(items) ||
    !items.every(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        typeof Reflect.get(item, 'value') === 'string' &&
        typeof Reflect.get(item, 'label') === 'string',
    )
  )
    throw new Error(`ContextMenu ${menu.id} has no items of { value, label }`);

  const showing = (items as { value: string; label: string; disabled?: boolean }[]).filter(
    ({ label }) => label === choice,
  );
  const item = showing[0];

  if (showing.length > 1)
    throw new Error(
      `${showing.length} items of the ContextMenu show ${choice}: a user cannot tell them apart`,
    );

  if (!item)
    throw new Error(
      `The ContextMenu has no item ${choice}: it has ${(items as { label: string }[]).map(({ label }) => label).join(', ')}`,
    );

  if (item.disabled === true) throw new Error(`${choice} is disabled: a user cannot pick it`);

  return item.value;
}

/**
 * The views `choose` picks in, by kind: the value each reports for a choice,
 * and the event it reports it with.
 */
const CHOOSERS: Readonly<
  Record<string, { event: string; value: (view: HeadlessView, choice: Date | string) => unknown }>
> = {
  'module:DatePicker': { event: 'change', value: momentOf },
  'module:Select': { event: 'change', value: optionOf },
  'module:SegmentedControl': { event: 'change', value: optionOf },
  'module:ContextMenu': { event: 'select', value: itemOf },
};

/**
 * Picks `choice` in the DatePicker, Select, SegmentedControl or ContextMenu
 * `view` is in, and reports it as the view does: a moment in a DatePicker,
 * an option or item by its label in the others. A disabled one takes no
 * touch.
 */
export async function choose(host: HeadlessHost, view: HeadlessView, choice: Date | string) {
  const chosen = target(
    host,
    view,
    (kind) => Object.hasOwn(CHOOSERS, kind),
    'a DatePicker, Select, SegmentedControl or ContextMenu',
  );
  const chooser = CHOOSERS[chosen.kind];

  if (!chooser) throw new Error(`${chosen.kind} ${chosen.id} takes no choice`);

  // What the user could not pick throws, disabled or not.
  const value = chooser.value(chosen, choice);

  if (chosen.props.get('disabled') === true) return host.settle();

  host.dispatch(chosen.id, chooser.event, { value });

  return host.settle();
}
