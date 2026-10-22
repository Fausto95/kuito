# location

The device's position, heading and addresses. On iOS it is Core Location; on
Android, the platform `LocationManager`, `Geocoder` and the rotation vector
sensor. Nothing needs Play Services, so the module adds no dependency to the
app. The radios run only while a request waits or a watch runs.

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

| Member                                    | Is                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `current({ accuracy? })`                  | One fresh fix.                                                                       |
| `last({ maxAge?, requiredAccuracy? })`    | The fix the platform last had, at once, or `null` without one that meets the limits. |
| `watch(options?)`                         | Locates into `position` while its scope lasts; returns its subscription.             |
| `position`                                | A signal: the newest fix any watch brought, or `null`.                               |
| `error`                                   | A signal: the error that ended a watch, or `null` while none has.                    |
| `watchHeading(callback)`                  | Calls `callback(heading)` as the device turns until `remove()`.                      |
| `geocode(address)`                        | The positions of an address.                                                         |
| `reverseGeocode({ latitude, longitude })` | The places at a position, nearest first.                                             |
| `servicesEnabled()`                       | Whether location services are on for the device.                                     |
| `defineUpdates(name, task)`               | The task that gets background updates' fixes. Call it at module scope.               |
| `startUpdates(name, options?)`            | Locates in the background too, for the task, until `stopUpdates(name)`.              |
| `stopUpdates(name)`                       | Stops the task's updates.                                                            |
| `updating(name)`                          | Whether the task's updates run, or resume at the app's next launch.                  |

`maxAge` is in milliseconds and `requiredAccuracy` in meters. `watch` in a
component starts when the component mounts and stops when it unmounts;
elsewhere the subscription's `remove()` stops it. A watch the platform refuses
sets `error` and leaves nothing running. `watchHeading` resolves its
subscription once the compass has started, so a device without one rejects.

## Permission

Every function but `geocode`, `watchHeading`, `servicesEnabled` and the
background updates' `stopUpdates` and `updating` needs the `location` permission, and the
module never prompts. Ask with
[`permissions.request('location')`](permissions.md); without it a call rejects
with `ERR_PERMISSION`. Approximate location counts as granted, as in Expo:
the fix's `accuracy` says how precise it is.

