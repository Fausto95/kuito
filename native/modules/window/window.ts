import { defineModule, live } from '../../../src/native/define-module';

/** How far the system bars, the notch and the home indicator reach into the window. */
export type WindowInsets = { top: number; left: number; bottom: number; right: number };

export type WindowOrientation = 'portrait' | 'landscape';

export type WindowMetrics = {
  width: number;
  height: number;
  insets: WindowInsets;
  orientation: WindowOrientation;
};

// The app's window, in points (iOS) and dp (Android): the shell reports it
// after each layout, so a rotation, a resize or new insets reach it
// (docs/window.md), into KuitoWindowMetrics, the shell's own state.
export default defineModule('Window', {
  metrics: live<WindowMetrics>(),
  ios: { class: 'KuitoWindowModule' },
  android: { class: 'dev.kuito.runtime.modules.window.KuitoWindowModule' },
});
