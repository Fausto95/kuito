import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { fakeModules, type FakeModule } from './support/fake-modules.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// Location as an app calls it, against a fake platform that answers like the
// iOS and Android modules. What matters here is what crosses: every option
// filled in, watches that hear only their own fixes, and monitoring that runs
// only while something is subscribed.

type Coords = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};

type Fix = { coords: Coords; timestamp: number; mocked: boolean };
type Heading = { trueHeading: number | null; magHeading: number; accuracy: number };
type Subscription = { remove(): void };

interface Scope {
  location: {
    current(options?: object): Promise<Fix>;
    last(options?: object): Promise<Fix | null>;
    watch(options?: object): Subscription;
    readonly position: { readonly value: Fix | null };
    readonly error: { readonly value: { code: string; message: string } | null };
    watchHeading(callback: (heading: Heading) => void): Promise<Subscription>;
    geocode(address: string): Promise<unknown[]>;
    reverseGeocode(coords: { latitude: number; longitude: number }): Promise<unknown[]>;
    servicesEnabled(): Promise<boolean>;
    startUpdates(name: string, options?: object): Promise<void>;
    stopUpdates(name: string): Promise<void>;
    updating(name: string): Promise<boolean>;
  };
  tracked: unknown[];
  seen: (number | null)[];
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-location-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/location-app.tsx');
const taskApp = compile('test/fixtures/location-task-app.tsx');

const fix = (latitude: number, longitude: number, extra: Partial<Fix> = {}): Fix => ({
  coords: {
    latitude,
    longitude,
    altitude: 12,
    accuracy: 5,
    altitudeAccuracy: 3,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(),
  mocked: false,
  ...extra,
});

const lisbon = fix(38.7223, -9.1393);
const porto = fix(41.1579, -8.6291);

function location(overrides: FakeModule['functions'] = {}): FakeModule {
  const main = (run: (...args: unknown[]) => unknown) => ({ thread: 'main' as const, run });

  return {
    functions: {
      getCurrentPosition: main(() => lisbon),
      getLastKnownPosition: main(() => lisbon),
      watchPosition: main(() => null),
      clearWatch: main(() => null),
      hasHeading: { thread: 'js', run: () => true },
      geocode: { thread: 'background', run: () => [{ latitude: 38.7, longitude: -9.1 }] },
      reverseGeocode: { thread: 'background', run: () => [{ city: 'Lisboa' }] },
      hasServicesEnabled: { thread: 'background', run: () => true },
      startLocationUpdates: main(() => null),
      stopLocationUpdates: main(() => null),
      hasStartedLocationUpdates: main(() => true),
      resumeLocationUpdates: main(() => null),
      ...overrides,
    },
  };
}

const backgroundTasks: FakeModule = {
  functions: { finish: { thread: 'main', run() {} } },
};

async function app(overrides: FakeModule['functions'] = {}, entry = code) {
  const native = fakeModules({ Location: location(overrides), BackgroundTasks: backgroundTasks });
  const logs: string[] = [];
  const kernel = installKernel(
    hosting({
      createView() {},
      setProp() {},
      removeView() {},
      __kuitoHostLog(_level: string, message: string) {
        logs.push(message);
      },
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await entry, kernel);

  /** Settles the queued native calls, then lets the promises run. */
  const flush = async () => {
    native.flush();
    await new Promise<void>((done) => setTimeout(done, 0));
  };

  /** Starts `call`, settles what it queued, and returns its result. */
  async function run<T>(call: () => Promise<T>): Promise<T> {
    const [result] = await Promise.all([call(), flush()]);

    return result;
  }

  const scope: Scope = kernel as never;

  return {
    ...native,
    location: scope.location,
    tracked: scope.tracked,
    seen: scope.seen,
    logs,
    run,
    flush,
  };
}

const typeError = (pattern: RegExp) => (error: Error) => {
  assert.equal(error.name, 'TypeError');
  assert.match(error.message, pattern);

  return true;
};

test('location.current asks for balanced accuracy unless told otherwise', async () => {
  const location = await app();

  assert.deepEqual(data(await location.run(() => location.location.current())), lisbon);
  await location.run(() => location.location.current({ accuracy: 'highest' }));

  assert.deepEqual(data(location.calls), [
    { module: 'Location', method: 'getCurrentPosition', args: [{ accuracy: 'balanced' }] },
    { module: 'Location', method: 'getCurrentPosition', args: [{ accuracy: 'highest' }] },
  ]);
});

test('an unknown accuracy rejects before it reaches the platform', async () => {
  const location = await app();

  await assert.rejects(
    location.location.current({ accuracy: 'precise' }),
    typeError(/location\.current: accuracy must be one of 'lowest', .*'precise'/),
  );

  assert.throws(
    () => location.location.watch({ distanceInterval: -1 }),
    typeError(/location\.watch: distanceInterval must be a number of meters ≥ 0/),
  );

  assert.deepEqual(location.calls, []);
  assert.deepEqual(location.observed, []);
});

test('the platform’s errors reject with its code', async () => {
  const location = await app({
    getCurrentPosition: {
      thread: 'main',
      run() {
        throw { code: 'ERR_PERMISSION', message: 'Location access is denied' };
      },
    },
  });

  await assert.rejects(
    location.run(() => location.location.current()),
    (error: Error & { code: string }) => {
      assert.equal(error.code, 'ERR_PERMISSION');
      assert.match(error.message, /Location\.getCurrentPosition failed: Location access is denied/);

      return true;
    },
  );
});

test('location.last drops a fix older than maxAge or coarser than requiredAccuracy', async () => {
  const stale = fix(38.7, -9.1, { timestamp: Date.now() - 60_000 });
  const coarse = fix(38.7, -9.1, { coords: { ...lisbon.coords, accuracy: 900 } });
  const unknown = fix(38.7, -9.1, { coords: { ...lisbon.coords, accuracy: null } });
  let last: Fix | null = stale;
  const location = await app({
    getLastKnownPosition: { thread: 'main', run: () => last },
  });
  const read = (options?: object) => location.run(() => location.location.last(options)).then(data);

  assert.deepEqual(await read(), stale);
  assert.equal(await read({ maxAge: 30_000 }), null);
  assert.deepEqual(await read({ maxAge: 120_000 }), stale);

  last = coarse;
  assert.equal(await read({ requiredAccuracy: 100 }), null);
  assert.deepEqual(await read({ requiredAccuracy: 1000 }), coarse);

  last = unknown;
  assert.equal(await read({ requiredAccuracy: 1000 }), null);

  last = null;
  assert.equal(await read(), null);
});

test('a watch starts native updates with every option filled in, and remove stops them', async () => {
  const location = await app();
  const watch = location.location.watch({ accuracy: 'high', distanceInterval: 10 });

  await location.flush();
  assert.deepEqual(location.observed, ['start Location.position']);

  assert.deepEqual(data(location.calls), [
    {
      module: 'Location',
      method: 'watchPosition',
      args: [{ id: 1, accuracy: 'high', timeInterval: 1000, distanceInterval: 10 }],
    },
  ]);

  assert.equal(location.location.position.value, null);
  assert.deepEqual(location.observed, ['start Location.position']);

  // Each fix is a `position` event; `position` is a signal its watchers hear.
  location.emit('Location', 'position', { id: 1, location: lisbon, error: null });
  assert.deepEqual(data(location.location.position.value), lisbon);
  await location.flush();
  location.emit('Location', 'position', { id: 1, location: porto, error: null });
  assert.deepEqual(data(location.location.position.value), porto);
  await location.flush();
  assert.deepEqual(data(location.seen), [lisbon.coords.latitude, porto.coords.latitude]);
  watch.remove();
  watch.remove();
  await location.flush();

  assert.deepEqual(data(location.calls.filter(({ method }) => method === 'clearWatch')), [
    { module: 'Location', method: 'clearWatch', args: [1] },
  ]);

  assert.deepEqual(
    location.observed.filter((entry) => entry.endsWith('position')),
    ['start Location.position', 'stop Location.position'],
  );
});

test('every watch brings fixes into position, and the error that ends one into error', async () => {
  const location = await app();
  const a = location.location.watch();
  const b = location.location.watch({ accuracy: 'low', timeInterval: 5000 });

  await location.flush();
  location.emit('Location', 'position', { id: 1, location: lisbon, error: null });
  assert.deepEqual(data(location.location.position.value), lisbon);
  location.emit('Location', 'position', { id: 2, location: porto, error: null });
  assert.deepEqual(data(location.location.position.value), porto);

  const denied = { code: 'ERR_PERMISSION', message: 'Location access is denied' };

  location.emit('Location', 'position', { id: 2, location: null, error: denied });
  assert.deepEqual(data(location.location.error.value), denied);

  location.emit('Location', 'position', { id: 1, location: lisbon, error: null });
  assert.equal(location.location.error.value, null, 'a fix clears it');

  a.remove();
  b.remove();

  assert.deepEqual(
    location.observed.filter((entry) => entry.endsWith('position')),
    ['start Location.position', 'stop Location.position'],
  );
});

test('a watch the platform refuses sets the error and leaves nothing subscribed', async () => {
  const location = await app({
    watchPosition: {
      thread: 'main',
      run() {
        throw { code: 'ERR_PERMISSION', message: 'Location access is denied' };
      },
    },
  });

  location.location.watch();
  await location.flush();

  assert.equal(location.location.error.value?.code, 'ERR_PERMISSION');
  assert.deepEqual(location.observed, ['start Location.position', 'stop Location.position']);
});

test('watchHeading listens to the compass only while subscribed', async () => {
  const location = await app();
  const heard: unknown[] = [];
  const heading = { trueHeading: 92, magHeading: 90, accuracy: 3 };
  const watch = await location.run(() =>
    location.location.watchHeading((next) => heard.push(next)),
  );

  assert.deepEqual(location.observed, ['start Location.heading']);
  location.emit('Location', 'heading', heading);
  watch.remove();
  location.emit('Location', 'heading', heading);

  assert.deepEqual(data(heard), [heading]);
  assert.deepEqual(location.observed, ['start Location.heading', 'stop Location.heading']);
});

test('watchHeading rejects on a device without a compass', async () => {
  const location = await app({ hasHeading: { thread: 'js', run: () => false } });

  await assert.rejects(
    location.location.watchHeading(() => {}),
    (error: Error & { code: string }) => {
      assert.equal(error.code, 'ERR_UNAVAILABLE');
      assert.match(error.message, /location\.watchHeading: this device has no compass/);

      return true;
    },
  );

  assert.deepEqual(location.observed, []);
});

test('geocoding and the services check cross as they are', async () => {
  const location = await app();

  assert.deepEqual(
    data(await location.run(() => location.location.geocode('Praça do Comércio, Lisboa'))),
    [{ latitude: 38.7, longitude: -9.1 }],
  );

  assert.deepEqual(
    data(
      await location.run(() =>
        location.location.reverseGeocode({ latitude: 38.7, longitude: -9.1 }),
      ),
    ),
    [{ city: 'Lisboa' }],
  );

  assert.equal(await location.run(() => location.location.servicesEnabled()), true);

  await assert.rejects(
    location.location.reverseGeocode({ latitude: 91, longitude: 0 }),
    typeError(/location\.reverseGeocode: latitude must be between -90 and 90/),
  );

  assert.deepEqual(data(location.calls), [
    { module: 'Location', method: 'geocode', args: ['Praça do Comércio, Lisboa'] },
    { module: 'Location', method: 'reverseGeocode', args: [{ latitude: 38.7, longitude: -9.1 }] },
    { module: 'Location', method: 'hasServicesEnabled', args: [] },
  ]);
});

// Background updates: the platform keeps locating with the app in the
// background and delivers each batch of fixes as a run of the task.

const calls = (location: Awaited<ReturnType<typeof app>>, method: string) =>
  data(location.calls.filter((call) => call.method === method).map((call) => call.args));

test('defining a location task listens for runs and resumes updates started before a relaunch', async () => {
  const location = await app({}, taskApp);

  await location.flush();

  assert.deepEqual(location.observed, ['start BackgroundTasks.run']);
  assert.deepEqual(calls(location, 'resumeLocationUpdates'), [['track']]);
});

test('a location task runs with the fixes the platform delivered, then finishes', async () => {
  const location = await app({}, taskApp);

  location.emit('BackgroundTasks', 'run', {
    id: 'run-1',
    name: 'track',
    deadline: 1700000025000,
    data: { locations: [lisbon, porto] },
  });

  await location.flush();
  await location.flush();

  assert.deepEqual(data(location.tracked), [
    { name: 'track', deadline: 1700000025000, locations: [lisbon, porto] },
  ]);

  assert.deepEqual(calls(location, 'finish'), [['run-1', true]]);
});

test('a run without fixes fails the location task and says why', async () => {
  const location = await app({}, taskApp);

  location.emit('BackgroundTasks', 'run', { id: 'run-2', name: 'track', deadline: 1 });
  await location.flush();
  await location.flush();

  assert.deepEqual(data(location.tracked), []);
  assert.deepEqual(calls(location, 'finish'), [['run-2', false]]);

  assert.ok(
    location.logs.some((message) => message.includes("Location task 'track' got no locations")),
    JSON.stringify(location.logs),
  );
});

test('startUpdates sends every option filled in', async () => {
  const location = await app({}, taskApp);

  await location.run(() =>
    location.location.startUpdates('track', {
      accuracy: 'high',
      distanceInterval: 50,
      showsBackgroundLocationIndicator: true,
      notification: { title: 'Tracking your run', body: 'Tap to open' },
    }),
  );

  await location.run(() => location.location.startUpdates('track'));

  assert.deepEqual(calls(location, 'startLocationUpdates'), [
    [
      {
        name: 'track',
        accuracy: 'high',
        timeInterval: 1000,
        distanceInterval: 50,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        notificationTitle: 'Tracking your run',
        notificationBody: 'Tap to open',
      },
    ],
    [
      {
        name: 'track',
        accuracy: 'balanced',
        timeInterval: 1000,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: false,
        notificationTitle: null,
        notificationBody: null,
      },
    ],
  ]);
});

test('startUpdates rejects an undefined task or invalid options before the platform', async () => {
  const location = await app({}, taskApp);

  await assert.rejects(
    location.location.startUpdates('commute'),
    /location\.startUpdates: no location task named 'commute'.*location\.defineUpdates\('commute', task\)/,
  );

  await assert.rejects(
    location.location.startUpdates('track', { accuracy: 'precise' }),
    typeError(/location\.startUpdates: accuracy must be one of/),
  );

  await assert.rejects(
    location.location.startUpdates('track', { notification: { title: 4 } }),
    typeError(/location\.startUpdates: notification\.title must be a string/),
  );

  assert.deepEqual(calls(location, 'startLocationUpdates'), []);
});

test('stopUpdates and updating cross by name', async () => {
  const location = await app({}, taskApp);

  assert.equal(await location.run(() => location.location.updating('track')), true);

  await location.run(() => location.location.stopUpdates('track'));

  assert.deepEqual(calls(location, 'hasStartedLocationUpdates'), [['track']]);
  assert.deepEqual(calls(location, 'stopLocationUpdates'), [['track']]);
});
