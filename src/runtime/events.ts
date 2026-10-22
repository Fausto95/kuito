import { accessibilityEvent } from './accessibility';
import { devtoolsEvent } from './devtools';
import type { ElementHandle } from './elements';
import { keyboardEvent } from './keyboard';
import { eventNumbers } from './state/batch';
import { handlers } from './state/modules';
import { parseBoundaryJson } from './state/stats';
import { elements, viewIds, views } from './state/views';
import { receiveFromUI } from './thread-encoding';
import { isPlainData, own, passedValue, type AnyFunction, type PlainData } from './values';
import { EVENT_RECORDS, REPORTED_PROPS, SYSTEM_EVENT_RECORDS } from './protocol.generated';
import { isModuleKind } from './modules';
import { batch, isWritable } from './signals';
import { labelOf } from './view-ids';
import { noteShown, showEdit } from './host';
import { hostIdle } from './patch';
import { holding } from './wire';
import { readRecord } from './event-records';
import { formatEdit, textEditOf, type TextEdit } from './text-edits';
import { reportError } from './errors';

/** A native or dispatched event; payload fields sit beside the standard ones. */
export interface KernelEvent {
  type: string;
  isTrusted?: boolean;
  bubbles?: boolean;
  cancelable?: boolean;
  target?: ElementHandle | null;
  currentTarget?: ElementHandle | null;
  eventPhase?: number;
  defaultPrevented?: boolean;
  stopPropagation?: () => void;
  stopImmediatePropagation?: () => void;
  preventDefault?: () => void;
  composedPath?: () => ElementHandle[];
  [payload: string]: unknown;
}

export type EventHandler = (event: KernelEvent) => unknown;

export interface EventProp {
  event: string;
  /** Passes the value the view reports with the event instead of the event (src/protocol/manifest.ts). */
  value?: true;
  /** A native prop set to true while the event has a listener, for events costly to send. */
  announce?: string;
  /** Native props that make the event fire every frame, for a handler on the UI thread. */
  everyFrame?: Readonly<Record<string, unknown>>;
  /** The prop takes a motion source, whose motion values the event moves (docs/motion.md#motion-sources). */
  source?: true;
}

/**
 * The payload field an event prop passes for `kind`: the field, or fields,
 * the view reports its value in, for a prop that passes the value; none
 * otherwise.
 */
export function passedField(kind: string, spec: EventProp): string | readonly string[] | undefined {
  if (!spec.value) return undefined;

  // A module's view reports its value as the payload's `value`.
  if (isModuleKind(kind)) return 'value';

  const reported = own(REPORTED_PROPS, kind) ? REPORTED_PROPS[kind] : {};
  const report = own(reported, spec.event) ? reported[spec.event] : null;

  if (report && 'fields' in report) return report.fields;

  if (!report || !('field' in report))
    throw new TypeError(kind + ' reports no value with its ' + spec.event + ' event');

  return report.field;
}

/** The handler, called with the payload's `field` (or fields) when there is one, else the event. */
export function adaptHandler(
  field: string | readonly string[] | undefined,
  handler: AnyFunction,
): EventHandler {
  return field ? (event) => handler(passedValue(event, field)) : (event) => handler(event);
}

/** A prop a view changes itself, as the manifest's `reports` says (src/protocol/manifest.ts). */
export type ReportedProp = { prop: string; announce?: string } & (
  | { field: string }
  | { fields: readonly string[] }
  | { value: boolean | number | string }
);

/**
 * State a native view changes itself and reports through an event: a field's
 * text, a switch's value, a dismissed sheet. The kernel records it as the
 * view's prop, so a controlled value that only repeats it is not sent back:
 * a late echo would overwrite what the user typed since (docs/keyboard.md).
 * A prop bound to a writable signal writes it, which is all two-way binding
 * is. A module's view reports a prop by a payload field of the prop's name.
 */
function recordReported(target: number | null, type: string, payload: PlainData): void {
  const view = target === null ? undefined : views.get(target);

  if (target === null || !view) return;

  const changed: Record<string, unknown> = {};

  if (isModuleKind(view.kind))
    Object.keys(payload).forEach((name) => {
      if (own(view.bindings, name)) changed[name] = payload[name];
    });
  else {
    const reported = own(REPORTED_PROPS, view.kind) ? REPORTED_PROPS[view.kind] : {};
    const report = own(reported, type) ? reported[type] : null;

    if (report && 'value' in report) changed[report.prop] = report.value;
    else if (report && 'fields' in report) {
      if (report.fields.every((field) => own(payload, field)))
        changed[report.prop] = passedValue(payload, report.fields);
    } else if (report && own(payload, report.field)) changed[report.prop] = payload[report.field];
  }

  Object.keys(changed).forEach((name) => {
    view.props[name] = changed[name];
    noteShown(target, name, changed[name]);

    const bound = own(view.bindings, name) ? view.bindings[name].signal : undefined;

    if (bound && isWritable(bound)) bound.value = changed[name];
  });
}

