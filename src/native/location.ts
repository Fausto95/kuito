import BackgroundTasks from '../../native/modules/background-tasks/background-tasks';
import LocationModule, {
  type GeocodedAddress as Address,
  type GeocodedLocation as Position,
  type LocationAccuracy as Accuracy,
  type LocationCoordinates,
  type LocationCoords as Coords,
  type LocationError as Failure,
  type LocationHeading as Heading,
  type LocationObject as Fix,
} from '../../native/modules/location/location';
import type { Signal } from '../ui/reactivity';
import type { EventSubscription } from './modules';
import { report, signal, watching, type ReadonlySignal } from './scope';

/**
 * How precise a fix should be; finer costs more power. What each one asks of the platform is in docs/location.md.
 */
export type LocationAccuracy = Accuracy;

/** A fix's position. Distances are meters; `null` when the platform doesn't say. */
export type LocationCoords = Coords;

export type LocationObject = Fix;

export type LocationOptions = { accuracy?: LocationAccuracy };

export type LastKnownPositionOptions = {
  /** Milliseconds: an older fix resolves `null`. */
  maxAge?: number;
  /** Meters: a coarser fix resolves `null`. */
  requiredAccuracy?: number;
};

export type WatchPositionOptions = LocationOptions & {
  /** Milliseconds between updates, at least. Android only; iOS delivers as fixes come. */
  timeInterval?: number;
  /** Meters the device moves before the next update. */
  distanceInterval?: number;
};

export type LocationHeading = Heading;

export type GeocodedLocation = Position;

/** One place at a position. Each part is `null` when the platform has none. */
export type GeocodedAddress = Address;

export type LocationError = Failure;

/** How a location task's updates run. */
export type LocationTaskOptions = WatchPositionOptions & {
  /** iOS: let Core Location pause updates while the device stays put. Off by default. */
  pausesUpdatesAutomatically?: boolean;
  /** iOS: the blue status bar pill while the app locates in the background. Off by default. */
  showsBackgroundLocationIndicator?: boolean;
  /** Android: the foreground service's notification. Defaults to the app's name. */
  notification?: { title?: string; body?: string };
};

/** What a location task receives: the fixes since its last run, oldest first. */
export type LocationTaskRun = {
  name: string;
  /** When the platform stops waiting for the run, in milliseconds since the epoch. */
  deadline: number;
  locations: LocationObject[];
};

/** Resolve when the fixes are handled; throw or reject to report a failed run. */
export type LocationTask = (run: LocationTaskRun) => Promise<void> | void;

const ACCURACIES: readonly LocationAccuracy[] = [
  'lowest',
  'low',
  'balanced',
  'high',
  'highest',
  'bestForNavigation',
];

let watches = 0;

/** The location tasks this runtime defined, so starting one it never defined fails at once. */
const tasks = new Set<string>();

function accuracy(method: string, value: LocationAccuracy | undefined = 'balanced') {
  if (ACCURACIES.indexOf(value) < 0)
    throw new TypeError(
      `location.${method}: accuracy must be one of ${ACCURACIES.map((each) => `'${each}'`).join(', ')}, not '${String(value)}'`,
    );

  return value;
}

function atLeastZero(method: string, name: string, unit: string, value: number | undefined) {
  if (value === undefined) return undefined;

  if (typeof value !== 'number' || !(value >= 0) || value === Infinity)
    throw new TypeError(`location.${method}: ${name} must be a number of ${unit} ≥ 0`);

  return value;
}

function degrees(method: string, name: string, value: number, limit: number) {
  if (typeof value !== 'number' || !(value >= -limit && value <= limit))
    throw new TypeError(`location.${method}: ${name} must be between -${limit} and ${limit}`);

  return value;
}

function flag(method: string, name: string, value: boolean | undefined) {
  if (value !== undefined && typeof value !== 'boolean')
    throw new TypeError(`location.${method}: ${name} must be true or false`);

  return value ?? false;
}

function text(method: string, name: string, value: string | undefined) {
  if (value !== undefined && typeof value !== 'string')
    throw new TypeError(`location.${method}: ${name} must be a string`);

  return value ?? null;
}

