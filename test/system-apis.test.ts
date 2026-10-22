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

// app, device, localization, appearance, keepAwake and brightness as an app
// calls them, against a fake platform that answers like the iOS and Android
// modules.

interface Subscription {
  remove(): void;
}

interface ReadonlySignal<T> {
  readonly value: T;
}

interface Apis {
  app: {
    readonly state: ReadonlySignal<string>;
    watch(event: string, listener: () => void): Subscription;
    openSettings(): Promise<void>;
  };
  device: Record<string, unknown>;
  localization: {
    readonly locales: ReadonlySignal<unknown[]>;
    readonly calendars: ReadonlySignal<unknown[]>;
  };
  appearance: {
    readonly colorScheme: ReadonlySignal<string | null>;
    readonly fontScale: ReadonlySignal<number>;
  };
  keepAwake(options?: { scope?: unknown }): () => void;
  brightness: {
    level: { value: number | null };
    readonly system: ReadonlySignal<boolean | null>;
    restore(): Promise<void>;
  };
  setReading(value: boolean): void;
  showScheme(value: boolean): void;
  showScreen(value: boolean): void;
  window: { readonly size: ReadonlySignal<object> };
  keyboard: {
    watch(event: string, listener: (event: { frame: object }) => void): Subscription;
  };
  __kuito: { dispatch(handle: number, event: string, payload?: string): unknown };
}

/** Values from the kernel's realm, comparable with this one's. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

async function compile(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-apis-'));

  try {
    return (await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(entry))).code;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const code = compile('test/fixtures/system-apis-app.tsx');

const tick = () => new Promise<void>((done) => setTimeout(done, 0));

async function apis(modules: Record<string, FakeModule>) {
  // The app reads the device's facts when it starts.
  const native = fakeModules({ ...device(), ...modules });
  const views = new Map<string, Record<string, unknown>>();
  const kernel = installKernel(
    hosting({
      createView(id: string) {
        views.set(id, {});
      },
      setProp(id: string, name: string, value: unknown) {
        const props = views.get(id);

        if (props) props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
      moveView() {},
      command() {},
      ...native.host,
    }),
  );

  native.attach(kernel);
  runInNewContext(await code, kernel);

  /** Settles the queued native calls, then lets the promises run. */
  const flush = async () => {
    native.flush();
    await tick();
  };

  /** Lets a re-render reach the host. */
  const render = async (change: () => void) => {
    change();
    await tick();
  };

  return {
    ...native,
    ...(kernel as unknown as Apis),
    flush,
    render,
    text: () => views.get('scheme')?.text,
    screen: () => views.get('screen')?.text,
  };
}

function appState(current: () => string): Record<string, FakeModule> {
  return {
    AppState: {
      functions: {
        state: { thread: 'js', run: current },
        openSettings: { thread: 'main', run: () => null },
      },
    },
  };
}

function appearance(scheme: () => string | null, scale = 1): Record<string, FakeModule> {
  return {
    Appearance: {
      functions: {
        colorScheme: { thread: 'js', run: scheme },
        fontScale: { thread: 'js', run: () => scale },
      },
    },
  };
}

test('app.state reads the platform on each read while nothing watches it', async () => {
  let state = 'active';
  const kuito = await apis(appState(() => state));

  assert.equal(kuito.app.state.value, 'active');
  state = 'background';
  assert.equal(kuito.app.state.value, 'background');
  assert.deepEqual(kuito.observed, []);
});

test('system state is observed natively only while a component watches it', async () => {
  let state = 'active';
  const kuito = await apis({ ...appState(() => state), ...appearance(() => 'light') });

  await kuito.render(() => kuito.showScheme(true));
  assert.equal(kuito.text(), 'light active 0');

  assert.deepEqual(kuito.observed.slice().sort(), [
    'start AppState.memoryWarning',
    'start AppState.state',
    'start Appearance.colorScheme',
  ]);

  // The platform reports the state it starts from; only a real change re-renders.
  kuito.emit('AppState', 'state', 'active');
  state = 'inactive';
  kuito.emit('AppState', 'state', 'inactive');
  kuito.emit('Appearance', 'colorScheme', 'dark');
  kuito.emit('AppState', 'memoryWarning', null);
  await tick();
  assert.equal(kuito.text(), 'dark inactive 1');

  await kuito.render(() => kuito.showScheme(false));

  assert.deepEqual(kuito.observed.filter((entry) => entry.startsWith('stop')).sort(), [
    'stop AppState.memoryWarning',
    'stop AppState.state',
    'stop Appearance.colorScheme',
  ]);
});

test('a change between the render and the start of observing still shows', async () => {
  // The platform's main thread moves on while the JS thread renders: the
  // render reads one state, and observing starts from the next.
  const states = ['inactive', 'active'];
  const kuito = await apis({
    ...appState(() => states.shift() ?? 'active'),
    ...appearance(() => 'light'),
  });

  await kuito.render(() => kuito.showScheme(true));
  await tick();
  assert.match(String(kuito.text()), / active /);
});

