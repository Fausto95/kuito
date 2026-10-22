import { defineModule, event, fn } from '../../../src/native/define-module';
import '../permissions/permissions';
// Background location runs as background task runs, in the headless runtime when no other listens.
import '../background-tasks/background-tasks';

/**
 * How precise a fix should be, after Expo's `Accuracy`; finer costs more
 * power. What each one asks of the platform is in docs/location.md.
 */
export type LocationAccuracy =
  | 'lowest'
  | 'low'
  | 'balanced'
  | 'high'
  | 'highest'
  | 'bestForNavigation';

/** A fix's position. Distances are meters; `null` when the platform doesn't say. */
export type LocationCoords = {
  latitude: number;
  longitude: number;
  /** Above sea level (iOS), or the WGS 84 ellipsoid (Android). */
  altitude: number | null;
  /** The radius of 68% confidence around the position. */
  accuracy: number | null;
  altitudeAccuracy: number | null;
  /** Degrees clockwise from true north that the device is moving. */
  heading: number | null;
  /** Meters per second. */
  speed: number | null;
};

export type LocationObject = {
  coords: LocationCoords;
  /** Milliseconds since the epoch, when the fix was taken. */
  timestamp: number;
  /** The fix came from the iOS simulator or an Android mock-location app. */
  mocked: boolean;
};

export type LocationHeading = {
  /** Degrees from true north; `null` until the platform knows where the device is. */
  trueHeading: number | null;
  /** Degrees from magnetic north. */
  magHeading: number;
  /** iOS: the error in degrees. Android: the compass's calibration, 0 (none) to 3 (high). */
  accuracy: number;
};

export type GeocodedLocation = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
};

/** One place at a position. Each part is `null` when the platform has none. */
export type GeocodedAddress = {
  name: string | null;
  streetNumber: string | null;
  street: string | null;
  district: string | null;
  city: string | null;
  subregion: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  isoCountryCode: string | null;
  timezone: string | null;
  /** The address as one line. Android only. */
  formattedAddress: string | null;
};

export type LocationError = { code: string; message: string };

export type LocationCoordinates = { latitude: number; longitude: number };

export type LocationRequest = { accuracy: LocationAccuracy };

export type LocationWatchRequest = {
  /** The watch's own number: its `position` events carry it. */
  id: number;
  accuracy: LocationAccuracy;
  /** Milliseconds between updates, at least. Android only. */
  timeInterval: number;
  /** Meters the device moves before the next update. */
  distanceInterval: number;
};

/** A location task's updates: iOS reads the first options, Android the interval and notification. */
export type LocationUpdatesRequest = {
  name: string;
  accuracy: LocationAccuracy;
  timeInterval: number;
  distanceInterval: number;
  pausesUpdatesAutomatically: boolean;
  showsBackgroundLocationIndicator: boolean;
  notificationTitle: string | null;
  notificationBody: string | null;
};

/** One watch's fix, or the error that ended it. */
export type LocationUpdate = {
  id: number;
  location: LocationObject | null;
  error: LocationError | null;
};

// The device's location (docs/location.md): Core Location on iOS, the
// platform `LocationManager` on Android. Every call needs the `location`
// permission, which this module checks through Permissions and never asks for.
export default defineModule('Location', {
  getCurrentPosition: fn.main.callback<(request: LocationRequest) => Promise<LocationObject>>(),
  getLastKnownPosition: fn.main.callback<() => Promise<LocationObject | null>>(),
  /** Starts a watch whose fixes arrive as `position` events. */
  watchPosition: fn.main.callback<(request: LocationWatchRequest) => Promise<void>>(),
  clearWatch: fn.main<(id: number) => Promise<void>>(),
  hasHeading: fn.sync<() => boolean>(),
  geocode: fn.background.callback<(address: string) => Promise<GeocodedLocation[]>>(),
  reverseGeocode:
    fn.background.callback<(coordinates: LocationCoordinates) => Promise<GeocodedAddress[]>>(),
  /** Off the main thread: Core Location warns that this read can block it. */
  hasServicesEnabled: fn.background<() => Promise<boolean>>(),
  startLocationUpdates: fn.main.callback<(request: LocationUpdatesRequest) => Promise<void>>(),
  stopLocationUpdates: fn.main<(name: string) => Promise<void>>(),
  hasStartedLocationUpdates: fn.main<(name: string) => Promise<boolean>>(),
  /** Restarts the updates a terminated launch of the app had started for `name`. */
  resumeLocationUpdates: fn.main<(name: string) => Promise<void>>(),
  /** Every watch's fixes; the last listener leaving stops every watch. */
  position: event<LocationUpdate>(),
  /** The compass, running while this has a listener. */
  heading: event<LocationHeading>(),
  // iOS relaunches a terminated app for a location event: its launch starts the headless runtime.
  ios: {
    class: 'KuitoLocationModule',
    launch: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'This app uses your location while you use it.',
    },
  },
  android: {
    class: 'dev.kuito.runtime.modules.location.KuitoLocationModule',
    permissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },
});
