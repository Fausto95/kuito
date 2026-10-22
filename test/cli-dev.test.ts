import { test, vi } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { Crash } from '../src/cli/crash.ts';
import type { BundledAsset } from '../src/dev/assets.ts';
import { runDev, sessionToken, type CliError } from '../src/cli/dev.ts';
import type { SessionEvent } from '../src/cli/session/state.ts';
import type { SessionStore } from '../src/cli/session/store.ts';
import type { SessionActions } from '../src/cli/session/view.ts';
import { fixtureDevice } from './support/cli.ts';
import { present } from './support/present.ts';

// Interactive sessions render through Ink; the fake hands the test the
// store and shortcut actions the view is given.
const views = vi.hoisted(() => [] as unknown[]);

vi.mock('ink', () => ({
  render: (element: { props: unknown }) => {
    views.push(element.props);
    return { clear: () => {}, unmount: () => {} };
  },
}));

type RunDevOptions = Parameters<typeof runDev>[0];
type Deps = RunDevOptions['deps'];
type Steps = ReturnType<Deps['platform']>;

const entry = '/work/kuito/demo/component-app.tsx';
const device = fixtureDevice({
  id: 'SIM',
  name: 'iPhone 18 Pro',
  detail: 'iOS 27.0',
  platform: 'ios',
  active: true,
});

class FakeServer extends EventEmitter {
  stdin = new PassThrough();
  kill = () => this.emit('exit', 0);
}

function fakeServer(): never {
  // Stands in for the server process: the session only writes stdin, kills and awaits exit.
  return new FakeServer() as never;
}

interface HarnessOptions {
  build?: Steps['build'];
  /** What the on-device compile finds the app requires. */
  requires?: string[];
  /** The images the compile finds the app imports. */
  images?: BundledAsset[];
  /** The module functions the compile finds the app calls, and their numbering. */
  links?: number[];
  linkHash?: string;
  watch?: Deps['watchApp'];
  /** The device the session runs on, as discovery lists it and as boot leaves it. */
  target?: { listed: typeof device; booted: typeof device };
  boot?: Steps['boot'];
}

function harness({
  build = async () => '/tmp/KuitoIOS.app',
  watch = () => new Promise(() => {}),
  requires = [],
  images = [],
  links = [],
  linkHash = '',
  target = { listed: device, booted: device },
  boot = async () => target.booted,
}: HarnessOptions = {}) {
  const lines: string[] = [];
  const calls: unknown[][] = [];
  const discovered: unknown[] = [];
  const servers: Parameters<Deps['startServer']>[0][] = [];
  const launches: Parameters<Steps['launch']>[2][] = [];
  const native: { changed: (() => void) | null; emit: ((event: SessionEvent) => void) | null } = {
    changed: null,
    emit: null,
  };
  // Non-interactive sessions never stream device logs, so the fake has no streamLogs.
  const deps: Omit<Deps, 'streamLogs'> = {
    discover: async (options) => {
      discovered.push(options);

      return { devices: [target.listed], diagnostics: [] };
    },
    platform: () => ({
      bootLabel: () => 'Simulator booted',
      boot,
      build,
      launch: async (_device, _artifact, options) => {
        calls.push(['launch', options.port]);
        launches.push(options);

        return { label: 'iOS iPhone 18 Pro', pid: 42 };
      },
    }),
    buildDeviceAssets: async () => {
      calls.push(['assets']);

      return {
        nativeModules: requires.map((name) => ({ name, file: '/app/x.ts', line: 1 })),
        links,
        linkHash,
        assets: images,
      };
    },
    watchNative: (onChange) => {
      native.changed = onChange;

      return () => {
        native.changed = null;
      };
    },
    watchApp: watch,
    startServer: async (server) => {
      const { onEvent, port } = server;
      const emit = present(onEvent, 'onEvent');

      servers.push(server);
      calls.push(['server', port]);
      native.emit = emit;
      emit({ type: 'ready', url: 'ws://127.0.0.1:8765' });
      emit({ type: 'patched', revision: 1, ms: 90, files: [], initial: true, delivered: 0 });

      return fakeServer();
    },
  };
  const stdin = new PassThrough();
  const options: RunDevOptions = {
    args: { entry, port: 8765, device: null, platform: null, noLaunch: false },
    deps: deps as never,
    interactive: false,
    cwd: '/work/kuito',
    stdin,
    out: (line) => lines.push(line),
  };

  return { lines, stdin, options, calls, native, discovered, servers, launches };
}

test('a session lists paired iPhones next to simulators', async () => {
  const { options, stdin, discovered } = harness();
  const running = runDev(options);

  await vi.waitFor(() => assert.ok(discovered.length));
  stdin.end('q\n');
  await running;

  assert.deepEqual(discovered, [{ platform: null, physicalIOS: true }]);
});

