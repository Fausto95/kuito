// The messages the JS-thread kernel sends, one entry per operation.
import { bind, unbind } from './bindings';
import { appFunction } from './budget';
import { isAnimation } from './animation';
import { animate } from './frames';
import { createMotion, writeMotion } from './motion';
import { exitView } from './exits';
import { follow, followersOf, stop } from './follows';
import {
  clearState,
  defined,
  functions,
  handlers,
  locations,
  motions,
  motionSettings,
  overBudget,
  watched,
} from './state';
import { dispatchEvent } from './events';
import { formatHandler } from './format';
import { followKeyboard } from './keyboard';
import { moveSource } from './sources';
import { decode } from './wire';
import { createGestureDispatcher } from '../runtime/gesture-events';
import { isPlainData, type PlainData } from '../runtime/values';

/** A view's gestures: one handler for its `gesture` events, calling callbacks and moving followers. */
function gestureHandler(key: string, gestures: unknown[]): (event: unknown) => unknown {
  const dispatch = createGestureDispatcher(
    gestures.map((gesture) => {
      if (
        !isPlainData(gesture) ||
        typeof gesture.tag !== 'number' ||
        typeof gesture.type !== 'string' ||
        typeof gesture.kind !== 'string' ||
        typeof gesture.gesture !== 'number'
      )
        throw new TypeError('Malformed gesture for ' + key);

      const callbacks = decode(gesture.callbacks);

      if (!isPlainData(callbacks)) throw new TypeError('Malformed gesture callbacks for ' + key);

      const named: Record<string, (...args: never[]) => unknown> = {};

      Object.keys(callbacks).forEach((name) => {
        named[name] = appFunction(callbacks[name], key + ' ' + name);
      });

      return {
        tag: gesture.tag,
        type: gesture.type,
        kind: gesture.kind,
        gesture: gesture.gesture,
        callbacks: named,
        ...(gesture.releasing !== undefined && { releasing: decode(gesture.releasing) }),
      };
    }),
    followersOf,
  );

  return (event) => {
    if (isPlainData(event)) dispatch(event);
  };
}

function text(operation: PlainData, field: string): string {
  const value = operation[field];

  if (typeof value !== 'string') throw new TypeError(`UI operation needs a string ${field}`);

  return value;
}

function viewNumber(operation: PlainData): number {
  const value = operation.view;

  if (typeof value !== 'number') throw new TypeError('UI operation needs a view number');

  return value;
}

/** A label's parts joined as JSX joins children: functions called, null and booleans empty. */
function label(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';

  if (Array.isArray(value)) return value.map(label).join('');

  if (typeof value === 'function') return label(Reflect.apply(value, undefined, []));

  if (isPlainData(value) && 'value' in value) return label(value.value);

  if (typeof value === 'string' || typeof value === 'number') return String(value);

  throw new TypeError('Text children must resolve to strings or numbers');
}

const OPERATIONS: Readonly<Record<string, (operation: PlainData) => void>> = {
  motion(operation) {
    const id = text(operation, 'id');
    const value = decode(operation.value);
    const js = typeof operation.version === 'number' ? operation.version : 0;
    const record = motions[id];

    if (!record) {
      createMotion(id, value, js);

      return;
    }

    record.js = js;

    if (isAnimation(value)) animate(record, value);
    else writeMotion(record, value);
  },
  bind(operation) {
    const view = viewNumber(operation);
    const prop = text(operation, 'prop');
    const source = decode(operation.source);

    if (typeof source === 'function') bind(view, prop, appFunction(source, view + '.' + prop));
    else if (Array.isArray(source)) bind(view, prop, () => label(source));
    else if (isPlainData(source) && 'value' in source) bind(view, prop, () => source.value);
    else throw new TypeError(view + '.' + prop + ' must be bound to a motion value or function');
  },
  unbind(operation) {
    unbind(viewNumber(operation), text(operation, 'prop'));
  },
  handler(operation) {
    const key = text(operation, 'key');
    const named = operation.field;
    const field =
      typeof named === 'string' ||
      (Array.isArray(named) && named.every((name) => typeof name === 'string'))
        ? named
        : null;

    handlers[key] = isPlainData(operation.motion)
      ? { fn: moveSource(key, operation.motion), field: null }
      : {
          fn: Array.isArray(operation.gestures)
            ? gestureHandler(key, operation.gestures)
            : operation.format === true
              ? formatHandler(
                  Number(key.slice(0, key.lastIndexOf('.'))),
                  appFunction(decode(operation.fn), key),
                )
              : appFunction(decode(operation.fn), key),
          field,
        };
  },
  /** An event the JS thread routed to a handler here: a press bubbling from a Pressable inside. */
  dispatch(operation) {
    const payload = isPlainData(operation.payload) ? operation.payload : {};

    dispatchEvent(viewNumber(operation), text(operation, 'event'), () => payload);
  },
  unhandle(operation) {
    delete handlers[text(operation, 'key')];
  },
  follow,
  /** A module's motion value the platform writes: made once, never written from here. */
  linked(operation) {
    const id = text(operation, 'id');

    if (!motions[id]) createMotion(id, decode(operation.value), 0);
  },
  /** keyboard.frame, which the keyboard's own events move. */
  keyboard(operation) {
    const id = text(operation, 'id');

    if (!motions[id]) createMotion(id, decode(operation.value), 0);

    followKeyboard(id);
  },
  exit(operation) {
    const tracks = operation.tracks;

    if (!Array.isArray(tracks)) throw new TypeError('An exit needs tracks');

    exitView(viewNumber(operation), tracks);
  },
  reduceMotion(operation) {
    motionSettings.reduceMotion = operation.on === true;
  },
  watch(operation) {
    watched.add(text(operation, 'id'));
  },
  free(operation) {
    const id = text(operation, 'id');
    const record = motions[id];

    if (record) stop(record);

    delete motions[id];
  },
  /** A new UI bundle ran: the functions only an earlier bundle defined go. */
  sweep() {
    Object.keys(functions).forEach((id) => {
      if (defined.has(id)) return;

      delete functions[id];
      delete locations[id];
    });

    defined.clear();
    // The patch may have made slow code quick, or quick code slow.
    overBudget.clear();
  },
  reset() {
    clearState();
  },
};

export function applyOperation(operation: unknown): void {
  if (!isPlainData(operation) || typeof operation.op !== 'string')
    throw new TypeError('Malformed UI operation');

  const apply = OPERATIONS[operation.op];

  if (!apply) throw new TypeError('Unknown UI operation ' + operation.op);

  apply(operation);
}
