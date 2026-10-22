import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { NODE_TYPESCRIPT, parseArgs, ROOT } from '../src/cli/config.ts';
import { HELP } from '../src/cli/help.ts';
import { main } from '../src/cli/index.ts';
import { APP_CONFIG } from './support/app-config.ts';
import {
  discover,
  parseIOSDevices,
  parseAndroidDevices,
  hostOnTunnel,
  parsePhysicalIOSDevices,
  parseTunnelAddress,
  resolveDevice,
} from '../src/cli/devices.ts';
import { pickerWindow, SHORTCUTS } from '../src/cli/session/format.ts';
import {
  buildIOS,
  ensureAndroidBooted,
  launchAndroid,
  launchIOS,
  phoneLinkAddress,
  streamDeviceLogs,
} from '../src/cli/platforms.ts';
import { startLiveServer } from '../src/cli/dev.ts';
import { CommandError, createRunner, terminate, type OutputStream } from '../src/cli/runner.ts';
import type { SessionEvent } from '../src/cli/session/state.ts';
import { fixtureDevice, type RunOptions, type ServerSpawn } from './support/cli.ts';
import { present } from './support/present.ts';

interface RunCall {
  bin: string;
  args: readonly string[];
  opts: RunOptions;
}

const runner = () => {
  const calls: RunCall[] = [];

  return {
    calls,
    async run(bin: string, args: readonly string[], opts: RunOptions = {}) {
      calls.push({ bin, args, opts });

      if (bin === 'adb' && args.at(-1) === 'devices')
        return { stdout: 'List of devices attached\n', stderr: '' };

      return { stdout: '', stderr: '' };
    },
  };
};

test('parses commands, platforms, device selection and entry options', () => {
  const data = parseArgs([
    'dev',
    'android',
    '--device',
    'Pixel_9',
    '--port',
    '9000',
    '--entry',
    'demo/component-app.tsx',
  ]);

  assert.equal(data.command, 'dev');
  assert.equal(data.platform, 'android');
  assert.equal(data.device, 'Pixel_9');
  assert.equal(data.port, 9000);
  assert.match(data.entry, /component-app\.tsx$/);
  assert.equal(parseArgs(['build', 'ios']).command, 'build');
  assert.equal(parseArgs(['dev', '--env', 'staging']).env, 'staging');
  assert.equal(parseArgs(['dev']).env, 'development', 'dev runs the development environment');
  assert.equal(parseArgs(['build', 'ios']).env, 'production', 'build makes the production app');
  assert.equal(parseArgs(['build', 'ios']).profile, 'debug');
  assert.equal(parseArgs(['build', 'ios', '--profile', 'release']).profile, 'release');
  assert.throws(() => parseArgs(['build', '--profile', 'fast']), /Unknown profile 'fast'/);

  assert.throws(
    () => parseArgs(['dev', 'ios', '--profile', 'release']),
    /--profile only applies to kuito build/,
  );

  assert.equal(parseArgs([]).command, 'dev');
  assert.throws(() => parseArgs(['dev', '--bad']), /Unknown argument/);
  assert.throws(() => parseArgs(['dev', '--port', '0']), /Port must/);
  assert.throws(() => parseArgs(['dev', '-p', 'windows']), /Unknown platform/);
});

test('iOS JSON discovery retains boot state, filters unavailable targets', () => {
  const devices = parseIOSDevices(
    JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [
          { udid: 'A', name: 'iPhone 17', state: 'Booted', isAvailable: true },
          { udid: 'B', name: 'iPhone 16', state: 'Shutdown', isAvailable: false },
        ],
      },
    }),
  );

  assert.equal(devices.length, 1);
  assert.equal(devices[0].active, true);
  assert.equal(devices[0].id, 'A');
});

test('iOS discovery lists booted first, then newest runtime first, regardless of simctl key order', () => {
  const devices = parseIOSDevices(
    JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
          { udid: 'old', name: 'iPhone 16 Pro', state: 'Shutdown' },
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-26-10': [
          { udid: 'mid', name: 'iPhone 17 Pro', state: 'Shutdown' },
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
          { udid: 'new', name: 'iPhone 18 Pro', state: 'Shutdown' },
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-26-2': [
          { udid: 'booted', name: 'iPhone 17', state: 'Booted' },
        ],
      },
    }),
  );

  assert.deepEqual(
    devices.map((d) => d.id),
    ['booted', 'new', 'mid', 'old'],
  );

  assert.equal(devices.find((d) => d.id === 'new')?.detail, 'iOS 27.0');
});

/** One entry of `xcrun devicectl list devices --json-output -`, as Xcode 26 writes it. */
const coreDevice = ({
  name,
  udid,
  reality = 'physical',
  platform = 'iOS',
  connection = 'connected',
  os = '27.2',
}: {
  name: string;
  udid: string;
  reality?: string;
  platform?: string;
  connection?: string;
  os?: string;
}) => ({
  identifier: `core-${udid}`,
  properties: {
    connection: { pairingState: 'paired', state: connection, transportType: 'wired' },
    hardware: { deviceType: 'iPhone', marketingName: 'iPhone 16 Pro', platform, reality, udid },
    software: { osVersionNumber: { stringValue: os } },
    state: { bootState: 'booted', name },
  },
});

