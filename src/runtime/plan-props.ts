// A planned view's props: its events and gestures, style, groups and
// aliases, and the bindings of those that follow signals.
import { isCallbackAttribute } from '../protocol/attributes';
import { ACCESSIBILITY_ALIASES } from './accessibility-props';
import {
  adaptHandler,
  both,
  formatOnJs,
  passedField,
  type EventHandler,
  type EventProp,
} from './events';
import { attachGestures } from './gestures';
import { isUIBinding } from './host';
import { attachMotionSource } from './motion-sources';
import { moduleViewName } from './modules';
import type { Binding } from './plan';
import type { ClassBinding } from './plan-classes';
import { childrenFingerprint, childText } from './plan-values';
import { assertAnimated, assertPropAnimation } from './prop-animation';
import {
  EVENT_PROPS,
  EVENT_RECORDS,
  PROP_ALIASES,
  GROUP_FIELD_KINDS,
  PROP_GROUPS,
  PROP_KEYS,
  REPORTED_PROPS,
  STRUCTURAL_PROPS,
} from './protocol.generated';
import { isSignalLike } from './signals';
import { handlers } from './state/modules';
import type { Rebind } from './state/threads';
import { views } from './state/views';
import { forwardEvent, placeFormat, placeHandler, placeProp, placeText } from './threads';
import { motionRecord } from './motion-values';
import { dict, isFunction, isJsonData, isPlainData, own, type PlainData } from './values';

/** What the plan of the view's module gives its props: where their handlers go. */
export interface PropsPlan {
  moduleId: string;
  rebinds: Rebind[];
  pendingHandlers: Record<string, EventHandler>;
  uiHandlers: Record<string, PlainData>;
  /** Evaluate a `when` with tracking; its signals re-plan the innermost branch owner. */
  condition: (when: unknown) => unknown;
  setHandler: (key: string, handler: EventHandler) => void;
  setUIHandler: (key: string, operation: PlainData) => void;
}

const RESERVED_PROPS = ['id', 'key', 'class', 'children', 'ref'];

/** The kinds that send their edits as `format` events: the ones a `format` formats. */
const FORMATTED_KINDS = EVENT_RECORDS.format;

/** What a field reports once its format answered an edit. */
const FORMAT_REPORTS = ['change', 'selectionchange'];

function handleOnce(handler: EventHandler): EventHandler {
  return (event) => {
    event.stopPropagation?.();

    return handler(event);
  };
}

/**
 * A label computed from its children. The same children (a cached
 * component's tree) keep their label; so do children whose source is
 * unchanged, unless the plan evaluates every expression again.
 */
export function textBinding(
  id: number,
  kind: string,
  children: unknown,
  fields: Record<string, unknown>,
  reevaluate: boolean,
): Binding {
  const evaluate = () => childText(children);
  const fingerprint = childrenFingerprint(children);
  const prior = views.get(id);
  const priorBinding = prior?.bindings.text;
  // A UI-thread label is placed again, so the plan claims the ids it encodes.
  const canRetain =
    !!priorBinding &&
    !isUIBinding(prior?.props.text) &&
    (Object.is(priorBinding.source, children) ||
      (!reevaluate && fingerprint !== null && priorBinding.fingerprint === fingerprint));
  const tracked =
    canRetain && prior
      ? { value: prior.props.text, evaluate, dependencies: priorBinding.dependencies }
      : placeText(kind, children, evaluate);

  fields.text = tracked.value;

  return {
    key: 'text',
    evaluate: tracked.evaluate,
    dependencies: tracked.dependencies,
    source: children,
    fingerprint,
  };
}

