# Find and follow the device location

Request a position for nearby results, follow movement on an active screen, or register background updates for a feature that needs them.

## Declare location permission

```ts
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Screenings',
  ios: { bundleIdentifier: 'com.example.screenings' },
  android: { applicationId: 'com.example.screenings' },
  permissions: { location: 'Find screenings near you.' },
} satisfies KuitoConfig;
```

## Request a current position

```tsx
import { Text, location, permissions } from 'kuito';

const { status } = await permissions.request('location');

if (status === 'granted') {
  const here = await location.current({ accuracy: 'high' });
  const [place] = await location.reverseGeocode(here.coords);
}

function Here() {
  // Locates while Here is mounted; the fixes land in location.position.
  location.watch({ distanceInterval: 20 });

  return <Text>{`${location.position.value?.coords.latitude ?? '…'}`}</Text>;
}
```

## Follow movement

Set `distanceInterval` in meters. Android also accepts `timeInterval` in milliseconds; iOS delivers fixes as they arrive. Create `location.watch` in component setup for automatic cleanup, or keep its subscription and call `remove()` outside a component. Render `location.error` when a watch fails.

`location.watchHeading` returns a promise of a subscription. Stop it on cleanup, including when it resolves after the screen has already unmounted; the API example shows that race explicitly.

## Configure background location

```ts
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Runs',
  ios: { bundleIdentifier: 'com.example.runs' },
  android: { applicationId: 'com.example.runs' },
  permissions: {
    location: 'Map your runs.',
    locationAlways: 'Record your runs with the screen off.',
  },
} satisfies KuitoConfig;
```

## Register background updates

```tsx
import { location, permissions, storage } from 'kuito';

// At module scope: a background launch runs the app's modules, not its UI.
location.defineUpdates('run', async ({ locations }) => {
  const track: unknown[] = JSON.parse((await storage.get('track')) ?? '[]');

  await storage.set('track', JSON.stringify([...track, ...locations.map((fix) => fix.coords)]));
});

async function startRun() {
  const { status } = await permissions.request('locationAlways');

  if (status === 'granted')
    await location.startUpdates('run', {
      accuracy: 'high',
      distanceInterval: 10,
      notification: { title: 'Recording your run' },
    });
}
```

## Behavior and limits

Request permission at the point of use and handle denial. A cached `last` position can be null or too old for your task. Choose accuracy and distance intervals that fit the feature and battery budget. `position` and `error` expose the current watched state. Remove watchers outside component scope. Background updates require both foreground and background declarations and OS permission; they are not guaranteed continuous execution. Geocoding converts an address to coordinates; reverse geocoding does the opposite.

## Continue

Read [Permissions](permissions.md) for the related workflow. The API reference lists every method, option, event and return type.