const devicectl = (devices: unknown[]) =>
  JSON.stringify({ info: { outcome: 'success' }, result: { devices } });

test('physical iOS devices come from devicectl: simulators and other platforms left out', () => {
  const devices = parsePhysicalIOSDevices(
    devicectl([
      coreDevice({ name: 'Away', udid: 'AWAY', connection: 'disconnected' }),
      coreDevice({ name: 'iPhone 18 Pro', udid: 'SIM', reality: 'simulated' }),
      coreDevice({ name: 'Watch', udid: 'WATCH', platform: 'watchOS' }),
      coreDevice({ name: 'Desk iPhone', udid: '00008140-000C246422F3001C' }),
      { identifier: 'no-properties' },
    ]),
  );

  assert.deepEqual(
    devices.map(({ id, name, active, emulator }) => ({ id, name, active, emulator })),
    [
      { id: '00008140-000C246422F3001C', name: 'Desk iPhone', active: true, emulator: false },
      { id: 'AWAY', name: 'Away', active: false, emulator: false },
    ],
    'connected first; the UDID xcodebuild destinations take',
  );

  assert.equal(devices[0].platform, 'ios');
  assert.equal(devices[0].detail, 'iOS 27.2 · iPhone 16 Pro');
  assert.deepEqual(parsePhysicalIOSDevices(devicectl([])), []);
  assert.throws(() => parsePhysicalIOSDevices('{}'), /devicectl/);
});

test('simulators are virtual devices', () => {
  const [simulator] = parseIOSDevices(
    JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
          { udid: 'S', name: 'iPhone 18 Pro', state: 'Shutdown' },
        ],
      },
    }),
  );

  assert.equal(simulator.emulator, true);
});

test(
  'discovery lists physical iOS devices after the simulators, only when asked',
  { tags: ['macos'] },
  async () => {
    const r = {
      async run(bin: string, args: readonly string[]) {
        const command = `${bin} ${args.slice(0, 3).join(' ')}`;
        const replies: Partial<Record<string, string>> = {
          'xcrun simctl list devices': JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
                { udid: 'SIM', name: 'iPhone 18 Pro', state: 'Booted' },
              ],
            },
          }),
          'xcrun devicectl list devices': devicectl([coreDevice({ name: 'Desk', udid: 'PHONE' })]),
        };

        return { stdout: replies[command] ?? '', stderr: '' };
      },
    };

    const simulators = await discover(r, { platform: 'ios' });

    assert.deepEqual(
      simulators.devices.map((d) => d.id),
      ['SIM'],
      'a dev session launches through simctl',
    );

    const all = await discover(r, { platform: 'ios', physicalIOS: true });

    assert.deepEqual(
      all.devices.map((d) => d.id),
      ['SIM', 'PHONE'],
    );

    const failing = {
      async run(bin: string, args: readonly string[]) {
        if (args[0] === 'devicectl') throw new Error('devicectl: no such command');
        return r.run(bin, args);
      },
    };
    const partial = await discover(failing, { platform: 'ios', physicalIOS: true });

    assert.deepEqual(
      partial.devices.map((d) => d.id),
      ['SIM'],
    );

    assert.match(partial.diagnostics.join('\n'), /iOS device discovery: devicectl/);
  },
);

test('picker window keeps the selection visible within the terminal height', () => {
  assert.deepEqual(pickerWindow({ length: 5, index: 0, rows: 20 }), { start: 0, end: 5 });
  assert.deepEqual(pickerWindow({ length: 70, index: 0, rows: 12 }), { start: 0, end: 10 });

  const tail = pickerWindow({ length: 70, index: 69, rows: 12 });

  assert.deepEqual(tail, { start: 60, end: 70 });

  const middle = pickerWindow({ length: 70, index: 35, rows: 12 });

  assert.ok(middle.start <= 35 && 35 < middle.end && middle.end - middle.start === 10);
});

test('ADB discovery ignores unauthorized and offline devices', () => {
  const found = parseAndroidDevices(
    'List of devices attached\nemulator-5554 device product:sdk model:Pixel_9 device:generic\n192.1 offline\nZX1 unauthorized\n',
  );

  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'Pixel 9');
  assert.equal(found[0].emulator, true);
});

