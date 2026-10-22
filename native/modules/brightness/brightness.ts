import { defineModule, fn } from '../../../src/native/define-module';

// The screen's brightness while this app is in front (docs/brightness.md).
// The system's brightness comes back when the app goes to the background or
// reloads, and the app's when it returns.
export default defineModule('Brightness', {
  getBrightness: fn.main<() => Promise<number>>(),
  setBrightness: fn.main<(level: number) => Promise<void>>(),
  restoreSystemBrightness: fn.main<() => Promise<void>>(),
  isUsingSystemBrightness: fn.main<() => Promise<boolean>>(),
  ios: { class: 'KuitoBrightnessModule' },
  android: { class: 'dev.kuito.runtime.modules.brightness.KuitoBrightnessModule' },
});