/** A run's fixes, checked: the platform sends them as the run's data. */
function locations(name: string, data: unknown): LocationObject[] {
  const fixes: unknown =
    typeof data === 'object' && data !== null && 'locations' in data ? data.locations : undefined;

  if (!Array.isArray(fixes))
    throw new TypeError(`Location task '${name}' got no locations from the platform`);

  return fixes;
}

/** Rejects instead of throwing, as every asynchronous function should. */
function attempt<T>(work: () => Promise<T>): Promise<T> {
  try {
    return work();
  } catch (error) {
    return Promise.reject(error);
  }
}

function unavailable(message: string) {
  return Object.assign(new Error(message), { name: 'NativeModuleError', code: 'ERR_UNAVAILABLE' });
}

/** Whether the last known fix meets the app's limits. */
function fresh(fix: LocationObject | null, options: LastKnownPositionOptions) {
  if (!fix) return null;
  if (options.maxAge !== undefined && Date.now() - fix.timestamp > options.maxAge) return null;

  if (options.requiredAccuracy !== undefined) {
    const radius = fix.coords.accuracy;

    if (radius === null || radius > options.requiredAccuracy) return null;
  }

  return fix;
}

// The device's location (docs/location.md): Core Location on iOS, the
// platform `LocationManager` on Android. Every call needs the `location`
// permission; ask with `permissions.request('location')`.

/** One fresh fix. */
export function current(options: LocationOptions = {}): Promise<LocationObject> {
  return attempt(() =>
    LocationModule.getCurrentPosition({ accuracy: accuracy('current', options.accuracy) }),
  );
}

/** The fix the platform last had, at once; `null` without one that meets `options`. */
export function last(options: LastKnownPositionOptions = {}): Promise<LocationObject | null> {
  return attempt(() => {
    const limits = {
      maxAge: atLeastZero('last', 'maxAge', 'milliseconds', options.maxAge),
      requiredAccuracy: atLeastZero('last', 'requiredAccuracy', 'meters', options.requiredAccuracy),
    };

    return LocationModule.getLastKnownPosition().then((fix) => fresh(fix, limits));
  });
}

let failure: Signal<LocationError | null> | null = null;
let newest: Signal<LocationObject | null> | null = null;

const errors = () => (failure ??= signal<LocationError | null>(null));
const fixes = () => (newest ??= signal<LocationObject | null>(null));

/**
 * The newest fix any `watch` brought; null until the first. A signal: fixes
 * come about once a second, not once a frame, so nothing needs to follow
 * them on the UI thread.
 */
export const position: ReadonlySignal<LocationObject | null> = {
  get value() {
    return fixes().value;
  },
};

/** The error that ended a watch, such as access revoked in Settings; null while none has. */
export const error: ReadonlySignal<LocationError | null> = {
  get value() {
    return errors().value;
  },
};

/**
 * Starts locating into `position`. In a component it starts when the
 * component mounts and stops when it unmounts; elsewhere the returned
 * subscription's `remove()` stops it. The platform locates only while a
 * watch runs.
 */
export function watch(options: WatchPositionOptions = {}): EventSubscription {
  const request = {
    accuracy: accuracy('watch', options.accuracy),
    timeInterval:
      atLeastZero('watch', 'timeInterval', 'milliseconds', options.timeInterval) ?? 1000,
    distanceInterval:
      atLeastZero('watch', 'distanceInterval', 'meters', options.distanceInterval) ?? 0,
  };

  return watching('location.watch', () => {
    const id = ++watches;
    const listener = LocationModule.position.addListener((event) => {
      if (event.id !== id) return;

      if (event.location) {
        errors().value = null;
        fixes().value = event.location;
      } else if (event.error) errors().value = event.error;
    });

    LocationModule.watchPosition({ id, ...request }).catch((reason: unknown) => {
      const code: unknown =
        typeof reason === 'object' && reason ? Reflect.get(reason, 'code') : null;

      listener.remove();

      errors().value = {
        code: typeof code === 'string' ? code : 'ERR_LOCATION',
        message: reason instanceof Error ? reason.message : String(reason),
      };
    });

    return {
      remove() {
        listener.remove();
        LocationModule.clearWatch(id).catch(report('location.watch could not stop'));
      },
    };
  });
}

