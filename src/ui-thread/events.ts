import { flush } from './bindings';
import { report } from './errors';
import { eventNumbers, handlers, parseJson } from './state';
import { readRecord } from '../runtime/event-records';
import { isPlainData, own, passedValue } from '../runtime/values';

/** A native event with its JSON payload: a module view's (docs/events.md). */
export function jsonEvent(handle: number, type: string, payload: string): boolean {
  return dispatchEvent(handle, type, () => (payload ? parseJson(payload) : {}));
}

/**
 * A native event in its typed record (docs/events.md#typed-events). Without
 * a handler here it goes on to the JS thread unread.
 */
export function recordEvent(
  handle: number,
  type: string,
  layout: number,
  strings?: readonly unknown[],
): boolean {
  return dispatchEvent(handle, type, () => readRecord(layout, eventNumbers, strings));
}

/**
 * Runs the UI-thread handler for view `handle`'s `type` event, if there is
 * one, with the payload `read` gives, and applies what it changed before
 * returning. False sends the event to the JS thread.
 */
export function dispatchEvent(handle: number, type: string, read: () => unknown): boolean {
  const key = handle + '.' + type;

  if (!own(handlers, key)) return false;

  const handler = handlers[key];
  const data = read();

  if (!isPlainData(data)) throw new TypeError('Event payload for ' + key + ' must be an object');

  const event: Record<string, unknown> = Object.assign({ type }, data);

  try {
    handler.fn(passedValue(event, handler.field));
  } catch (error) {
    report(key, error);
  }

  flush();

  return handler.passes !== true;
}
