// What the native side reports about the device, and app-wide listeners.
import type { AccessibilityStatus } from '../accessibility';
import type { KeyboardFrame } from '../keyboard';
import { type AnyFunction, dict } from '../values';
import type { MotionHandle } from './motion';

/** The BackgroundTasks module's members the kernel calls, as app code links them. */
export interface BackgroundTasksPlatform {
  finish(id: string, succeeded: boolean): Promise<void>;
  run: { addListener(listener: (payload: unknown) => void): unknown };
}

/**
 * Tasks the OS may run in the background, by name, the module the latest
 * definition came with, and whether the kernel listens for runs.
 */
export const backgroundTasks: {
  definitions: Record<string, AnyFunction>;
  platform: BackgroundTasksPlatform | null;
  listening: boolean;
} = { definitions: dict<AnyFunction>(), platform: null, listening: false };

/** Listeners to app-wide native events, by `<target>.<type>` (`keyboard.didshow`). */
export const systemListeners = dict<AnyFunction[]>();

/** What the native side last reported about the device. */
export const system: {
  /** The shown keyboard's frame; null while it is hidden. */
  keyboard: KeyboardFrame | null;
  /** keyboard.frame as a motion value, once the app asks for it. */
  keyboardFrame: { handle: MotionHandle; set(value: unknown): void } | null;
  /** keyboard.height as a motion value, once the app asks for it. */
  keyboardHeight: { handle: MotionHandle; set(value: unknown): void } | null;
  /** Null until the native side first answers `accessibility.status`. */
  accessibility: AccessibilityStatus | null;
  accessibilityRequested: boolean;
} = {
  keyboard: null,
  keyboardFrame: null,
  keyboardHeight: null,
  accessibility: null,
  accessibilityRequested: false,
};
