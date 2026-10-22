# Schedule and receive notifications

Use local notifications for reminders and iOS remote push for server-originated updates. A notification can open a specific screen through its URL.

## Declare notification permission

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

## Schedule and cancel a reminder

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

## Configure iOS remote push

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

## Register the device with your server

```tsx
import { notifications, permissions } from 'kuito';

const { status } = await permissions.request('notifications');
if (status === 'granted') {
  const { service, token } = await notifications.register();
  const response = await fetch('https://example.com/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, token }),
  });
  if (!response.ok) throw new Error(`Registration failed: ${response.status}`);
}
```

## Behavior and limits

Ask for permission before scheduling. `at` is a Date or epoch milliseconds; omit it for immediate display. A past time rejects. Keep the returned id to cancel or replace a reminder. `watch("received", ...)` observes foreground arrivals; it is not a background push handler. Android alarm timing depends on system permission and may be inexact. Remote push is APNs on iOS only: Android `register()` rejects with `ERR_UNSUPPORTED`. Repeating notifications, action buttons and silent background push are not implemented.

## Continue

Read [Permissions](permissions.md) for the related workflow. The API reference lists every method, option, event and return type.