export function applyProps(
  plan: PropsPlan,
  id: number,
  label: string,
  kind: string,
  props: Record<string, unknown>,
  fields: Record<string, unknown>,
  bindings: Binding[],
  moduleEvents: string[] | null,
  following: Record<string, ClassBinding>,
): boolean {
  const { moduleId, pendingHandlers, uiHandlers, condition, setHandler, setUIHandler } = plan;
  const elementEvents = dict<EventHandler>();
  // A JSX expression arrives as a thunk: read it as a condition, so a
  // signal it reads re-plans the view's gestures.
  const attached = attachGestures(
    kind,
    id,
    isFunction(props.gestures) ? condition(props.gestures) : props.gestures,
    plan.rebinds,
  );

  if (attached) {
    const eventId = label + '.gesture';

    fields.gestures = attached.native;

    if (attached.ui) setUIHandler(eventId, attached.ui);

    if (attached.js) {
      if (own(pendingHandlers, eventId)) throw new Error('Duplicate handler: ' + eventId);

      setHandler(eventId, attached.js);
    }
  }

  const aliases = own(PROP_ALIASES, kind) ? PROP_ALIASES[kind] : {};
  const structural = own(STRUCTURAL_PROPS, kind) ? STRUCTURAL_PROPS[kind] : [];
  /** The prop that set each native prop. */
  const sources = dict<string>();

  Object.keys(props).forEach((key) => {
    if (RESERVED_PROPS.indexOf(key) !== -1 || structural.indexOf(key) !== -1) return;

    const raw = props[key];

    // Attached above.
    if (key === 'gestures') return;

    // A field's format answers its edits: on the UI thread when it can
    // move there, and on this one when the UI thread did not take one.
    if (key === 'format' && own(FORMATTED_KINDS, kind)) {
      const format = isFunction(raw) && '__kuitoExprKey' in raw ? condition(raw) : raw;

      if (format == null) return;

      if (!isFunction(format))
        throw new TypeError(
          kind + ' format must be a function from the text typed to the text shown',
        );

      const eventId = label + '.format';
      const ui = placeFormat(kind, format);

      if (ui) setUIHandler(eventId, { fn: ui, format: true });

      setHandler(eventId, formatOnJs(id, kind + ' format', format));
      fields.formats = true;

      return;
    }

    const spec = eventProp(kind, key, moduleEvents);

    // A motion source: the event moves its motion values, here and on the UI thread.
    if (spec?.source) {
      const eventId = label + '.' + spec.event;
      const attached = attachMotionSource(kind, isFunction(raw) ? condition(raw) : raw);

      if (!attached) return;

      if (own(pendingHandlers, eventId)) throw new Error('Duplicate handler: ' + eventId);

      if (attached.ui) setUIHandler(eventId, attached.ui);

      setHandler(eventId, attached.js);

      if (spec.announce) fields[spec.announce] = true;

      return;
    }

    if (spec) {
      if (!isFunction(raw)) throw new TypeError(kind + ' ' + key + ' must be a function');

      const eventId = label + '.' + spec.event;
      const field = passedField(kind, spec);
      // One handler per event can run on the UI thread.
      const alone = !own(elementEvents, eventId);
      const uiHandler = alone ? placeHandler(kind, key, raw) : null;

      if (uiHandler) {
        if (own(uiHandlers, eventId)) throw new Error('Duplicate handler: ' + eventId);

        setUIHandler(eventId, field ? { fn: uiHandler, field } : { fn: uiHandler });

        // A Pressable's own press reaches the UI thread from the view; one
        // that bubbles from a Pressable inside it, through this thread.
        if (kind === 'Pressable' && spec.event === 'press') {
          const handler = forwardEvent(id, 'press');

          elementEvents[eventId] = handler;
          setHandler(eventId, handler);
        }

        if (spec.announce) fields[spec.announce] = true;

        const everyFrame = spec.everyFrame ?? {};

        // The app's own value wins: it is applied with the rest of its props.
        Object.keys(everyFrame).forEach((name) => {
          if (!own(props, name)) fields[name] = everyFrame[name];
        });

        return;
      }

      let handler = adaptHandler(field, raw);

      // The innermost Pressable handles a press, as React Native's responder does.
      if (kind === 'Pressable' && spec.event === 'press') handler = handleOnce(handler);

      if (own(elementEvents, eventId)) handler = both(elementEvents[eventId], handler);
      else if (own(pendingHandlers, eventId)) throw new Error('Duplicate handler: ' + eventId);

      if (own(handlers, eventId) && handlers[eventId].owner !== moduleId)
        throw new Error('Handler owned by another module: ' + eventId);

      elementEvents[eventId] = handler;
      setHandler(eventId, handler);

      if (spec.announce) fields[spec.announce] = true;

      return;
    }

    // `style`: an object of native props the compiler wrote from CSS.
    if (key === 'style') {
      const read = () => {
        const value: unknown = isFunction(raw) ? raw() : raw;

        return isSignalLike(value) ? value.value : value;
      };
      const style = read();

      if (style == null) return;

      if (!isPlainData(style) || Array.isArray(style))
        throw new TypeError('style on ' + label + ' takes an object, compiled from style={{ … }}');

      const reactive = isFunction(raw) || isSignalLike(raw);

      Object.keys(style).forEach((name) => {
        if (!own(PROP_KEYS, name))
          throw new TypeError(
            'style on ' + label + ' sets ' + name + ', which is not a native prop',
          );

        setField(
          name,
          key,
          reactive
            ? () => {
                const next = read();

                return isPlainData(next) && own(next, name) ? Reflect.get(next, name) : null;
              }
            : Reflect.get(style, name),
          raw,
        );
      });

      return;
    }

    if (own(PROP_GROUPS, key)) {
      const fields = PROP_GROUPS[key];
      const pick = (value: unknown, field: string) => {
        if (value == null) return null;

        if (!isPlainData(value) || Array.isArray(value))
          throw new TypeError(
            key + ' takes an object of ' + Object.keys(fields).join(', ') + ' on ' + label,
          );

        const fieldValue: unknown = own(value, field) ? Reflect.get(value, field) : undefined;

        return fieldValue === undefined ? null : fieldValue;
      };
      const read = () => {
        const value: unknown = isFunction(raw) ? raw() : raw;

        return isSignalLike(value) ? value.value : value;
      };
      // A reactive object sets every field, so one it drops is cleared.
      const reactive = isFunction(raw) || isSignalLike(raw);

      Object.keys(fields).forEach((field) => {
        const name = fields[field];
        const taken = own(GROUP_FIELD_KINDS, name) ? GROUP_FIELD_KINDS[name] : null;

        // A field this kind has no setter for is not sent, not even as null.
        if (taken && !own(taken, kind)) return;

        if (reactive) setField(name, key, () => pick(read(), field), raw);
        else if (pick(raw, field) !== null) setField(name, key, pick(raw, field), raw);
      });

      return;
    }

    if (own(ACCESSIBILITY_ALIASES, key)) {
      const alias = ACCESSIBILITY_ALIASES[key];
      // A reactive value sets every fact, so one it drops is cleared.
      const names = isFunction(raw)
        ? alias.names
        : alias.names.filter((name) => alias.pick(raw, name) !== null);

      names.forEach((name) =>
        setField(
          name,
          key,
          isFunction(raw) ? () => alias.pick(raw(), name) : alias.pick(raw, name),
          raw,
        ),
      );

      return;
    }

    setField(own(aliases, key) ? aliases[key] : key, key, raw);
  });

  // A format the JS thread runs reports the edit from this thread: a
  // handler of it on the UI thread hears it through here.
  if (fields.formats === true)
    FORMAT_REPORTS.forEach((event) => {
      const eventId = label + '.' + event;

      if (!own(uiHandlers, eventId) || own(elementEvents, eventId)) return;

      elementEvents[eventId] = forwardEvent(id, event);
      setHandler(eventId, elementEvents[eventId]);
    });

  if (fields.animate !== undefined && fields.animate !== null && !isUIBinding(fields.animate))
    assertAnimated(
      fields.animate,
      (name) => (own(sources, name) ? sources[name] : null),
      (name, other) => setTwice(name, other, 'animate'),
    );

  return Object.keys(elementEvents).length > 0;

  function setTwice(name: string, first: string, second: string): Error {
    return new TypeError(
      'Native prop ' +
        name +
        ' on ' +
        label +
        ' is set by both ' +
        first +
        ' and ' +
        second +
        '. Use one of them.',
    );
  }

  function announceReported(name: string) {
    const reported = own(REPORTED_PROPS, kind) ? REPORTED_PROPS[kind] : {};

    Object.keys(reported).forEach((event) => {
      const announce = reported[event].announce;

      if (reported[event].prop === name && announce) fields[announce] = true;
    });
  }

  function setField(name: string, source: string, raw: unknown, identity: unknown = raw) {
    if (own(sources, name)) throw setTwice(name, sources[name], source);

    sources[name] = source;
    delete following[name];

    // A motion value or a signal passed as a prop is bound to it.
    const value = motionRecord(raw) || isSignalLike(raw) ? () => raw : raw;

    if (isFunction(value)) {
      const prior = retained(id, name, identity);

      if (prior) {
        fields[name] = prior.value;
        bindings.push(prior.binding);

        if (prior.binding.signal) announceReported(name);
      } else {
        const placed = placeProp(kind, source, value);

        fields[name] = placed.value;

        bindings.push({
          key: name,
          evaluate: placed.evaluate,
          dependencies: placed.dependencies,
          source: identity,
          ...(placed.signal && { signal: placed.signal }),
        });

        // A bound prop the view reports on an event it sends only when asked.
        if (placed.signal) announceReported(name);
      }
    } else {
      fields[name] = raw === undefined ? null : raw;
    }

    assertPropAnimation(name, fields[name]);

    if (!isUIBinding(fields[name]) && !isJsonData(fields[name]))
      throw new TypeError('Native prop ' + name + ' must resolve to a scalar or plain data');
  }
}

