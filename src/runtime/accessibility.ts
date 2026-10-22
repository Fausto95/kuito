// Accessibility status and commands, for `accessibility`
// (src/native/accessibility.ts). Status comes from the native side once
// asked for and whenever it changes; announcements and focus are commands.
import { hostCommand } from './host';
import { queueOperation } from './operations';
import { motionPreference } from './state/animations';
import { boundaryJson } from './state/stats';
import { system } from './state/system';
import { findView } from './view-ids';
import { notify, subscribe, type Subscription } from './system';
import { own, type PlainData } from './values';

export interface AccessibilityStatus {
  screenReaderEnabled: boolean;
  reduceMotionEnabled: boolean;
}

/** The status each change event follows. */
const CHANGES: Readonly<Record<string, keyof AccessibilityStatus>> = Object.freeze({
  screenReader: 'screenReaderEnabled',
  reduceMotion: 'reduceMotionEnabled',
});

function flag(payload: PlainData, key: keyof AccessibilityStatus): boolean {
  const value = payload[key];

  if (typeof value !== 'boolean')
    throw TypeError('Invalid accessibility status: ' + key + ' must be a boolean');

  return value;
}

/** The native side answers once, then reports every change. */
function requestStatus(): void {
  if (system.accessibilityRequested) return;

  system.accessibilityRequested = true;
  hostCommand(0, 'accessibility.status');
}

export function accessibilityEvent(type: string, payload: PlainData): unknown {
  if (type !== 'status') throw Error('Unknown app event: accessibility.' + type);

  const next: AccessibilityStatus = {
    screenReaderEnabled: flag(payload, 'screenReaderEnabled'),
    reduceMotionEnabled: flag(payload, 'reduceMotionEnabled'),
  };
  const previous = system.accessibility;

  system.accessibility = next;

  // The first answer is a change too: from not known yet.
  Object.keys(CHANGES).forEach((name) => {
    const field = CHANGES[name];

    if (!previous || previous[field] !== next[field]) notify('accessibility.' + name, next[field]);
  });

  return undefined;
}

/**
 * Animations honor the user's motion preference on the UI thread: the kernel
 * listens for it when the UI runtime starts. The operation for what it
 * knows already goes first, so no animation runs before it.
 */
export function followMotionPreference(): PlainData | null {
  if (motionPreference.followed) return null;

  motionPreference.followed = true;

  subscribe('accessibility.reduceMotion', (on: unknown) =>
    queueOperation({ op: 'reduceMotion', on: on === true }),
  );

  requestStatus();

  return system.accessibility?.reduceMotionEnabled ? { op: 'reduceMotion', on: true } : null;
}

export const accessibility = Object.freeze({
  announce(message: unknown, options?: { queue?: unknown }): void {
    if (typeof message !== 'string') throw TypeError('An announcement must be a string');

    hostCommand(
      0,
      'accessibility.announce',
      boundaryJson(JSON.stringify({ message, queue: options?.queue === true })),
    );
  },
  focus(target: unknown): void {
    const id =
      typeof target === 'object' && target !== null && 'id' in target ? target.id : undefined;

    const view = typeof id === 'string' ? findView(id) : null;

    if (view === null)
      throw TypeError('accessibility.focus needs a mounted element, such as ref.current');

    hostCommand(view, 'accessibility.focus');
  },
  /** The status the native side last reported, asking for it the first time; null until it answers. */
  status(): AccessibilityStatus | null {
    requestStatus();

    return system.accessibility;
  },
  addEventListener(name: string, listener: unknown): Subscription {
    if (!own(CHANGES, name))
      throw Error(
        'Unknown accessibility event "' +
          name +
          '". Use one of: ' +
          Object.keys(CHANGES).join(', '),
      );

    const subscription = subscribe('accessibility.' + name, listener);

    requestStatus();

    return subscription;
  },
});
