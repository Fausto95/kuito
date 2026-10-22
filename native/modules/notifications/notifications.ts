import { defineModule, event, fn } from '../../../src/native/define-module';
import type { Json } from '../../../src/native/modules';

/** A notification to show, as it crosses to the platform. */
export type NotificationRequest = {
  /** Replaces the pending or shown notification with this id; the platform makes one when absent. */
  id?: string;
  title: string;
  body?: string;
  /** The link a tap opens: the shell reports it to Linking, and a `<Router linking>` follows it. */
  url?: string;
  /** Milliseconds since the epoch; absent, or already past when it arrives, shows it now. */
  at?: number;
};

/** The push service a token addresses. Android has none yet (docs/notifications.md#remote-push). */
export type PushService = 'apns';

export type PushToken = {
  service: PushService;
  /** What a server sends the push to: APNs' device token, in hex. */
  token: string;
};

/** A notification that arrived while the app is in the foreground. */
export type NotificationDelivery = {
  id: string;
  /** Absent for a push without one. */
  title?: string;
  body?: string;
  url?: string;
  /** The payload's own keys, beside the system's (`aps`) and `url`. */
  data?: Json;
  /** A server sent it, rather than `schedule`. */
  remote: boolean;
};

// Local notifications and remote push (docs/notifications.md). Its iOS launch
// sets the notification delegate, which presents notifications in the
// foreground and reports taps to KuitoLinks.
// Android's alarms post through a receiver, and a boot receiver restores
// them; it is enabled only while something is scheduled.
export default defineModule('Notifications', {
  /** Resolves with the notification's id once the platform holds it; `ERR_PERMISSION` when the app may not show one. */
  schedule: fn.main.callback<(request: NotificationRequest) => Promise<string>>(),
  /** Takes back the notification with this id, pending or shown. */
  cancel: fn.main<(id: string) => Promise<void>>(),
  /** Takes back every notification of the app's, pending or shown. */
  cancelAll: fn.main<() => Promise<void>>(),
  /** Registers the device for remote push and resolves with its token; `ERR_UNSUPPORTED` on Android. */
  register: fn.main.callback<() => Promise<PushToken>>(),
  /** Each notification that arrives while the app is in the foreground, local or remote. */
  received: event<NotificationDelivery>(),
  // The notification center's delegate is set before launch ends, or iOS drops the tap that launched the app.
  ios: { class: 'KuitoNotificationsModule', launch: true },
  android: {
    class: 'dev.kuito.runtime.modules.notifications.KuitoNotificationsModule',
    permissions: [
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.SCHEDULE_EXACT_ALARM',
    ],
    receivers: [
      {
        name: 'dev.kuito.runtime.modules.notifications.KuitoNotificationAlarmReceiver',
        exported: 'false',
      },
      {
        name: 'dev.kuito.runtime.modules.notifications.KuitoNotificationRestoreReceiver',
        exported: 'false',
        enabled: 'false',
        actions: ['android.intent.action.BOOT_COMPLETED'],
      },
    ],
  },
});
