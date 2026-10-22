import { defineModule, event, fn, live } from '../../../src/native/define-module';

/**
 * `active` in the foreground, `background` when another app or the home
 * screen is, `inactive` in between: a call, the app switcher, Control Center,
 * or on Android another activity partly covering this one.
 */
export type AppState = 'active' | 'background' | 'inactive';

// The app's own state and actions (docs/app-state.md), from the lifecycle
// the shell reports to KuitoAppLifecycle, its own state.
export default defineModule('AppState', {
  /**
   * Whether the app is in the foreground. Watched, it follows the platform;
   * starting to observe sends the state the platform starts from, which
   * catches a change made in between.
   */
  state: live<AppState>(),
  /** The system warns that memory runs low. */
  memoryWarning: event(),
  openSettings: fn.main.callback<() => Promise<void>>(),
  ios: { class: 'KuitoAppStateModule' },
  android: { class: 'dev.kuito.runtime.modules.appstate.KuitoAppStateModule' },
});
