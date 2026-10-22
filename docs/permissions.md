# Request device permissions

Check access before a feature needs it, explain why it helps, and handle denial without trapping the user. Use the shared permissions API for camera, microphone, photos, location and notifications.

## Declare permission reasons in configuration

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
  permissions: {
    camera: 'Scan tickets at the door.',
    location: 'Find screenings near you.',
    notifications: true,
  },
} satisfies KuitoConfig;
```

## Check access and offer Settings

```tsx
import { app, permissions } from 'kuito';

const { status, canAskAgain } = await permissions.check('camera');

if (status === 'undetermined') await permissions.request('camera');
else if (status === 'denied' && !canAskAgain) await app.openSettings();
```

## Behavior and limits

`check(name)` reads without prompting; `request(name)` asks when the OS permits it. Results contain `status` and `canAskAgain`. Handle `granted`, `limited`, `denied` and `undetermined` separately. When `canAskAgain` is false, offer `app.openSettings()` as a user action instead of repeatedly requesting. Declare usage reasons before accessing protected APIs; iOS can terminate an app with a missing reason. `locationAlways` also needs `location`. Biometrics is a configuration declaration used by secureStore, not a name accepted by check/request.

## Continue

Read [Secure store](secure-store.md) for the related workflow. The API reference lists every method, option, event and return type.