test('Android hands the app its dev link through its private files, never an intent', async () => {
  const r = runner();

  await launchAndroid(r, {
    device: fixtureDevice({ id: 'emulator-5554', name: 'Pixel', emulator: true }),
    apk: '/tmp/app.apk',
    appId: 'com.example.hello',
    port: 9876,
    token: 'T'.repeat(43),
  });

  assert.deepEqual(
    r.calls.map((c) => c.args),
    [
      ['-s', 'emulator-5554', 'install', '-r', '/tmp/app.apk'],
      [
        '-s',
        'emulator-5554',
        'shell',
        "run-as com.example.hello sh -c 'mkdir -p files && cat > files/kuito-dev-link.json.new && mv files/kuito-dev-link.json.new files/kuito-dev-link.json'",
      ],
      [
        '-s',
        'emulator-5554',
        'shell',
        'am',
        'start',
        '-W',
        '-n',
        'com.example.hello/dev.kuito.runtime.KuitoActivity',
      ],
      ['-s', 'emulator-5554', 'shell', 'pidof', 'com.example.hello'],
    ],
  );

  // run-as is the shell's alone: no other app can write the link, as any app can send an intent.
  // adb shell, unlike exec-in, reports run-as failing; the rename keeps the app from reading half a link.
  assert.deepEqual(JSON.parse(present(r.calls[1].opts.input, 'the link on stdin')), {
    url: 'ws://10.0.2.2:9876',
    token: 'T'.repeat(43),
  });
});

test('Android physical device uses adb reverse for secure loopback development', async () => {
  const r = runner();

  await launchAndroid(r, {
    device: fixtureDevice({ id: 'real-device', name: 'Phone', emulator: false }),
    apk: '/tmp/app.apk',
    appId: 'com.example.hello',
    port: 9300,
    token: 'T'.repeat(43),
  });

  assert.ok(r.calls.some((c) => c.args.join(' ') === '-s real-device reverse tcp:9300 tcp:9300'));

  const link = present(
    r.calls.find((c) => c.opts.input !== undefined),
    'the dev link write',
  );

  assert.match(present(link.opts.input, 'its stdin'), /ws:\/\/127\.0\.0\.1:9300/);
});

test('iOS launch injects dev URL into app process; no IDE required', async () => {
  const r = runner();

  await launchIOS(r, {
    device: fixtureDevice({ id: 'SIM-1', name: 'iPhone' }),
    app: '/tmp/KuitoIOS.app',
    appId: 'com.example.hello',
    port: 7777,
    token: 'T'.repeat(43),
  });

  assert.deepEqual(r.calls[0].args, ['simctl', 'install', 'SIM-1', '/tmp/KuitoIOS.app']);

  assert.deepEqual(r.calls[1].args, [
    'simctl',
    'launch',
    '--terminate-running-process',
    'SIM-1',
    'com.example.hello',
  ]);

  assert.equal(r.calls[1].opts.env?.SIMCTL_CHILD_KUITO_DEV_URL, 'ws://127.0.0.1:7777');
  assert.equal(r.calls[1].opts.env?.SIMCTL_CHILD_KUITO_DEV_TOKEN, 'T'.repeat(43));
});

const TUNNEL_DETAILS = JSON.stringify({
  result: {
    properties: {
      connection: { state: 'connected', tunnelIPAddressString: 'fdd1:2ad:47c1::1' },
    },
  },
});

const INTERFACES = {
  en0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }],
  utun6: [{ address: 'fe80::d6a1:9a65:336f:37c3', family: 'IPv6', internal: false }],
  utun7: [
    { address: 'fe80::94f4:6a14:9e74:3bae', family: 'IPv6', internal: false },
    { address: 'fdd1:2ad:47c1::2', family: 'IPv6', internal: false },
  ],
  utun8: [{ address: 'fd00:aaaa:bbbb::2', family: 'IPv6', internal: false }],
} as never;

test('devicectl names the phone side of its CoreDevice tunnel', () => {
  assert.equal(parseTunnelAddress(TUNNEL_DETAILS), 'fdd1:2ad:47c1::1');

  assert.throws(
    () => parseTunnelAddress(JSON.stringify({ result: { properties: { connection: {} } } })),
    /no CoreDevice tunnel/,
  );
});

test('the Mac side of a phone tunnel is the local address in its /64', () => {
  assert.equal(hostOnTunnel('fdd1:2ad:47c1::1', INTERFACES), 'fdd1:2ad:47c1::2');

  assert.throws(
    () => hostOnTunnel('fdd9:1:2::1', INTERFACES),
    /No tunnel interface .* fdd9:1:2::1/,
  );
});

test('only a utun interface carries a phone tunnel, and only one may match', () => {
  const on = (name: string, address: string) =>
    ({ [name]: [{ address, family: 'IPv6', internal: false }] }) as never;

  // Wi-Fi in the same /64 is not the tunnel, whatever its address.
  assert.throws(() => hostOnTunnel('fdd1:2ad:47c1::1', on('en0', 'fdd1:2ad:47c1::2')), /No tunnel/);

  assert.throws(
    () => hostOnTunnel('2001:db8::1', on('utun9', '2001:db8::2')),
    /not a CoreDevice tunnel/,
    'a tunnel is a unique local address, fc00::/7',
  );

  assert.throws(
    () =>
      hostOnTunnel('fdd1:2ad:47c1::1', {
        utun7: [{ address: 'fdd1:2ad:47c1::2', family: 'IPv6', internal: false }],
        utun8: [{ address: 'fdd1:2ad:47c1::3', family: 'IPv6', internal: false }],
      } as never),
    /2 local addresses/,
  );
});