test('app.watch outside a component returns its subscription; another event throws', async () => {
  const kuito = await apis(appState(() => 'active'));
  let warnings = 0;
  const subscription = kuito.app.watch('memoryWarning', () => warnings++);

  kuito.emit('AppState', 'memoryWarning', null);
  subscription.remove();
  kuito.emit('AppState', 'memoryWarning', null);

  assert.equal(warnings, 1);

  assert.throws(() => kuito.app.watch('focus', () => {}), {
    name: 'TypeError',
    message: /app\.watch: no "focus" event; watch memoryWarning/,
  });
});

test('app.openSettings opens the app’s page through the platform', async () => {
  const kuito = await apis(appState(() => 'active'));
  const opened = kuito.app.openSettings();

  await kuito.flush();
  await opened;

  assert.deepEqual(data(kuito.calls.filter(({ module }) => module === 'AppState')), [
    { module: 'AppState', method: 'openSettings', args: [] },
  ]);
});

const iPhone = {
  isDevice: false,
  brand: 'Apple',
  manufacturer: 'Apple',
  modelName: 'iPhone 16 Pro',
  modelId: 'iPhone17,1',
  deviceType: 1,
  totalMemory: 8_589_934_592,
  osName: 'iOS',
  osVersion: '26.0',
  osBuildId: '23A5260n',
  platformApiLevel: null,
};

function device(info: object = iPhone): Record<string, FakeModule> {
  return { Device: { functions: { info: { thread: 'js', run: () => info } } } };
}

test('device reads its facts from the platform once, synchronously', async () => {
  const kuito = await apis(device());

  assert.equal(kuito.device.model, 'iPhone 16 Pro');
  assert.equal(kuito.device.physical, false);
  assert.equal(kuito.device.type, 'phone');
  assert.equal(kuito.device.memory, 8_589_934_592);
  assert.equal(kuito.device.apiLevel, null);
  assert.equal(kuito.device.osVersion, '26.0');

  assert.deepEqual(
    kuito.calls.map((call) => call.method),
    ['info'],
  );
});

const english = {
  languageTag: 'en-US',
  languageCode: 'en',
  languageScriptCode: null,
  regionCode: 'US',
  textDirection: 'ltr',
  decimalSeparator: '.',
  digitGroupingSeparator: ',',
  measurementSystem: 'us',
  currencyCode: 'USD',
  currencySymbol: '$',
  temperatureUnit: 'fahrenheit',
};
const gregorian = {
  calendar: 'gregory',
  timeZone: 'America/New_York',
  uses24hourClock: false,
  firstWeekday: 1,
};

function localization(
  locales: () => unknown[] = () => [english],
  calendars: () => unknown[] = () => [gregorian],
): Record<string, FakeModule> {
  return {
    Localization: {
      functions: {
        locales: { thread: 'js', run: locales },
        calendars: { thread: 'js', run: calendars },
      },
    },
  };
}

test('localization reads locales and calendars synchronously, fresh while unwatched', async () => {
  let calendar = gregorian;
  const kuito = await apis(localization(undefined, () => [calendar]));

  assert.deepEqual(data(kuito.localization.locales.value), [english]);
  assert.deepEqual(data(kuito.localization.calendars.value), [gregorian]);

  calendar = { ...gregorian, timeZone: 'Europe/Lisbon', uses24hourClock: true };
  assert.deepEqual(data(kuito.localization.calendars.value), [calendar]);
});

test('appearance reads the color scheme and font scale synchronously', async () => {
  let scheme: string | null = 'light';
  const kuito = await apis(appearance(() => scheme, 1.235));

  assert.equal(kuito.appearance.colorScheme.value, 'light');
  scheme = null;
  assert.equal(kuito.appearance.colorScheme.value, null);
  assert.equal(kuito.appearance.fontScale.value, 1.235);
});

function keepAwake(held: Set<string>): Record<string, FakeModule> {
  return {
    KeepAwake: {
      functions: {
        activate: { thread: 'main', run: (tag) => held.add(String(tag)) && null },
        deactivate: { thread: 'main', run: (tag) => held.delete(String(tag)) && null },
      },
    },
  };
}

test('keepAwake() holds the screen while its component is mounted', async () => {
  const held = new Set<string>();
  const kuito = await apis(keepAwake(held));

  await kuito.render(() => kuito.setReading(true));
  await kuito.flush();
  assert.equal(held.size, 1);

  await kuito.render(() => kuito.setReading(false));
  await kuito.flush();
  assert.equal(held.size, 0);

  assert.deepEqual(
    kuito.calls.filter(({ module }) => module === 'KeepAwake').map(({ method }) => method),
    ['activate', 'deactivate'],
  );
});

test('keepAwake() outside a component needs the app scope, and returns its release', async () => {
  const held = new Set<string>();
  const kuito = await apis(keepAwake(held));

  assert.throws(() => kuito.keepAwake(), {
    message:
      /keepAwake\(\) must run while a component sets up, which owns it; pass \{ scope: app \}/,
  });

  const first = kuito.keepAwake({ scope: kuito.app });
  const second = kuito.keepAwake({ scope: kuito.app });

  await kuito.flush();
  assert.equal(held.size, 2);

  first();
  first();
  await kuito.flush();
  assert.equal(held.size, 1);

  second();
  await kuito.flush();
  assert.equal(held.size, 0);
});

