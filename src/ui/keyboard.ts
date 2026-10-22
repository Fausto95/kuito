// The kernel's keyboard glue that `keyboard` (src/native/keyboard.ts) builds on.
import type { Motion } from './motion';

/** The keyboard's frame on screen, in points. */
export interface KeyboardFrame {
  screenX: number;
  screenY: number;
  width: number;
  height: number;
}

export interface KeyboardFrameEvent {
  /** Where the keyboard ends up; height 0 once it hides. */
  frame: KeyboardFrame;
  /** Milliseconds; 0 when the keyboard does not animate. */
  duration: number;
  /** The native curve: `keyboard` (the system's own), `easeInEaseOut`, `easeIn`, `easeOut` or `linear`. */
  easing: string;
}

export type KeyboardEventName =
  | 'willShow'
  | 'didShow'
  | 'willHide'
  | 'didHide'
  | 'willChangeFrame'
  | 'didChangeFrame';

export interface EventSubscription {
  remove(): void;
}

export interface KeyboardRuntime {
  dismiss(): void;
  addListener(
    name: KeyboardEventName,
    listener: (event: KeyboardFrameEvent) => void,
  ): EventSubscription;
  frame(): KeyboardFrame | null;
  frameMotion(): Motion<KeyboardFrame | null>;
  heightMotion(): Motion<number>;
}