test('a phone link address comes from asking devicectl for the tunnel', async () => {
  const calls: (readonly string[])[] = [];
  const r = {
    async run(_bin: string, args: readonly string[]) {
      calls.push(args);

      return { stdout: TUNNEL_DETAILS, stderr: '' };
    },
  };
  const phone = fixtureDevice({ platform: 'ios', id: 'PHONE', emulator: false });

  assert.equal(await phoneLinkAddress(r, phone, { interfaces: INTERFACES }), 'fdd1:2ad:47c1::2');

  assert.deepEqual(calls[0], [
    'devicectl',
    'device',
    'info',
    'details',
    '--device',
    'PHONE',
    '--json-output',
    '-',
    '--quiet',
  ]);
});

test('a paired iPhone installs and launches through devicectl, its token kept off argv', async () => {
  const r = runner();
  const launched = await launchIOS(r, {
    device: fixtureDevice({ id: 'PHONE', name: 'iTroika', emulator: false, tunnel: 'fdd1::2' }),
    app: '/tmp/KuitoIOS.app',
    appId: 'com.example.hello',
    port: 7777,
    token: 'T'.repeat(43),
  });

  assert.deepEqual(r.calls[0].args, [
    'devicectl',
    'device',
    'install',
    'app',
    '--device',
    'PHONE',
    '/tmp/KuitoIOS.app',
  ]);

  assert.deepEqual(r.calls[1].args, [
    'devicectl',
    'device',
    'process',
    'launch',
    '--terminate-existing',
    '--device',
    'PHONE',
    'com.example.hello',
  ]);

  assert.deepEqual(r.calls[1].opts.env, {
    DEVICECTL_CHILD_KUITO_DEV_URL: 'ws://[fdd1::2]:7777',
    DEVICECTL_CHILD_KUITO_DEV_TOKEN: 'T'.repeat(43),
  });

  assert.equal(launched.pid, null, 'a process on the phone is not one this Mac can watch');
});

test('a paired iPhone without a tunnel is not launched', async () => {
  const r = runner();

  await assert.rejects(
    launchIOS(r, {
      device: fixtureDevice({ id: 'PHONE', name: 'iTroika', emulator: false }),
      app: '/tmp/KuitoIOS.app',
      appId: 'com.example.hello',
      token: 'T'.repeat(43),
    }),
    /iTroika has no phone link/,
  );

  assert.deepEqual(r.calls, []);
});

test('device logs from a paired iPhone say where to read them instead', () => {
  const phone = fixtureDevice({ platform: 'ios', id: 'PHONE', name: 'iTroika', emulator: false });

  assert.throws(() => streamDeviceLogs(runner(), phone, { onLine: () => {} }), /Console\.app/);
});

test('already booted iOS simulator skips boot but waits for bootstatus', async () => {
  const r = runner();
  const device = fixtureDevice({ id: 'X', active: true, emulator: true });

  await ensureAndroidBooted(r, fixtureDevice({ id: 'emulator-5554', emulator: true }));
  assert.equal(r.calls.length, 0);

  const { ensureIOSBooted } = await import('../src/cli/platforms.ts');

  await ensureIOSBooted(r, device);
  assert.deepEqual(r.calls[0].args, ['simctl', 'bootstatus', 'X', '-b']);
});

test('a physical iOS device is never booted through simctl', async () => {
  const r = runner();
  const { ensureIOSBooted } = await import('../src/cli/platforms.ts');
  const phone = fixtureDevice({ platform: 'ios', id: 'PHONE', active: true, emulator: false });

  assert.equal(await ensureIOSBooted(r, phone), phone);
  assert.deepEqual(r.calls, []);
});

test('a paired iPhone whose network tunnel is idle connects before the build', async () => {
  const r = runner();
  const { ensureIOSBooted } = await import('../src/cli/platforms.ts');
  const idle = fixtureDevice({
    platform: 'ios',
    id: 'PHONE',
    name: 'Desk iPhone',
    status: 'disconnected',
    active: false,
    emulator: false,
  });

  const connected = await ensureIOSBooted(r, idle);

  assert.deepEqual(r.calls[0].args, [
    'devicectl',
    'device',
    'info',
    'details',
    '--device',
    'PHONE',
  ]);

  assert.equal(connected.active, true);
  assert.equal(connected.status, 'connected');
});

test('a paired iPhone that is not connected fails before the build, saying what to do', async () => {
  const unreachable = {
    async run(): Promise<never> {
      throw new Error('ERROR: The device is not reachable.');
    },
  };
  const { ensureIOSBooted } = await import('../src/cli/platforms.ts');
  const away = fixtureDevice({
    platform: 'ios',
    id: 'PHONE',
    name: 'Desk iPhone',
    status: 'unavailable',
    active: false,
    emulator: false,
  });

  await assert.rejects(
    ensureIOSBooted(unreachable, away),
    /Desk iPhone is unavailable: connect and unlock it/,
  );
});