function brightness(screen: { value: number; system: boolean }): Record<string, FakeModule> {
  return {
    Brightness: {
      functions: {
        getBrightness: { thread: 'main', run: () => screen.value },
        setBrightness: {
          thread: 'main',
          run(value) {
            screen.value = Number(value);
            screen.system = false;
          },
        },
        restoreSystemBrightness: {
          thread: 'main',
          run() {
            screen.value = 0.5;
            screen.system = true;
          },
        },
        isUsingSystemBrightness: { thread: 'main', run: () => screen.system },
      },
    },
  };
}

test('brightness.level is null until the platform answers, then the level', async () => {
  const kuito = await apis(brightness({ value: 0.4, system: true }));

  assert.equal(kuito.brightness.level.value, null);
  await kuito.flush();
  assert.equal(kuito.brightness.level.value, 0.4);
  assert.equal(kuito.brightness.system.value, true);
});

test('writing brightness.level sets the app’s level; restore gives it back', async () => {
  const screen = { value: 0.5, system: true };
  const kuito = await apis(brightness(screen));

  await kuito.flush();
  kuito.brightness.level.value = 0.9;
  assert.equal(kuito.brightness.level.value, 0.9);
  assert.equal(kuito.brightness.system.value, false);
  await kuito.flush();
  assert.deepEqual(screen, { value: 0.9, system: false });

  const restored = kuito.brightness.restore();

  await kuito.flush();
  await kuito.flush();
  await restored;
  assert.equal(kuito.brightness.level.value, 0.5);
  assert.equal(kuito.brightness.system.value, true);
});

test('brightness.level takes a level from 0 to 1, before anything crosses', async () => {
  const kuito = await apis(brightness({ value: 0.5, system: true }));

  await kuito.flush();

  const reads = kuito.calls.length;

  for (const level of [-0.1, 1.5, Number.NaN])
    assert.throws(
      () => {
        kuito.brightness.level.value = level;
      },
      { name: 'RangeError', message: /brightness\.level takes a level from 0 to 1/ },
    );

  assert.equal(kuito.calls.length, reads);
});

function windowModule(metrics: () => object): Record<string, FakeModule> {
  return { Window: { functions: { metrics: { thread: 'js', run: metrics } } } };
}

const portrait = {
  width: 402,
  height: 874,
  insets: { top: 62, left: 0, bottom: 34, right: 0 },
  orientation: 'portrait',
};

test('window, keyboard and accessibility state follow the platform while watched', async () => {
  const kuito = await apis(windowModule(() => portrait));
  const dispatch = (event: string, payload: string) => kuito.__kuito.dispatch(0, event, payload);

  await kuito.render(() => kuito.showScreen(true));
  assert.equal(kuito.screen(), '402x874 portrait top 62 keyboard false reader null');
  assert.deepEqual(kuito.observed, ['start Window.metrics']);

  kuito.emit('Window', 'metrics', {
    width: 874,
    height: 402,
    insets: { top: 0, left: 62, bottom: 21, right: 62 },
    orientation: 'landscape',
  });

  dispatch(
    'keyboard.didshow',
    JSON.stringify({ screenX: 0, screenY: 500, width: 874, height: 300, duration: 250 }),
  );

  dispatch('accessibility.status', '{"screenReaderEnabled":true,"reduceMotionEnabled":false}');

  await tick();
  assert.equal(kuito.screen(), '874x402 landscape top 0 keyboard true reader true');

  await kuito.render(() => kuito.showScreen(false));
  assert.deepEqual(kuito.observed, ['start Window.metrics', 'stop Window.metrics']);
});

test('window.size is the same object while the size stays', async () => {
  let metrics = portrait;
  const kuito = await apis(windowModule(() => metrics));
  const first = kuito.window.size.value;

  metrics = { ...portrait, insets: { ...portrait.insets, top: 0 } };
  assert.equal(kuito.window.size.value, first);
});

test('keyboard.watch hears each event; another name throws', async () => {
  const kuito = await apis({});
  const api = kuito;
  const heard: unknown[] = [];
  const subscription = api.keyboard.watch('willShow', (event) => heard.push(event.frame));

  kuito.__kuito.dispatch(
    0,
    'keyboard.willshow',
    JSON.stringify({ screenX: 0, screenY: 500, width: 402, height: 300, duration: 250 }),
  );

  subscription.remove();

  kuito.__kuito.dispatch(
    0,
    'keyboard.willshow',
    JSON.stringify({ screenX: 0, screenY: 500, width: 402, height: 300, duration: 250 }),
  );

  assert.deepEqual(data(heard), [{ screenX: 0, screenY: 500, width: 402, height: 300 }]);
  assert.throws(() => api.keyboard.watch('keyboardDidShow', () => {}), /keyboardDidShow/);
});
