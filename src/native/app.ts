import AppStateModule, { type AppState as State } from '../../native/modules/app-state/app-state';
import type { EventSubscription } from './modules';
import { watching } from './scope';

/**
 * `active` in the foreground, `background` when another app or the home
 * screen is, `inactive` in between.
 */
export type AppState = State;

// The app's own state and actions (docs/app-state.md).

/**
 * Whether the app is in the foreground. Watched, it follows the platform;
 * starting to observe reports the state the platform starts from, which
 * catches a change made in between.
 */
export const state = AppStateModule.state;

type Events = { memoryWarning: () => void };

/**
 * Calls `listener` when the system warns that memory runs low. In a
 * component it stops when the component unmounts; elsewhere the returned
 * subscription stops it.
 */
export function watch<E extends keyof Events>(event: E, listener: Events[E]): EventSubscription {
  if (event !== 'memoryWarning')
    throw new TypeError('app.watch: no "' + String(event) + '" event; watch memoryWarning');

  return watching('app.watch', () => AppStateModule.memoryWarning.addListener(() => listener()));
}

/** Opens this app's page in the system Settings. */
export const openSettings = AppStateModule.openSettings;