/**
 * A field's format on the JS thread: it answers the field's `format` events
 * the UI thread did not take. The field shows what it made of the edit, a
 * frame late, which is then the user's change and selection, as the field
 * reports them after a format the UI thread answered (docs/keyboard.md#formatting).
 */
export function formatOnJs(
  id: number,
  what: string,
  format: (text: string) => unknown,
): EventHandler {
  return (event) => {
    const edit = textEditOf(event);
    const shown = formatted(what, format, edit);
    const selection = { start: shown.start, end: shown.end };

    if (shown !== edit) showEdit(id, shown.text, selection);

    deliver(id, 'change', () => ({ text: shown.text }));
    deliver(id, 'selectionchange', () => selection);
  };
}

/** What `format` makes of `edit`; one that throws is reported, and the edit stays as typed. */
function formatted(what: string, format: (text: string) => unknown, edit: TextEdit): TextEdit {
  try {
    return formatEdit(format, edit);
  } catch (error) {
    reportError(what, error);

    return edit;
  }
}

/**
 * Events of the app rather than a view (handle 0), by their target: the UI
 * thread's messages, and app-wide state the native side tracks.
 */
const SYSTEM_TARGETS: Readonly<Record<string, (type: string, payload: PlainData) => unknown>> =
  Object.freeze({
    ui: (_type: string, payload: PlainData) => receiveFromUI(payload),
    keyboard: keyboardEvent,
    accessibility: accessibilityEvent,
    devtools: devtoolsEvent,
    host: hostEvent,
  });

function hostEvent(type: string): void {
  if (type !== 'idle') throw Error('Unknown app event: host.' + type);

  hostIdle();
}

export function both(first: EventHandler, second: EventHandler): EventHandler {
  return (event) => {
    first(event);
    second(event);
  };
}

/** A payload as it arrived: JSON text (a module view's), plain data (the UI thread's message), or none. */
function payloadOf(key: string, payload: string | PlainData | undefined): PlainData {
  if (payload === undefined || payload === '') return {};

  if (typeof payload === 'string') return parsePayload(key, payload);

  if (!isPlainData(payload)) throw new TypeError('Invalid event payload for ' + key);

  return payload;
}