test('a paired iPhone gets its tunnel served with a session token, and launches with it', async () => {
  const phone = fixtureDevice({
    id: '00008140-000C246422F3001C',
    name: 'iTroika',
    platform: 'ios',
    active: true,
    emulator: false,
  });
  const { options, stdin, servers, launches } = harness({
    target: { listed: phone, booted: { ...phone, tunnel: 'fdd1:2ad:47c1::2' } },
  });
  const running = runDev(options);

  await vi.waitFor(() => assert.ok(launches.length));
  stdin.end('q\n');
  await running;

  assert.equal(servers[0].tunnel, 'fdd1:2ad:47c1::2');
  assert.ok(servers[0].token.length >= 43, 'a 256-bit token');
  assert.equal(launches[0].token, servers[0].token);
});

test('a simulator session opens no phone link, and its app sends the token too', async () => {
  const { options, stdin, servers, launches } = harness();
  const running = runDev(options);

  await vi.waitFor(() => assert.ok(servers.length));
  stdin.end('q\n');
  await running;

  assert.equal(servers[0].tunnel, undefined);
  assert.equal(launches[0].token, servers[0].token);
});

test('a non-interactive session reports each step, then fails fast when the app crashes', async () => {
  const crash: Crash = {
    pid: undefined,
    process: 'KuitoIOS',
    exception: 'EXC_BREAKPOINT',
    signal: 'SIGTRAP',
    messages: [],
    frames: [{ image: 'UIKitCore', symbol: 'boom' }],
    report: '/r.ips',
  };
  const { lines, options } = harness({ watch: async () => crash });

  await assert.rejects(
    runDev(options),
    (error: CliError) => /KuitoIOS crashed/.test(error.message) && error.reported === true,
  );

  const text = lines.join('\n');

  for (const expected of [
    /◆ kuito dev\s+iPhone 18 Pro · iOS 27\.0/,
    /✔ Simulator booted/,
    /✔ Native app built/,
    /✔ Live Patch on :8765/,
    /✔ App launched/,
    /● Live\s+demo\/component-app\.tsx → iPhone 18 Pro/,
    /✖ KuitoIOS crashed/,
  ]) {
    assert.match(text, expected);
  }
});

test('a failing build is reported once, in the feed, with its output', async () => {
  const { lines, options } = harness({
    build: async () => {
      throw new Error('xcodebuild failed (65)\nerror: missing file');
    },
  });

  await assert.rejects(runDev(options), (error: CliError) => error.reported === true);

  assert.match(
    lines.join('\n'),
    /✖ Native app built[\s\S]*xcodebuild failed \(65\)[\s\S]*error: missing file/,
  );
});

test('what a build had to fix, such as a flattened icon, is a warning in the feed', async () => {
  // Quits once the app is watched, which is after the build reported.
  let quit = () => {};
  const { lines, stdin, options } = harness({
    build: async (_device, { onWarning }) => {
      onWarning?.('kuito.config.ts: icon has transparency');

      return '/tmp/KuitoIOS.app';
    },
    watch: () => {
      quit();

      return new Promise(() => {});
    },
  });

  quit = () => stdin.write('q\n');
  await runDev(options);
  assert.match(lines.join('\n'), /▲ kuito\.config\.ts: icon has transparency/);
});

test('typing quit on stdin ends a non-interactive session cleanly', async () => {
  const { lines, stdin, options } = harness();
  const running = runDev(options);

  await new Promise((resolve) => setTimeout(resolve, 20));
  stdin.write('quit\n');
  await running;
  assert.match(lines.join('\n'), /● Live/);
});

test('the app is compiled first, then served and launched on the session port', async () => {
  const { lines, stdin, options, calls } = harness();
  const running = runDev(options);

  await new Promise((resolve) => setTimeout(resolve, 20));
  stdin.write('q\n');
  await running;
  assert.deepEqual(calls, [['assets'], ['server', 8765], ['launch', 8765]]);
  assert.match(lines.join('\n'), /✔ On-device app compiled/);
});

test("each platform gets its own bundle: the device's is compiled and served", async () => {
  const { stdin, options } = harness();
  const platforms: string[] = [];
  const { buildDeviceAssets, startServer } = options.deps;

  options.deps = {
    ...options.deps,
    buildDeviceAssets: (entryFile, platform) => {
      platforms.push('assets ' + platform);

      return buildDeviceAssets(entryFile, platform);
    },
    startServer: (server) => {
      platforms.push('server ' + server.platform);

      return startServer(server);
    },
  };

  const running = runDev(options);

  await new Promise((resolve) => setTimeout(resolve, 20));
  stdin.write('q\n');
  await running;
  assert.deepEqual(platforms, ['assets ios', 'server ios']);
});

