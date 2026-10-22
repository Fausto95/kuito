// Listeners to app-wide native events: the keyboard, accessibility status.
import { systemListeners } from './state/system';
import { isFunction } from './values';

export interface Subscription {
  remove(): void;
}

export function subscribe(key: string, listener: unknown): Subscription {
  if (!isFunction(listener)) throw TypeError('Listener must be a function');

  const listeners = systemListeners[key] ?? (systemListeners[key] = []);

  listeners.push(listener);

  return {
    remove() {
      const index = listeners.indexOf(listener);

      if (index !== -1) listeners.splice(index, 1);
    },
  };
}

export function notify(key: string, value: unknown): void {
  (systemListeners[key] ?? []).slice().forEach((listener) => listener(value));
}