function parsePayload(key: string, text: string): PlainData {
  let payload: unknown;

  try {
    payload = parseBoundaryJson(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'malformed JSON';

    throw new TypeError('Invalid event payload for ' + key + ': ' + reason);
  }

  if (!isPlainData(payload)) throw new TypeError('Invalid event payload for ' + key);

  return payload;
}

/** Capture, target and bubble phases through the native view tree. */
export function sendEvent(target: number, event: KernelEvent): boolean {
  if (
    typeof event !== 'object' ||
    event === null ||
    typeof event.type !== 'string' ||
    !views.has(target)
  )
    throw TypeError('Unknown event target');

  const route: number[] = [];
  let stop = false;
  let immediate = false;

  for (
    let cursor: number | null = target;
    cursor !== null && views.has(cursor);
    cursor = views.get(cursor)?.parent ?? null
  )
    route.push(cursor);

  event.target = elements.get(target) ?? null;
  event.currentTarget = null;
  event.defaultPrevented = false;

  event.stopPropagation = () => {
    stop = true;
  };

  event.stopImmediatePropagation = () => {
    stop = true;
    immediate = true;
  };

  event.preventDefault = () => {
    if (event.cancelable) event.defaultPrevented = true;
  };

  event.composedPath = () => route.flatMap((id) => elements.get(id) ?? []);

  function fire(id: number, capture: boolean, phase: number) {
    const element = elements.get(id);

    immediate = false;
    event.currentTarget = element ?? null;
    event.eventPhase = phase;

    const key = labelOf(id) + '.' + event.type + (capture ? ':capture' : '');

    if (own(handlers, key)) handlers[key].invoke(event);

    if (immediate || !element) return;

    element.listeners.slice().forEach((listener) => {
      if (immediate || listener.capture !== capture || listener.type !== event.type) return;

      if (listener.once) element.removeEventListener(listener.type, listener.fn, listener.capture);

      listener.fn(event);
    });
  }

  for (let index = route.length - 1; index > 0; index--) {
    fire(route[index], true, 1);

    if (stop) return !event.defaultPrevented;
  }

  fire(route[0], true, 2);

  if (!immediate) fire(route[0], false, 2);

  if (!stop && event.bubbles)
    for (let index = 1; index < route.length; index++) {
      fire(route[index], false, 3);

      if (stop) break;
    }

  event.currentTarget = null;
  event.eventPhase = 0;

  return !event.defaultPrevented;
}

/**
 * A native event: the view's number (0 for the app), the event and its
 * payload, if it carries one: a module view's as a JSON object, the UI
 * thread's messages as plain data (docs/events.md). What it changes goes to
 * the host in one batch.
 */
export function dispatch(handle: number, type: string, payload?: string | PlainData): unknown {
  return holding(() => batch(() => deliver(handle, type, (key) => payloadOf(key, payload))));
}

/**
 * A native event in its typed record: the payload's numbers in
 * `eventNumbers`, its strings in `strings`, in layout `layout`
 * (docs/events.md#typed-events). Read before any handler runs, so an event
 * a handler causes may reuse the record.
 */
export function dispatchRecord(
  handle: number,
  type: string,
  layout: number,
  strings?: readonly unknown[],
): unknown {
  if (typeof layout !== 'number')
    throw new TypeError('Typed events are (handle, event, layout, strings)');

  return holding(() =>
    batch(() =>
      deliver(handle, type, (key, kind) => {
        const expected = kind === undefined ? layout : recordLayout(kind, type);

        if (expected !== layout)
          throw new TypeError(
            key +
              ' arrived in layout ' +
              layout +
              '; ' +
              (kind ?? 'the app') +
              ' sends it in ' +
              expected,
          );

        return readRecord(layout, eventNumbers, strings);
      }),
    ),
  );
}

/** The layout the manifest gives `kind`'s `type` event (null kind: the app's); undefined for none. */
function recordLayout(kind: string | null, type: string): number | undefined {
  if (kind === null)
    return own(SYSTEM_EVENT_RECORDS, type) ? SYSTEM_EVENT_RECORDS[type] : undefined;

  const kinds = own(EVENT_RECORDS, type) ? EVENT_RECORDS[type] : {};

  return own(kinds, kind) ? kinds[kind] : own(kinds, 'all') ? kinds.all : undefined;
}

/**
 * Delivers an event whose payload `read` gives, by the key that names it and
 * the kind of its view: null for the app's events, undefined for a view now
 * gone, whose late event no handler hears.
 */
function deliver(
  handle: number,
  type: string,
  read: (key: string, kind: string | null | undefined) => PlainData,
): unknown {
  if (typeof handle !== 'number' || typeof type !== 'string')
    throw new TypeError('Native events are (handle, event, payload)');

  if (handle === 0) {
    const dot = type.indexOf('.');
    const target = dot === -1 ? type : type.slice(0, dot);

    if (!own(SYSTEM_TARGETS, target)) throw Error('Unknown app event: ' + type);

    return SYSTEM_TARGETS[target](type.slice(dot + 1), read(type, null));
  }

  const label = viewIds.labels.get(handle);

  // Numbers are never reused: one the kernel gave out and no longer knows is
  // a removed view's, and its late event is dropped (a focused field blurs as
  // it leaves the window).
  if (label === undefined) {
    if (handle > 0 && handle <= viewIds.next) return undefined;

    throw Error('Unknown view ' + handle + ' for its ' + type + ' event');
  }

  const payload = read(label + '.' + type, views.get(handle)?.kind);

  const target = views.has(handle) ? handle : null;

  recordReported(target, type, payload);

  const event: KernelEvent = Object.assign({ type, isTrusted: true }, payload);

  if (type === 'press' && target !== null) {
    event.bubbles = true;
    event.cancelable = true;

    return sendEvent(target, event);
  }

  const key = label + '.' + type;
  const element = target === null ? null : (elements.get(target) ?? null);
  const listeners = element
    ? element.listeners.filter((record) => record.type === type && !record.capture)
    : [];

  // Native views report every event; one nobody listens to is dropped.
  if (!own(handlers, key) && !listeners.length) return undefined;

  event.target = element;
  event.currentTarget = element;

  const result = own(handlers, key) ? handlers[key].invoke(event) : undefined;

  // Its element's listeners hear it at the target: how a module's state
  // object, such as a video's, follows the view it is the ref of.
  listeners.forEach((record) => {
    if (record.once) element?.removeEventListener(record.type, record.fn, record.capture);

    record.fn(event);
  });

  return result;
}
