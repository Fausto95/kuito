import type { AccessibilityRuntime, AccessibilityStatus } from '../ui/accessibility';
import type { ElementHandle } from '../ui/refs';
import { removing, source } from './scope';

// The screen reader and the user's motion preference (docs/accessibility.md).
function runtime(): AccessibilityRuntime {
  if (!globalThis.__kuito) throw Error('accessibility requires the Kuito runtime');

  return globalThis.__kuito.accessibility;
}

function status<K extends keyof AccessibilityStatus>(
  field: K,
  event: 'screenReader' | 'reduceMotion',
) {
  return source(
    (): boolean | null => runtime().status()?.[field] ?? null,
    (set) => removing(runtime().addEventListener(event, set)),
  );
}

/** Whether VoiceOver or TalkBack is on; null until the platform first answers. */
export const screenReader = status('screenReaderEnabled', 'screenReader');

/** Whether the user asked for less motion; null until the platform first answers. */
export const reduceMotion = status('reduceMotionEnabled', 'reduceMotion');

/**
 * The screen reader reads `message`, interrupting what it is saying; with
 * `queue: true` it waits for current speech (iOS; Android always queues).
 */
export const announce = (message: string, options: { queue?: boolean } = {}): void =>
  runtime().announce(message, options);

/** Moves the screen reader's focus to a mounted element, such as `ref.current`. */
export const focus = (element: ElementHandle): void => runtime().focus(element);
