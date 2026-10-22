import native, {
  type SplashFrame as Frame,
  type SplashLayout as Layout,
} from '../../native/modules/splash/splash';
import type { Signal } from '../ui/reactivity';
import { report, signal } from './scope';

/** A rectangle of the window, in points (iOS) and dp (Android). */
export type SplashFrame = Frame;

/** Where the launch screen draws its logo and brand. */
export type SplashLayout = Layout;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFrame = (value: unknown): value is SplashFrame =>
  isRecord(value) &&
  [value.x, value.y, value.width, value.height].every(
    (n) => typeof n === 'number' && Number.isFinite(n),
  ) &&
  (value.width as number) > 0 &&
  (value.height as number) > 0;

/**
 * Where the splash draws its logo and brand; null when the app has no splash.
 * The platform's frames are checked: finite, and not empty.
 */
export function layout(): SplashLayout | null {
  const value: unknown = native.layout();

  if (value === null) return null;

  if (isRecord(value) && isFrame(value.logo) && (value.brand === null || isFrame(value.brand)))
    return { logo: value.logo, brand: value.brand };

  throw new Error('splash: invalid layout from the platform: ' + JSON.stringify(value));
}

// The native splash screen kuito.config.ts generates (docs/splash.md). It
// stays up until the app's first screen is on screen, or until `hide` once
// `hold` was called.

/** Keeps the splash up after the first screen, until `hide`. Call it before the first render. */
export const hold = (): void => native.preventAutoHide();

/**
 * Hides the splash once the views the app rendered so far are on screen,
 * at once or with a fade. Settles when it is gone.
 */
export const hide = ({ fade = false }: { fade?: boolean } = {}): Promise<void> => native.hide(fade);

/** Whether the native splash is still up; watched, it turns false once it is gone. */
export const visible = native.visible;

let chosen: Signal<string | null> | null = null;

const chosenVariant = () => (chosen ??= signal(native.getVariant()));

/**
 * The variant the next launch shows, or null for the default look; it starts
 * as the one this launch showed. Assigning picks another: Android 13 and
 * later only. Elsewhere the write is rejected through the error seam, and the
 * signal goes back.
 */
export const variant: Signal<string | null> = {
  get value() {
    return chosenVariant().value;
  },
  set value(name) {
    const previous = chosenVariant().value;

    chosenVariant().value = name;

    native.setVariant(name).catch((error: unknown) => {
      chosenVariant().value = previous;
      report('splash.variant could not be set')(error);
    });
  },
};
