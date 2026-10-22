import { defineModule, fn, live, view } from '../../../src/native/define-module';
import type { SplashPartViewProps } from '../../../src/native/splash-screen';

/** A rectangle of the window, in points (iOS) and dp (Android). */
export type SplashFrame = { x: number; y: number; width: number; height: number };

/** Where the launch screen draws its logo and brand. */
export type SplashLayout = { logo: SplashFrame; brand: SplashFrame | null };

// The native splash screen kuito.config.ts generates (docs/splash.md), and
// the view that draws its parts again. The launch screen is the shell's own
// (KuitoSplash), which hides at the first frame with content; the module
// holds and hides it.
export default defineModule('Splash', {
  /** Null when the app has no splash. */
  layout: fn.sync<() => SplashLayout | null>(),
  /** Whether the native splash is still up; it goes once per launch. */
  visible: live<boolean>(),
  preventAutoHide: fn.sync<() => void>(),
  hide: fn.main.callback<(fade: boolean) => Promise<void>>(),
  /** The variant the next launch shows; null for the default look. */
  getVariant: fn.sync<() => string | null>(),
  setVariant: fn.main<(name: string | null) => Promise<void>>(),
  view: view<SplashPartViewProps>(),
  ios: { class: 'KuitoSplashModule' },
  android: { class: 'dev.kuito.runtime.modules.splash.KuitoSplashModule' },
});
