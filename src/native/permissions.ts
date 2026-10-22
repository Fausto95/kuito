import Permissions, {
  type PermissionName as Name,
  type PermissionResponse as Response,
  type PermissionStatus as Status,
} from '../../native/modules/permissions/permissions';

/**
 * What an app can ask for. `location` is "when in use"; `locationAlways` is
 * location in the background too, and asks for `location` first.
 */
export type PermissionName = Name;

/**
 * `limited` is access the user narrowed: a selection of photos (iOS 14+,
 * Android 14+).
 */
export type PermissionStatus = Status;

export type PermissionResponse = Response;

// Runtime permissions: one status model for every device-access module (docs/permissions.md).

/** The current status, without prompting. */
export const check = Permissions.check;

/** Shows the system prompt when it can, and resolves with the user's answer. */
export const request = Permissions.request;