The module declares what it asks for in its spec's
[native needs](native-modules.md#native-needs), so an app that
imports `location` ships `NSLocationWhenInUseUsageDescription` and Android's
`ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`, and an app that doesn't
ships neither. Give the reason iOS shows in `kuito.config.ts`; it replaces the
module's generic one:

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

[Background updates](#background-updates) need `locationAlways` declared as
well.

## Accuracy

| `accuracy`           | iOS `desiredAccuracy`                  | Android providers, in order |
| -------------------- | -------------------------------------- | --------------------------- |
| `lowest`             | `kCLLocationAccuracyThreeKilometers`   | network, gps                |
| `low`                | `kCLLocationAccuracyKilometer`         | network, gps                |
| `balanced` (default) | `kCLLocationAccuracyHundredMeters`     | network, gps                |
| `high`               | `kCLLocationAccuracyNearestTenMeters`  | gps, network                |
| `highest`            | `kCLLocationAccuracyBest`              | gps, network                |
| `bestForNavigation`  | `kCLLocationAccuracyBestForNavigation` | gps, network                |

A watch uses the first provider the device has on. A single fix asks the
providers on in order up to GPS and takes the first fix: the network provider
can be on with nothing to report (no Wi-Fi or cell data, an emulator), and a
GPS fix is fine enough for any request. The platform's `fused` provider isn't
used: through `LocationManager` it asks Google's fused service for a
balanced-power fix, which it answers from network location alone. With every
provider off, Android rejects with `ERR_SERVICES_DISABLED`; iOS reports
services off as a denied permission.

## Watching

```ts
import type { LocationAccuracy } from 'kuito';

type WatchPositionOptions = {
  accuracy?: LocationAccuracy;
  timeInterval?: number;
  distanceInterval?: number;
};
```

`distanceInterval` is the meters the device moves before the next update (0,
the default, is every fix). `timeInterval` is the least time between updates in
milliseconds, 1000 by default; it is Android's only, as iOS delivers fixes as
they come. Each watch has its own request on the platform, so two watches keep
their own options, and the last one ending, or reloading, stops the radios.

`location.error` holds the error that ends a watch. On iOS that is access revoked
while the app runs (`ERR_PERMISSION`); a fix the platform can't get yet is not
an error, and the watch keeps trying. Android ends the app's process when
access is revoked, so a watch there doesn't end with an error.

## Background updates

A location task keeps getting fixes while the app is in the background, and
across its restarts. It is a
[background task](background-tasks.md) that the platform runs with each
batch of fixes, in the app's UI runtime when it runs and in a headless one
when it doesn't.

```tsx
import { location, permissions, storage } from 'kuito';

// At module scope: a background launch runs the app's modules, not its UI.
location.defineUpdates('run', async ({ locations }) => {
  const track: unknown[] = JSON.parse((await storage.get('track')) ?? '[]');

  await storage.set('track', JSON.stringify([...track, ...locations.map((fix) => fix.coords)]));
});

async function startRun() {
  const { status } = await permissions.request('location');

  if (status === 'granted')
    await location.startUpdates('run', {
      accuracy: 'high',
      distanceInterval: 10,
      notification: { title: 'Recording your run' },
    });
}
```

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

`startUpdates` takes [`watch`'s options](#watching) and these:

| Option                             | Platform | Does                                                                                     |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `pausesUpdatesAutomatically`       | iOS      | Lets Core Location pause updates while the device stays put. Off by default, as in Expo. |
| `showsBackgroundLocationIndicator` | iOS      | Shows the blue status bar pill while the app locates in the background.                  |
| `notification: { title?, body? }`  | Android  | The foreground service's notification. The app's name and a generic line by default.     |

The task gets `{ name, deadline, locations }`: the batch's fixes, oldest
first, and when the platform stops waiting for the run, in milliseconds since
the epoch. Resolve when they are handled; a task that throws or rejects
reports a failed run to the LogBox or the device log, and the updates go on.
A run comes with every fix, so keep the task short, or batch work over several
runs. `startUpdates` for a name `defineUpdates` didn't define
rejects at once. Starting a task again replaces its options.

**Declaring `locationAlways` turns it on.** The CLI adds the `location`
background mode to the Info.plist, and on Android the
`KuitoLocationService` foreground service (type `location`) with
`FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION`. Without the
declaration `startUpdates` rejects with `ERR_UNDECLARED`: iOS ends an
app that locates in the background without the mode. App Store and Google
Play reviews ask what the app uses background location for, so declare it
only in an app that does.

**Permissions.** Updates start with the `location` permission, as in Expo,
from the foreground: iOS then keeps locating in the background with the
blue indicator, and Android with its notification. `locationAlways` goes
further: without the indicator on iOS, and, there, relaunching the app after
it was terminated (below). Android 12 and later refuse to start a foreground
service from the background, so `startUpdates` rejects with
`ERR_UNAVAILABLE` there; start it from a user's action.

**Restarts.** The platform keeps the started tasks across launches, and
`defineUpdates` resumes a task's updates when the app's modules run
again, until `stopUpdates`. A revoked permission stops them for
good.

- **iOS**: updates stop when the app is terminated. With `locationAlways`
  granted, iOS also watches for significant changes (about 500 m) and
  relaunches the app without UI for one; the shell starts a headless runtime,
  the task's definition resumes the updates, and runs follow. Without it,
  updates resume the next time the user opens the app.
- **Android**: the foreground service is sticky. When Android ends the
  app's process, it restarts the service, and the first fix starts a
  headless runtime. The service stops with the last task, and when the user
  stops the app from Settings.

While the UI runs, runs go to its runtime; a headless runtime started for
them stays up between fixes, and the UI takes the runs once it opens. Each
run's outcome reaches the device log only when it fails.

## Values

```ts
// A fix: what current, last and position give.
type LocationObject = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number; // ms since the epoch
  mocked: boolean;
};

// What watchHeading's callback gets.
type LocationHeading = { trueHeading: number | null; magHeading: number; accuracy: number };
```

A field the platform doesn't know is `null`: no altitude without a vertical
fix, no `heading` or `speed` while still. `mocked` is a simulated location:
the iOS simulator's, or a mock-location app's on Android. The emulator's
`adb emu geo fix` reaches the app as a real GPS fix.

Heading `accuracy` differs as in Expo: degrees of error on iOS, the compass's
calibration from 0 (none) to 3 (high) on Android. Android derives
`trueHeading` from the magnetic heading and the declination at the last known
fix, so it is `null` until there is one; iOS reports it as Core Location does.
A device without a compass (the iOS simulator) rejects `watchHeading` with
`ERR_UNAVAILABLE`.

`geocode` resolves `{ latitude, longitude, altitude, accuracy }` for each
match; Android's geocoder gives no altitude or accuracy. `reverseGeocode`
resolves addresses:

| Field              | iOS (`CLPlacemark`)     | Android (`Address`)    |
| ------------------ | ----------------------- | ---------------------- |
| `name`             | `name`                  | `featureName`          |
| `streetNumber`     | `subThoroughfare`       | `subThoroughfare`      |
| `street`           | `thoroughfare`          | `thoroughfare`         |
| `district`         | `subLocality`           | `subLocality`          |
| `city`             | `locality`              | `locality`             |
| `subregion`        | `subAdministrativeArea` | `subAdminArea`         |
| `region`           | `administrativeArea`    | `adminArea`            |
| `postalCode`       | `postalCode`            | `postalCode`           |
| `country`          | `country`               | `countryName`          |
| `isoCountryCode`   | `isoCountryCode`        | `countryCode`          |
| `timezone`         | `timeZone`              | `null`                 |
| `formattedAddress` | `null`                  | the first address line |

Both geocoders are online services with rate limits: geocode on a user's
action, not on every fix. An address with no match resolves `[]`. Android's
geocoder is part of Google's system services; a device without them (some
AOSP builds) rejects with `ERR_UNAVAILABLE`.

## Errors

| Code                       | Meaning                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ERR_PERMISSION`           | The app doesn't have the `location` permission.                                                                          |
| `ERR_SERVICES_DISABLED`    | Android: every location provider is off.                                                                                 |
| `ERR_LOCATION_UNAVAILABLE` | iOS: Core Location couldn't get a fix.                                                                                   |
| `ERR_UNAVAILABLE`          | No compass for `watchHeading`, no geocoder on Android, or background updates started from the background on Android 12+. |
| `ERR_GEOCODE`              | The geocoder failed: offline, or rate limited.                                                                           |
| `ERR_UNDECLARED`           | Background updates without `locationAlways` declared.                                                                    |

Invalid options (an unknown `accuracy`, a negative interval, a latitude beyond
±90) throw a `TypeError` as a rejection, before anything reaches the platform.

## Differences from Expo

- **Permissions live in `permissions`.** Expo's
  `requestForegroundPermissionsAsync` is `permissions.request('location')`,
  and `requestBackgroundPermissionsAsync` is
  `permissions.request('locationAlways')`, for every module the same way
  ([why](permissions.md#differences-from-expo)).
- **Location tasks are defined in `location`.** Expo's
  `TaskManager.defineTask(name, ({ data: { locations } }) => …)` is
  `location.defineUpdates(name, ({ locations }) => …)`: typed fixes, no
  `data` to unpack, and an `error` is a failed run instead of an argument.
  Expo's `deferredUpdatesInterval`, `deferredUpdatesDistance` and
  `activityType` are not there yet.
- **Names drop `Async` and `get`, the position is a signal, and accuracy is
  a string.** Fixes come about once a second, so `position` is a signal like
  any other, not a motion value: those are for sources that change every
  frame. `getCurrentPositionAsync` is `current`, `watchPositionAsync` is
  `watch` and `position`; `Accuracy.High` is `'high'`.
- **No Play Services on Android.** Expo uses Google's
  `FusedLocationProviderClient`, about a megabyte of dependency. The platform's
  providers give the same fixes on a phone with GPS; indoors without Wi-Fi
  scanning, a `high` fix can take longer to arrive. `current` waits
  for the first fix the provider delivers, with no timeout of its own.

## Not yet

- **Geofencing** (`startGeofencingAsync`) and `enableNetworkProviderAsync`.