/** An Android SDK home holding a no-op emulator and, optionally, adb. */
function androidHome({ adb }: { adb: boolean }) {
  const home = mkdtempSync(join(tmpdir(), 'kuito-sdk-'));
  const tools = adb ? ['emulator/emulator', 'platform-tools/adb'] : ['emulator/emulator'];

  for (const tool of tools) {
    mkdirSync(join(home, tool, '..'), { recursive: true });
    writeFileSync(join(home, tool), '#!/bin/sh\nexit 0\n');
    chmodSync(join(home, tool), 0o755);
  }

  return home;
}

async function withAndroidHome(home: string, action: () => Promise<void>) {
  const previous = { home: process.env.ANDROID_HOME, root: process.env.ANDROID_SDK_ROOT };

  process.env.ANDROID_HOME = home;
  delete process.env.ANDROID_SDK_ROOT;

  try {
    await action();
  } finally {
    for (const [key, value] of [
      ['ANDROID_HOME', previous.home],
      ['ANDROID_SDK_ROOT', previous.root],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const missingExecutable = (bin: string) =>
  Object.assign(new Error(`spawn ${bin} ENOENT`), { code: 'ENOENT' });

test('adb comes from ANDROID_HOME when it is not on PATH', async () => {
  const home = androidHome({ adb: true });
  const adb = join(home, 'platform-tools', 'adb');
  const bins: string[] = [];
  const r = {
    async run(bin: string, args: readonly string[]) {
      if (bin === 'which' || bin === 'where') throw new Error(`${args[0]} not found`);
      if (bin !== adb) throw missingExecutable(bin);

      bins.push(bin);

      const replies: Partial<Record<string, string>> = {
        'devices -l': 'List of devices attached\nemulator-5554 device model:sdk_gphone64_arm64\n',
        '-s emulator-5554 emu avd name': 'Pixel_9\r\nOK\r\n',
        '-s emulator-5554 shell getprop sys.boot_completed': '1\n',
      };

      return { stdout: replies[args.join(' ')] ?? '', stderr: '' };
    },
  };

  await withAndroidHome(home, async () => {
    const booted = await ensureAndroidBooted(r, fixtureDevice({ id: 'avd:Pixel_9' }), {
      signal: AbortSignal.timeout(1000),
    });

    assert.equal(booted.id, 'emulator-5554');

    const { devices } = await discover(r, { platform: 'android' });

    assert.ok(devices.some((device) => device.id === 'emulator-5554'));
  });

  assert.ok(bins.length > 0);
});

test('a missing adb fails the emulator boot at once with how to install it', async () => {
  const r = {
    async run(bin: string): Promise<{ stdout: string; stderr: string }> {
      throw missingExecutable(bin);
    },
  };

  await withAndroidHome(androidHome({ adb: false }), () =>
    assert.rejects(
      ensureAndroidBooted(r, fixtureDevice({ id: 'avd:Pixel_9' }), {
        signal: AbortSignal.timeout(1000),
      }),
      /adb not found: install Android SDK Platform-Tools or set ANDROID_HOME/,
    ),
  );
});

class FakeServer extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  args: readonly string[] = [];
  env: NodeJS.ProcessEnv | undefined;
  cwd: string | URL | undefined;

  kill = () => {
    this.emit('exit', 0);
  };
}

function fakeServer(lines: [OutputStream, string][]) {
  const fake = new FakeServer();

  const spawnImpl: ServerSpawn = (_bin, args, opts) => {
    fake.args = args;
    fake.env = opts.env;
    fake.cwd = opts.cwd;

    queueMicrotask(() => {
      for (const [stream, line] of lines) fake[stream].write(line + '\n');
    });

    // Stands in for the child process: only its streams, kill and exit are used.
    return fake as never;
  };

  return { fake, spawnImpl };
}

test('Live Patch startup resolves on the ready event and preserves child stdin', async () => {
  const { fake, spawnImpl } = fakeServer([
    ['stdout', JSON.stringify({ type: 'ready', url: 'ws://127.0.0.1:9277' })],
  ]);
  const child = await startLiveServer({
    platform: 'ios',
    entry: 'demo/component-app.tsx',
    port: 9277,
    token: 'T'.repeat(43),
    spawnImpl,
    timeoutMs: 2000,
  });

  assert.strictEqual(child, fake);

  assert.deepEqual(
    fake.args.slice(0, 3),
    [...NODE_TYPESCRIPT, join(ROOT, 'scripts/dev-device.ts')],
    'the server strips Kuito’s types even under node_modules',
  );

  assert.equal(fake.env?.KUITO_PORT, '9277');
  assert.equal(fake.env?.KUITO_DEV_TOKEN, 'T'.repeat(43), 'the server admits only this token');
  assert.ok(!fake.args.some((arg) => arg.includes('T'.repeat(43))), 'and never on argv');
  child.stdout.destroy();
  child.stderr.destroy();
  child.stdin.destroy();
});

test('Live Patch events are forwarded as data; stray output becomes log events', async () => {
  const events: SessionEvent[] = [];
  const { fake, spawnImpl } = fakeServer([
    [
      'stdout',
      JSON.stringify({
        type: 'patched',
        revision: 1,
        ms: 40,
        files: [],
        initial: true,
        delivered: 0,
      }),
    ],
    ['stdout', JSON.stringify({ type: 'ready', url: 'ws://127.0.0.1:9277' })],
    ['stderr', 'hermes: warning'],
  ]);

  await startLiveServer({
    platform: 'ios',
    entry: 'demo/component-app.tsx',
    port: 9277,
    token: 'T'.repeat(43),
    spawnImpl,
    timeoutMs: 2000,
    onEvent: (event) => events.push(event),
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(events, [
    { type: 'patched', revision: 1, ms: 40, files: [], initial: true, delivered: 0 },
    { type: 'ready', url: 'ws://127.0.0.1:9277' },
    { type: 'log', stream: 'stderr', text: 'hermes: warning' },
  ]);

  fake.stdout.destroy();
  fake.stderr.destroy();
  fake.stdin.destroy();
});

test('device query prefers exact id, then exact name, then a unique partial match', () => {
  const devices = [
    { id: 'BOOTED-16', name: 'iPhone 16 Pro' },
    { id: 'NEW-18', name: 'iPhone 18 Pro' },
    { id: 'NEW-18-MAX', name: 'iPhone 18 Pro Max' },
    { id: 'OLD-16', name: 'iPhone 16 Pro' },
  ].map(fixtureDevice);

  assert.equal(resolveDevice(devices, 'iPhone 18 Pro').id, 'NEW-18');
  assert.equal(resolveDevice(devices, 'iphone 16 pro').id, 'BOOTED-16');
  assert.equal(resolveDevice(devices, 'old-16').id, 'OLD-16');
  assert.equal(resolveDevice(devices, 'Max').id, 'NEW-18-MAX');
  assert.throws(() => resolveDevice(devices, '18'), /Ambiguous device '18'/);
  assert.throws(() => resolveDevice(devices, 'Pixel'), /not found/);
});

test('a running emulator is listed once, under its AVD name', async () => {
  const previous = process.env.ANDROID_HOME;

  delete process.env.ANDROID_HOME;
  delete process.env.ANDROID_SDK_ROOT;

  const r = {
    async run(bin: string, args: readonly string[]) {
      if (bin === 'which' || bin === 'where') return { stdout: `/sdk/${args[0]}\n`, stderr: '' };

      if (args.join(' ') === 'devices -l')
        return {
          stdout:
            'List of devices attached\nemulator-5554 device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64\n',
          stderr: '',
        };

      if (args.join(' ') === '-s emulator-5554 emu avd name')
        return { stdout: 'Pixel_3a_API_34\r\nOK\r\n', stderr: '' };

      if (args[0] === '-list-avds')
        return { stdout: 'Pixel_3a_API_34\nPixel_9_API_36\n', stderr: '' };

      return { stdout: '', stderr: '' };
    },
  };

  try {
    const { devices } = await discover(r, { platform: 'android' });

    assert.deepEqual(
      devices.map((d) => [d.id, d.name, d.active]),
      [
        ['emulator-5554', 'Pixel_3a_API_34', true],
        ['avd:Pixel_9_API_36', 'Pixel_9_API_36', false],
      ],
    );
  } finally {
    if (previous) process.env.ANDROID_HOME = previous;
  }
});

function logRunner(lines: string[]) {
  return {
    async run(_bin: string, _args: readonly string[], { onLine }: RunOptions) {
      for (const line of lines) present(onLine, 'onLine')(line, 'stdout');
      return { stdout: '', stderr: '' };
    },
  };
}

test('device logs show app messages only, not the log tool chatter', async () => {
  const shown: string[] = [];

  await streamDeviceLogs(
    logRunner([
      'getpwuid_r did not find a match for uid 501',
      'Filtering the log data using "process == "KuitoIOS""',
      'Timestamp               Ty Process[PID:TID]',
      '2026-10-17 02:23:09.123 Df KuitoIOS[20215:331a1a6] [dev.kuito:live] Connected to ws://127.0.0.1:8765',
    ]),
    fixtureDevice({ platform: 'ios', id: 'SIM' }),
    { onLine: (text) => shown.push(text), signal: new AbortController().signal },
  );

  assert.deepEqual(shown, ['[dev.kuito:live] Connected to ws://127.0.0.1:8765']);
});

test('Android device logs drop logcat buffer separators', async () => {
  const shown: string[] = [];

  await streamDeviceLogs(
    logRunner([
      '--------- beginning of main',
      '10-17 01:46:57.626   890   890 I Kuito  : connected',
    ]),
    fixtureDevice({ platform: 'android', id: 'emulator-5554' }),
    { onLine: (text) => shown.push(text), signal: new AbortController().signal },
  );

  assert.deepEqual(shown, ['Kuito: connected']);
});

test('lines arriving after the log stream is stopped are dropped', async () => {
  const shown: string[] = [];
  const stop = new AbortController();

  stop.abort();

  await streamDeviceLogs(
    logRunner(['Child process terminated with signal 15: Terminated']),
    fixtureDevice({ platform: 'ios', id: 'SIM' }),
    { onLine: (text) => shown.push(text), signal: stop.signal },
  );

  assert.deepEqual(shown, []);
});

test('the Live Patch server is the on-device patch server, run in the project', async () => {
  const { fake, spawnImpl } = fakeServer([
    ['stdout', JSON.stringify({ type: 'ready', url: 'ws://127.0.0.1:9277' })],
  ]);

  await startLiveServer({
    platform: 'ios',
    entry: 'demo/component-app.tsx',
    port: 9277,
    token: 'T'.repeat(43),
    cwd: '/work/my-app',
    spawnImpl,
    timeoutMs: 2000,
  });

  assert.ok(
    fake.args.includes(join(ROOT, 'scripts/dev-device.ts')),
    'it runs the Live Patch server',
  );

  assert.equal(fake.cwd, '/work/my-app', 'the server runs in the project it serves');
  fake.stdout.destroy();
  fake.stderr.destroy();
  fake.stdin.destroy();
});

/** An app with an empty iOS cache. */
function iosProject() {
  const root = mkdtempSync(join(tmpdir(), 'kuito-ios-'));
  const cache = join(root, '.kuito');

  mkdirSync(join(cache, 'ios'), { recursive: true });

  return { root, cache, environment: 'production', config: APP_CONFIG };
}

test(
  'the iOS shell links the Hermes package, put in place before the project is generated',
  { tags: ['macos'] },
  async () => {
    const calls: string[] = [];
    const r = {
      async run(bin: string) {
        calls.push(bin);
        return { stdout: '', stderr: '' };
      },
    };
    const project = iosProject();
    const hermes = async () => {
      calls.push('hermes');
      return '/cache/hermes-ios';
    };

    await buildIOS(r, { project, modules: [], device: null, hermes }).catch(() => {});

    assert.deepEqual(calls, ['hermes', 'xcodegen', 'xcodebuild']);

    const spec = JSON.parse(readFileSync(join(project.cache, 'ios/project.json'), 'utf8'));

    assert.deepEqual(spec.packages, { HermesEngine: { path: '/cache/hermes-ios' } });
  },
);

const node = (script: string) => [process.execPath, ['-e', script]] as const;

/** Resolves once `pid` no longer exists, or rejects at the deadline. */
async function gone(pid: number, deadlineMs = 5000) {
  const deadline = Date.now() + deadlineMs;

  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }

    if (Date.now() > deadline) throw new Error(`process ${pid} is still running`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

test('a command reads what it is given on stdin', async () => {
  const [bin, args] = node('process.stdin.pipe(process.stdout)');

  assert.equal((await createRunner().run(bin, args, { input: 'link' })).stdout, 'link');
});

test('a failed command reports both of its streams', async () => {
  const [bin, args] = node(
    "console.log('built 3 of 4'); console.error('linker failed'); process.exit(3)",
  );

  await assert.rejects(createRunner().run(bin, args), (error: CommandError) => {
    assert.ok(error instanceof CommandError);
    assert.equal(error.code, 3);
    assert.match(error.stdout, /built 3 of 4/);
    assert.match(error.stderr, /linker failed/);
    assert.match(error.message, /linker failed/);
    assert.match(error.message, /built 3 of 4/);

    return true;
  });
});

test('a command past its timeout is terminated, then killed if it ignores SIGTERM', async () => {
  const [bin, args] = node(
    "process.on('SIGTERM', () => {}); console.log('started'); setInterval(() => {}, 1000)",
  );

  await assert.rejects(
    createRunner({ graceMs: 100 }).run(bin, args, { timeoutMs: 300 }),
    (error: CommandError) => {
      assert.equal(error.code, 'SIGKILL');
      assert.match(error.message, /timed out after 0\.3s/);

      return true;
    },
  );
});

test('terminate() escalates to SIGKILL and resolves once the process is gone', async () => {
  const child = spawn(process.execPath, [
    '-e',
    "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)",
  ]);

  // Signalled before the handler is installed, Node would die of the SIGTERM.
  await new Promise((resolve) => child.stdout.once('data', resolve));
  await terminate(child, { graceMs: 100 });
  assert.equal(child.signalCode, 'SIGKILL');
});

/** An Android SDK whose emulator runs `script`. */
function emulatorHome(script: string) {
  const home = androidHome({ adb: true });

  writeFileSync(join(home, 'emulator/emulator'), `#!/bin/sh\n${script}\n`);

  return home;
}

const noDevices = {
  async run() {
    return { stdout: 'List of devices attached\n', stderr: '' };
  },
};

test('an emulator that fails to start fails the boot at once, with what it printed', async () => {
  const home = emulatorHome('echo "PANIC: Missing emulator engine program for arm64" >&2\nexit 1');

  await withAndroidHome(home, () =>
    assert.rejects(
      ensureAndroidBooted(noDevices, fixtureDevice({ id: 'avd:Pixel_9' }), {
        signal: AbortSignal.timeout(10_000),
      }),
      /Pixel_9[\s\S]*PANIC: Missing emulator engine program/,
    ),
  );
});

test('a boot that is cancelled stops the emulator it started', async () => {
  const pidFile = join(mkdtempSync(join(tmpdir(), 'kuito-emulator-')), 'pid');
  const home = emulatorHome(`echo $$ > ${pidFile}\ntrap '' TERM\nwhile true; do sleep 1; done`);

  await withAndroidHome(home, () =>
    assert.rejects(
      ensureAndroidBooted(noDevices, fixtureDevice({ id: 'avd:Pixel_9' }), {
        signal: AbortSignal.timeout(500),
      }),
    ),
  );

  await gone(Number(readFileSync(pidFile, 'utf8')));
});

/** Answers `which` for `tools`, and the version commands with `versions`. */
function toolRunner(tools: string[], versions: { java: string; gradle: string }) {
  return {
    async run(bin: string, args: readonly string[] = []) {
      if (bin === 'which' && tools.includes(args[0] ?? '')) return { stdout: '', stderr: '' };

      if (bin.endsWith('java') && args[0] === '-version')
        return { stdout: '', stderr: versions.java };

      if (bin.endsWith('gradle') && args[0] === '--version')
        return { stdout: versions.gradle, stderr: '' };

      throw Object.assign(new Error(`${bin} ENOENT`), { code: 'ENOENT' });
    },
  };
}

async function doctorChecks(runner: ReturnType<typeof toolRunner>) {
  const lines: string[] = [];
  const previous = process.env.JAVA_HOME;

  delete process.env.JAVA_HOME;

  try {
    await withAndroidHome(androidHome({ adb: true }), () =>
      main(['doctor', '--json'], { runner, out: (line) => lines.push(line) }),
    );
  } finally {
    if (previous !== undefined) process.env.JAVA_HOME = previous;
  }

  const { checks }: { checks: { name: string; ok: boolean; fix: string }[] } = JSON.parse(
    lines.join('\n'),
  );

  return new Map(checks.map((check) => [check.name, check]));
}

test('kuito doctor checks the JDK and Gradle versions the Android build needs', async () => {
  const checks = await doctorChecks(
    toolRunner(['java', 'gradle', 'xcodegen', 'xcodebuild'], {
      java: 'openjdk version "17.0.12" 2024-07-16',
      gradle: '\n------------------------------------------------------------\nGradle 9.1.0\n',
    }),
  );

  assert.deepEqual(present(checks.get('JDK 21'), 'JDK check'), {
    name: 'JDK 21',
    ok: false,
    fix: 'Found JDK 17. Install JDK 21 and point JAVA_HOME at it',
  });

  assert.deepEqual(present(checks.get('Gradle 8'), 'Gradle check'), {
    name: 'Gradle 8',
    ok: false,
    fix: 'Found Gradle 9. Install Gradle 8 (brew install gradle@8) and put it first on PATH',
  });
});

test('kuito doctor passes a host with what the build needs, and asks for nothing else', async () => {
  const checks = await doctorChecks(
    toolRunner(['java', 'gradle', 'xcodegen', 'xcodebuild'], {
      java: 'openjdk version "21.0.4" 2024-07-16 LTS',
      gradle: 'Gradle 8.14.3\n',
    }),
  );

  assert.equal(checks.get('JDK 21')?.ok, true);
  assert.equal(checks.get('Gradle 8')?.ok, true);
  assert.equal(checks.get('Android SDK (adb)')?.ok, true);
  assert.equal(checks.get('XcodeGen')?.ok, true);

  assert.ok(
    ![...checks.keys()].some((name) => /hermes|cocoapods/i.test(name)),
    [...checks.keys()].join(', '),
  );
});

test('help lists every option and every shortcut the session answers', () => {
  for (const shortcut of SHORTCUTS)
    assert.match(HELP, new RegExp(`\\n\\s+${escape(shortcut.key)} ${shortcut.label}\\s`));

  for (const flag of [
    '--platform',
    '--device',
    '--entry',
    '--env',
    '--port',
    '--no-launch',
    '--no-install',
    '--verbose',
    '--json',
    '--help',
  ])
    assert.ok(HELP.includes(flag), flag);
});

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the app CLI has no replay command: recordings replay headlessly', () => {
  assert.throws(() => parseArgs(['replay', 'scroll.krec', 'ios']), /Unknown argument: replay/);
  assert.ok(!/\breplay\b/.test(HELP), 'kuito help lists no replay');
});