/**
 * The committed binding of `name` on the view being planned, when it came
 * from the same thunk: its value is current, since its subscriptions kept
 * it so. A UI-thread binding is placed again, so the plan claims the ids
 * it encodes.
 */
function retained(
  id: number,
  name: string,
  identity: unknown,
): { value: unknown; binding: Binding } | null {
  const prior = views.get(id);
  const binding = prior?.bindings[name];

  if (!prior || !binding || !Object.is(binding.source, identity)) return null;

  const value = prior.props[name];

  return isUIBinding(value) ? null : { value, binding };
}

/**
 * The event a prop listens to: React Native's event props, or for a module's
 * view the events it declares, `onChangeEnd` for `changeEnd`.
 */
function eventProp(kind: string, key: string, moduleEvents: string[] | null): EventProp | null {
  if (!moduleEvents) return own(EVENT_PROPS, key) ? EVENT_PROPS[key] : null;

  if (!isCallbackAttribute(key)) return null;

  const event = key.charAt(2).toLowerCase() + key.slice(3);

  if (moduleEvents.indexOf(event) === -1)
    throw new TypeError(
      moduleViewName(kind) +
        ' does not emit ' +
        JSON.stringify(event) +
        '. It emits: ' +
        (moduleEvents.join(', ') || 'no events'),
    );

  // A view's onChange passes its value, as a TextField's and a Toggle's do.
  return event === 'change' ? { event, value: true } : { event };
}