test('a session with no device to launch needs the platform it serves', async () => {
  const { options } = harness();

  options.args = { ...options.args, noLaunch: true };

  await assert.rejects(
    runDev(options),
    /--no-launch needs a platform, as kuito dev ios --no-launch/,
  );
});

test('a compile failure during startup is reported at its source location', async () => {
  const error = Object.assign(new Error('Kuito styles: color must be a compile-time literal'), {
    diagnostics: [
      {
        message: 'Kuito styles: color must be a compile-time literal',
        file: '/work/kuito/demo/screens/overview.tsx',
        line: 3,
        column: 20,
        plugin: 'kuito-transform',
      },
    ],
  });
  const { lines, options } = harness();

  options.deps.buildDeviceAssets = async () => {
    throw error;
  };

  await assert.rejects(runDev(options), (failure: CliError) => failure.reported === true);

  assert.match(
    lines.join('\n'),
    /✖ On-device app compiled\s+demo\/screens\/overview\.tsx:3:20\s+\d+ms/,
  );

  assert.match(lines.join('\n'), /reported by the Kuito compiler/);
});

function until(
  store: SessionStore,
  condition: (state: ReturnType<SessionStore['getState']>) => boolean,
) {
  return new Promise<void>((resolve) => {
    if (condition(store.getState())) return resolve();

    const unsubscribe = store.subscribe((state) => {
      if (!condition(state)) return;
      unsubscribe();
      resolve();
    });
  });
}

test('the crash watcher follows the device that launched, not one picked meanwhile', async () => {
  const other = fixtureDevice({ id: 'PIXEL', name: 'Pixel 9', platform: 'android' });
  const firstBuildStarted = Promise.withResolvers<void>();
  const firstBuild = Promise.withResolvers<string>();
  const watching = Promise.withResolvers<string>();
  const { options } = harness({
    build: (target) => {
      if (target.id !== device.id) return new Promise(() => {});

      firstBuildStarted.resolve();

      return firstBuild.promise;
    },
    watch: ({ device: target }) => {
      watching.resolve(target.id);

      return new Promise(() => {});
    },
  });
  const running = runDev({
    ...options,
    args: { ...options.args, device: device.id },
    deps: {
      ...options.deps,
      discover: async () => ({ devices: [device, other], diagnostics: [] }),
    },
    interactive: true,
  });
  const { store, actions } = present(views.pop(), 'Ink view props') as {
    store: SessionStore;
    actions: SessionActions;
  };

  await firstBuildStarted.promise;
  actions.switchDevice();
  await until(store, (state) => state.picker !== null);
  actions.select(other);
  firstBuild.resolve('/tmp/KuitoIOS.app');

  assert.equal(await watching.promise, device.id);

  actions.quit();
  await running;
});

/** Resolves once `calls` holds `count` entries named `name`. */
function callsOf(calls: unknown[][], name: string, count: number) {
  const deadline = Date.now() + 5000;

  return new Promise<void>((resolve, reject) => {
    const poll = () => {
      if (calls.filter(([call]) => call === name).length >= count) return resolve();
      if (Date.now() > deadline) return reject(new Error(`expected ${count} ${name} calls`));
      setImmediate(poll);
    };

    poll();
  });
}

test('a Swift or Kotlin change rebuilds the shell and relaunches the app', async () => {
  const built: unknown[] = [];
  const { stdin, options, calls, native } = harness({
    requires: ['Battery'],
    build: async (_device, { needs }) => {
      built.push(needs.uses);

      return '/tmp/KuitoIOS.app';
    },
  });
  const running = runDev(options);

  await callsOf(calls, 'launch', 1);
  present(native.changed, 'the native watcher')();
  await callsOf(calls, 'launch', 2);

  stdin.write('q\n');
  await running;

  assert.deepEqual(calls, [
    ['assets'],
    ['server', 8765],
    ['launch', 8765],
    ['assets'],
    ['launch', 8765],
  ]);

  assert.deepEqual(built, [
    [{ name: 'Battery', file: '/app/x.ts', line: 1 }],
    [{ name: 'Battery', file: '/app/x.ts', line: 1 }],
  ]);

  assert.equal(native.changed, null, 'the watcher stops with the session');
});

test('a Live Patch that requires a module the shell lacks rebuilds it; others stay patches', async () => {
  const { lines, stdin, options, calls, native } = harness({
    requires: ['Haptics'],
  });
  const running = runDev(options);
  const use = (name: string) => ({ name, file: '/app/x.ts', line: 1 });

  await callsOf(calls, 'launch', 1);

  const emit = present(native.emit, 'the server');

  const patch = { ms: 9, files: [], initial: false, delivered: 1 };

  emit({ type: 'patched', revision: 2, ...patch, nativeModules: [use('Haptics')] });
  emit({ type: 'patched', revision: 3, ...patch, nativeModules: [use('Video'), use('Haptics')] });

  await callsOf(calls, 'launch', 2);

  stdin.write('q\n');
  await running;

  assert.equal(calls.filter(([call]) => call === 'assets').length, 2, 'one rebuild, for Video');
  assert.match(lines.join('\n'), /Rebuilding the shell: the app now requires Video/);
});

