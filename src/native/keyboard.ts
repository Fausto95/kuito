import type {
  KeyboardEventName,
  KeyboardFrame,
  KeyboardFrameEvent,
  KeyboardRuntime,
} from '../ui/keyboard';
import type { Motion } from '../ui/motion';
import type { EventSubscription } from './modules';
import { source, watching } from './scope';

export type { KeyboardEventName, KeyboardFrame, KeyboardFrameEvent } from '../ui/keyboard';

// The software keyboard (docs/keyboard.md). Avoiding it needs none of this:
// the native side moves views in step with the keyboard (`keyboard={{ avoid }}`,
// a Scroll's `keyboard={{ inset }}`).
function runtime(): KeyboardRuntime {
  if (!globalThis.__kuito) throw Error('keyboard requires the Kuito runtime');

  return globalThis.__kuito.keyboard;
}

/** Subscriptions to `events` that each set what `read` says now; stops them all. */
function following<T>(events: KeyboardEventName[], read: () => T, set: (value: T) => void) {
  const subscriptions = events.map((event) => runtime().addListener(event, () => set(read())));

  return () => subscriptions.forEach((subscription) => subscription.remove());
}

const shown = () => runtime().frame() !== null;

/** Whether the keyboard is on screen: true once it has shown, false once it has hidden. */
export const visible = source(shown, (set) => following(['didShow', 'didHide'], shown, set));

/**
 * The shown keyboard's frame on screen, in points; null while it is hidden.
 * A motion value the UI thread moves from the keyboard's own events, so a
 * view bound to it moves without the JS thread; read it anywhere.
 */
export const frame: Motion<KeyboardFrame | null> = /* @__PURE__ */ runtime().frameMotion();

/**
 * How far the keyboard stands over the window's bottom now, in points; 0
 * while hidden. A motion value the keyboard moves every frame, as it
 * animates and as a finger drags it down, so a view bound to it rides on
 * the keyboard with no JavaScript (docs/keyboard.md#keyboard).
 */
export const height: Motion<number> = /* @__PURE__ */ runtime().heightMotion();

/**
 * Calls `listener` with each `event`: `willShow`, `didShow`, `willHide`,
 * `didHide`, `willChangeFrame` or `didChangeFrame`. Both platforms send every
 * one, Will events included (Android through WindowInsetsAnimation). In a
 * component it stops when the component unmounts; elsewhere the returned
 * subscription stops it.
 */
export function watch(
  event: KeyboardEventName,
  listener: (event: KeyboardFrameEvent) => void,
): EventSubscription {
  return watching('keyboard.watch', () => runtime().addListener(event, listener));
}

/** Hides the keyboard and blurs the focused input. */
export const dismiss = (): void => runtime().dismiss();