/** Calls `callback` as the device turns, until `remove()`. Rejects without a compass. */
export function watchHeading(
  callback: (heading: LocationHeading) => void,
): Promise<EventSubscription> {
  return attempt(() => {
    if (!LocationModule.hasHeading())
      throw unavailable('location.watchHeading: this device has no compass');

    return Promise.resolve(LocationModule.heading.addListener(callback));
  });
}

/** The positions of an address, as the platform's geocoder finds them. */
export function geocode(address: string): Promise<GeocodedLocation[]> {
  return attempt(() => {
    if (typeof address !== 'string' || address.trim() === '')
      throw new TypeError('location.geocode: address must be a non-empty string');

    return LocationModule.geocode(address);
  });
}

/** The places at a position, nearest first. */
export function reverseGeocode(coordinates: LocationCoordinates): Promise<GeocodedAddress[]> {
  return attempt(() =>
    LocationModule.reverseGeocode({
      latitude: degrees('reverseGeocode', 'latitude', coordinates.latitude, 90),
      longitude: degrees('reverseGeocode', 'longitude', coordinates.longitude, 180),
    }),
  );
}

/** Location services are on for the device (not this app's permission). */
export const servicesEnabled = (): Promise<boolean> => LocationModule.hasServicesEnabled();

/**
 * The task that gets the fixes of `startUpdates(name)`, as a background task
 * (docs/background-tasks.md). Call it at module scope: a background launch
 * evaluates the app's modules without mounting its UI, and defining the task
 * is when updates started before the app was terminated resume.
 */
export function defineUpdates(name: string, task: LocationTask): void {
  if (!globalThis.__kuito) throw new Error('location.defineUpdates requires the Kuito runtime');

  if (typeof task !== 'function')
    throw new TypeError(`location.defineUpdates('${name}'): task must be a function`);

  globalThis.__kuito.defineBackgroundTask(
    name,
    (run: { name: string; deadline: number; data?: unknown }) =>
      task({ name: run.name, deadline: run.deadline, locations: locations(name, run.data) }),
    { finish: BackgroundTasks.finish, run: BackgroundTasks.run },
  );

  tasks.add(name);
  void LocationModule.resumeLocationUpdates(name);
}

/**
 * Locates in the background too, delivering fixes to the task `name` until
 * `stopUpdates(name)`, across the app's restarts. Needs the `location`
 * permission and `locationAlways` declared (docs/location.md).
 */
export function startUpdates(name: string, options: LocationTaskOptions = {}): Promise<void> {
  return attempt(() => {
    const method = 'startUpdates';

    if (!tasks.has(name))
      throw new Error(
        `location.${method}: no location task named '${name}'. Call location.defineUpdates('${name}', task) at module scope first.`,
      );

    return LocationModule.startLocationUpdates({
      name,
      accuracy: accuracy(method, options.accuracy),
      timeInterval:
        atLeastZero(method, 'timeInterval', 'milliseconds', options.timeInterval) ?? 1000,
      distanceInterval:
        atLeastZero(method, 'distanceInterval', 'meters', options.distanceInterval) ?? 0,
      pausesUpdatesAutomatically: flag(
        method,
        'pausesUpdatesAutomatically',
        options.pausesUpdatesAutomatically,
      ),
      showsBackgroundLocationIndicator: flag(
        method,
        'showsBackgroundLocationIndicator',
        options.showsBackgroundLocationIndicator,
      ),
      notificationTitle: text(method, 'notification.title', options.notification?.title),
      notificationBody: text(method, 'notification.body', options.notification?.body),
    });
  });
}

/** Stops the task's updates; the platform forgets them. */
export const stopUpdates = (name: string): Promise<void> =>
  LocationModule.stopLocationUpdates(name);

/** Whether updates for the task are running, or will resume when its app launches. */
export const updating = (name: string): Promise<boolean> =>
  LocationModule.hasStartedLocationUpdates(name);