test('a Live Patch that calls a function the shell did not link, or renumbers them, rebuilds it', async () => {
  const { lines, stdin, options, calls, native } = harness({ links: [1, 4], linkHash: 'h1' });
  const running = runDev(options);

  await callsOf(calls, 'launch', 1);

  const emit = present(native.emit, 'the server');
  const patch = { ms: 9, files: [], initial: false, delivered: 1, nativeModules: [] };

  emit({ type: 'patched', revision: 2, ...patch, links: [4], linkHash: 'h1' });
  emit({ type: 'patched', revision: 3, ...patch, links: [1, 4, 6], linkHash: 'h1' });
  await callsOf(calls, 'launch', 2);

  emit({ type: 'patched', revision: 4, ...patch, links: [1], linkHash: 'h2' });
  await callsOf(calls, 'launch', 3);

  stdin.write('q\n');
  await running;

  const log = lines.join('\n');

  assert.match(log, /Rebuilding the shell: the app now calls 1 more native module function\b/);
  assert.match(log, /Rebuilding the shell: a native module spec changed/);
});

const image = (name: string, hash = 'a'): BundledAsset => ({
  name,
  file: `/work/kuito/images/${name}.png`,
  type: 'png',
  variants: [{ scale: 1, file: `/work/kuito/images/${name}.png` }],
  width: 1,
  height: 1,
  hash,
});

test('the shell is built with the images the app imports', async () => {
  const built: unknown[] = [];
  const { stdin, options, calls } = harness({
    images: [image('asset_cover')],
    build: async (_device, { assets }) => {
      built.push(assets.map(({ name }) => name));

      return '/tmp/KuitoIOS.app';
    },
  });
  const running = runDev(options);

  await callsOf(calls, 'launch', 1);
  stdin.write('q\n');
  await running;

  assert.deepEqual(built, [['asset_cover']]);
});

test('a Live Patch with a new or edited image rebuilds the shell; the same images stay patches', async () => {
  const { lines, stdin, options, calls, native } = harness({
    images: [image('asset_cover')],
  });
  const running = runDev(options);

  await callsOf(calls, 'launch', 1);

  const emit = present(native.emit, 'the server');

  const patch = { ms: 9, files: [], initial: false, delivered: 1 };

  emit({ type: 'patched', revision: 2, ...patch, assets: [image('asset_cover')] });

  emit({
    type: 'patched',
    revision: 3,
    ...patch,
    assets: [image('asset_cover', 'b'), image('asset_logo')],
  });

  await callsOf(calls, 'launch', 2);

  stdin.write('q\n');
  await running;

  assert.equal(calls.filter(([call]) => call === 'assets').length, 2, 'one rebuild');

  assert.match(
    lines.join('\n'),
    /Rebuilding the shell: the app now bundles images\/asset_cover\.png, images\/asset_logo\.png/,
  );
});

test('each session makes its own token, unless the environment pins one', () => {
  const made = sessionToken({});

  assert.ok(made.length >= 43);
  assert.notEqual(sessionToken({}), made);
  assert.equal(sessionToken({ KUITO_DEV_TOKEN: 'p'.repeat(43) }), 'p'.repeat(43));
  assert.throws(() => sessionToken({ KUITO_DEV_TOKEN: 'short' }), /at least 43 characters/);
});

test('a relaunch reaches the phone again, and follows its tunnel to a new address', async () => {
  const phone = fixtureDevice({
    id: '00008140-000C246422F3001C',
    name: 'iTroika',
    platform: 'ios',
    active: true,
    emulator: false,
  });
  const tunnels = ['fdd1:2ad:47c1::2', 'fdd9:aaaa:bbbb::2'];
  const { options, stdin, servers, launches, native } = harness({
    target: { listed: phone, booted: phone },
    boot: async () => ({ ...phone, tunnel: tunnels.shift() }),
  });
  const running = runDev(options);

  await vi.waitFor(() => assert.equal(launches.length, 1));
  present(native.changed, 'the native watcher')();
  await vi.waitFor(() => assert.equal(launches.length, 2));
  stdin.end('q\n');
  await running;

  assert.deepEqual(
    servers.map((server) => server.tunnel),
    ['fdd1:2ad:47c1::2', 'fdd9:aaaa:bbbb::2'],
    'the server moves to the address the phone has now',
  );
});
