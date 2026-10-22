import Notifications, {
  type NotificationDelivery,
  type PushToken as Token,
} from '../../native/modules/notifications/notifications';
import type { EventSubscription } from './modules';
import { watching } from './scope';

/** Where a server sends the device's push: the service and its token. */
export type PushToken = Token;

/** A notification that arrived while the app is in the foreground. */
export type ReceivedNotification = NotificationDelivery;

/** A notification `notifications.schedule` shows. */
export type ScheduledNotification = {
  /** Replaces the pending or shown notification with this id. Absent, the platform makes one. */
  id?: string;
  title: string;
  body?: string;
  /**
   * The link a tap opens, as if it had opened the app: a `<Router linking>`
   * follows it to its route (docs/notifications.md#taps).
   */
  url?: string;
  /** When it shows: a Date, or milliseconds since the epoch. Absent, it shows now. */
  at?: Date | number;
};

// Local notifications (docs/notifications.md). Ask first with
// `permissions.request('notifications')`: without it the platform holds the
// notification and never shows it.

/**
 * Shows a notification at `at`, or now, even when the app is in the
 * foreground or not running. Resolves with its id.
 */
export function schedule(notification: ScheduledNotification): Promise<string> {
  const { at, ...rest } = notification;

  if (at === undefined) return Notifications.schedule(rest);

  // A Date's value is its time; not `instanceof`, which fails for a Date from another realm.
  const time: unknown = typeof at === 'object' && at !== null ? Number(at) : at;

  if (typeof time !== 'number' || !Number.isFinite(time))
    return Promise.reject(
      new RangeError(
        `notifications.schedule: at must be a Date or milliseconds since the epoch, not ${String(at)}`,
      ),
    );

  if (time < Date.now())
    return Promise.reject(
      new RangeError(
        `notifications.schedule: at is in the past (${new Date(time).toISOString()}); leave it out to show the notification now`,
      ),
    );

  return Notifications.schedule({ ...rest, at: time });
}

/** Takes back the notification with this id, whether it is pending or shown. */
export const cancel = Notifications.cancel;

/** Takes back every notification the app scheduled, pending or shown. */
export const cancelAll = Notifications.cancelAll;

/**
 * Registers the device for remote push and resolves with the token a server
 * sends to. Call it on each launch: the token can change. iOS only for now;
 * Android rejects with `ERR_UNSUPPORTED` (docs/notifications.md#remote-push).
 */
export const register = Notifications.register;

type Events = { received: (notification: ReceivedNotification) => void };

/**
 * Calls `listener` with each notification that arrives while the app is in
 * the foreground, local or remote; it still shows. In a component it stops
 * when the component unmounts; elsewhere the returned subscription stops it.
 */
export function watch<E extends keyof Events>(event: E, listener: Events[E]): EventSubscription {
  if (event !== 'received')
    throw new TypeError('notifications.watch: no "' + String(event) + '" event; watch received');

  return watching('notifications.watch', () => Notifications.received.addListener(listener));
}
