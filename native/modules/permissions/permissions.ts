import { defineModule, fn } from '../../../src/native/define-module';

/**
 * What an app can ask for. `location` is "when in use"; `locationAlways` is
 * location in the background too, and asks for `location` first.
 */
export type PermissionName =
  | 'camera'
  | 'microphone'
  | 'photos'
  | 'location'
  | 'locationAlways'
  | 'notifications';

/**
 * `limited` is access the user narrowed: a selection of photos (iOS 14+,
 * Android 14+).
 */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'limited';

export type PermissionResponse = {
  status: PermissionStatus;
  /** False when `request` cannot show the system prompt; only Settings can change it (`app.openSettings`). */
  canAskAgain: boolean;
};

// Runtime permissions: one status model for every device-access module
// (docs/permissions.md). Other modules ask through the native helpers
// (KuitoPermissions) directly, not through these functions.
export default defineModule('Permissions', {
  /** The current status, without prompting. */
  check: fn.main.callback<(name: PermissionName) => Promise<PermissionResponse>>(),
  /** Shows the system prompt when it can, and resolves with the user's answer. */
  request: fn.main.callback<(name: PermissionName) => Promise<PermissionResponse>>(),
  ios: { class: 'KuitoPermissionsModule' },
  android: { class: 'dev.kuito.runtime.modules.permissions.KuitoPermissionsModule' },
});
