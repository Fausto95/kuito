# Notifications

`notifications` shows the app's own notifications, now or at a time, whether
the app is in the foreground, in the background or not running, and receives
the ones a server pushes (iOS for now, [remote push](#remote-push)). A tap opens
the notification's `url` as a link that opened the app, so a
[`<Router linking>`](navigation.md#deep-links) takes the user to its route.
It is a [native module](native-modules.md) on iOS (UserNotifications) and
Android (NotificationManager and AlarmManager).

```tsx
import { notifications, permissions } from 'kuito';

const { status } = await permissions.request('notifications');

if (status === 'granted') {
  const id = await notifications.schedule({
    title: 'Stand-up',
    body: 'In five minutes',
    url: 'myapp://meetings/standup',
    at: new Date(Date.now() + 5 * 60_000),
  });

  // Changed your mind:
  await notifications.cancel(id);
}
```

```ts
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'My App',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  urlSchemes: ['myapp'],
  permissions: { notifications: true },
} satisfies KuitoConfig;
```

| Member                   | Is                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `schedule(notification)` | Shows `notification` at its `at`, or now. Resolves with its id once the platform holds it.            |
| `cancel(id)`             | Takes back the notification with this id: a pending one never shows, a shown one leaves the list.     |
| `cancelAll()`            | Takes back every notification of the app's, pending or shown.                                         |
| `register()`             | Registers the device for remote push and resolves with its `PushToken` ([remote push](#remote-push)). |
| `watch('received', fn)`  | Calls `fn` with each notification that arrives while the app is in the foreground, local or remote.   |

A `ScheduledNotification` holds:

| Field   | Is                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `title` | The first line, in bold.                                                                                                        |
| `body`  | The text under it. Optional.                                                                                                    |
| `url`   | The link a tap opens ([taps](#taps)). Optional: without it a tap opens the app where it was.                                    |
| `at`    | When it shows: a `Date`, or milliseconds since the epoch. Absent, it shows now. A time in the past rejects with a `RangeError`. |
| `id`    | Replaces the pending or shown notification that has it. Absent, the platform makes one, which `schedule` resolves with.         |

## Permission

Ask with [`permissions.request('notifications')`](permissions.md) before the
first notification, and declare `permissions: { notifications: true }` in
`kuito.config.ts` (it adds `POST_NOTIFICATIONS` on Android). While the app
may not show notifications (not asked yet, refused, or switched off in
Settings), `schedule` rejects with `ERR_PERMISSION`.

## In the foreground

A notification shows the same way while the app is in front: a banner with
its sound on iOS, a heads-up notification on Android. Android shows every
notification on one channel, "Notifications" (in English for now), at high
importance; the user can lower it in the app's settings. The status bar
shows the app's monochrome icon (`android.adaptiveIcon.monochrome`), or a
bell when it has none.

## Arriving in the foreground

`watch('received', fn)` hears each notification that arrives while the app is
in front, as it shows: a `ReceivedNotification` with its `id`, `title`,
`body`, `url`, `data` (a push payload's own JSON keys, beside the system's `aps` and `url`) and
`remote`, true when a server sent it. In a component it stops when the
component unmounts; elsewhere the subscription it returns stops it. A
notification that arrives while the app is in the background is not heard;
a tap on it still opens its `url`.

## Taps

A tap reports the notification's `url` to [`linking`](linking.md) as a link
that opened the app: `linking.url` changes to it, and a `<Router linking>`
navigates to the route the link's path matches. That holds when the tap
launched the app, too: the scene reads the launching tap from its connection
options, beside the delegate. Use the app's own scheme (`urlSchemes`) or one of its
`linkDomains`; a path the router doesn't know is reported and ignored, as any
link is. Dismissing a notification opens nothing.

## Timing

- **iOS** waits the interval until `at`, so a change of time zone doesn't
  move it.
- **Android** sets an exact alarm when the app may. The module declares
  `SCHEDULE_EXACT_ALARM`, which Android grants at install up to Android 13;
  on Android 14 and later the user grants it as "Alarms & reminders" in the
  app's settings. Without it the alarm is inexact, and Android may deliver
  it late by a large part of the wait (up to about three quarters of it).
- Alarms don't survive a reboot, so the module keeps the pending
  notifications and sets them again at boot, through a receiver enabled
  only while one waits. One whose time passed without its alarm shows at
  boot: the device was off, or the app was force-stopped from Settings,
  which cancels an app's alarms.

## Remote push

On iOS, through APNs:

```ts
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'My App',
  android: { applicationId: 'com.example.myapp' },
  urlSchemes: ['myapp'],
  permissions: { notifications: true },
  ios: { bundleIdentifier: 'com.example.myapp', pushEnvironment: 'development' },
} satisfies KuitoConfig;
```

```tsx
import { notifications, permissions } from 'kuito';

const { status } = await permissions.request('notifications');
const { service, token } = await notifications.register(); // 'apns', '5f2c…'

await fetch('https://api.example.com/devices', {
  method: 'POST',
  body: JSON.stringify({ service, token }),
});
```

- `ios.pushEnvironment` sets the `aps-environment` entitlement:
  `development` for builds signed for development, `production` for
  TestFlight and the App Store. The app's identifier must have the Push
  Notifications capability in the developer account, or a phone build fails
  to sign. On a phone, without the entitlement `register` rejects with `ERR_PUSH`.
- `register` resolves with `{ service: 'apns', token }`, APNs' device token in
  hex. Call it on each launch and send it to the server when it changed: iOS
  may issue a new one. Offline, iOS may not answer until it reaches APNs,
  so `register` waits; each call asks again. It doesn't need the notification permission, but a
  push shows an alert only with it.
- The server sends to APNs with the app's key or certificate, which stays
  on the server, never in the app or this repository. A payload's top-level
  `url` string is the link a tap opens, as a local notification's `url` is:
  `{ "aps": { "alert": { "title": "New reply" } }, "url": "myapp://threads/7" }`.
  Its other JSON keys arrive as `data` when the app is in the foreground.

**Android has no remote push yet.** It needs a push provider (Firebase Cloud
Messaging, or another), and none is chosen; `register` rejects with
`ERR_UNSUPPORTED` there. `PushToken.service` names the provider, so an
Android backend adds its value without changing the API. Local
notifications work on Android as on iOS.

## How it is wired

The spec is `native/modules/notifications/notifications.ts`. A shell holds
it only when the app calls it, so an app that schedules nothing ships none
of its receivers or permissions
([native modules](native-modules.md#which-modules-a-shell-includes)):

- **iOS:** its spec asks for a [launch](native-modules.md#launch), in which
  `KuitoNotifications` becomes the notification center's delegate, which
  iOS requires to deliver the tap that launched the app, and takes the app
  delegate's push token answers from `KuitoPushRegistration`. It presents notifications in the foreground and passes
  a tap's `url`, kept in the notification's `userInfo` (a push payload's
  top-level `url`), to `KuitoLinks`. The app delegate forwards the push
  token callbacks to it, and `register` waits for them.
- **Android:** a tap's intent is `ACTION_VIEW` with the url, sent to the
  app's own activity, which reports it to `KuitoLinks` as it does any link
  (`onCreate`, then `onNewIntent`). A scheduled notification waits as an
  alarm whose receiver, `KuitoNotificationAlarmReceiver`, posts it;
  `KuitoNotificationRestoreReceiver` sets the alarms again after a reboot.
  Both are the module's `android.receivers`.

## Not yet

- Repeating notifications, badges, images, actions and categories.
- Remote push on Android ([remote push](#remote-push)).
- Hearing a push that arrives in the background (silent, `content-available`
  pushes).
