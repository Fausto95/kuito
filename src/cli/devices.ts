import { existsSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { join } from 'node:path';
import { hasTool, isMissingExecutable, toError } from './runner.ts';
import type { Runner, RunOptions } from './runner.ts';
import type { Platform } from './config.ts';

export interface Device {
  platform: Platform;
  id: string;
  name: string;
  status: string;
  active: boolean;
  label: string;
  detail: string;
  /** A virtual device: an Android emulator or an iOS Simulator. */
  emulator?: boolean;
  runtime?: string;
  version?: number[];
  /** A paired iPhone's way back to this Mac: the Mac's address on its CoreDevice tunnel. */
  tunnel?: string;
}

interface IOSDevice extends Device {
  platform: 'ios';
  emulator: true;
  runtime: string;
  version: number[];
}

/** An iPhone or iPad CoreDevice knows: paired, connected or not. */
interface PhysicalIOSDevice extends Device {
  platform: 'ios';
  emulator: false;
  version: number[];
}

interface AndroidDevice extends Device {
  platform: 'android';
  emulator: boolean;
}

interface SimctlDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable?: boolean;
  availability?: string;
}

/** `xcrun simctl list devices --json`, keyed by runtime identifier. */
interface SimctlList {
  devices?: Record<string, SimctlDevice[]>;
}

export interface DiscoverOptions {
  platform?: Platform | null;
  /**
   * Also lists iPhones and iPads, after the simulators. A dev session leaves
   * them out: it installs and launches through simctl.
   */
  physicalIOS?: boolean;
}

interface Discovery {
  devices: Device[];
  diagnostics: string[];
}

// 'com.apple.CoreSimulator.SimRuntime.iOS-26-10' -> { os: 'iOS', version: [26, 10] }
function parseRuntime(runtime: string) {
  const [os, ...version] = runtime.replace('com.apple.CoreSimulator.SimRuntime.', '').split('-');

  return { os, version: version.map(Number) };
}

function compareVersionsDesc(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (b[i] ?? 0) - (a[i] ?? 0);

    if (delta) return delta;
  }

  return 0;
}

/** simctl keys runtimes in arbitrary order; list booted targets first, then newest runtimes. */
export function parseIOSDevices(json: string): IOSDevice[] {
  const value: SimctlList = JSON.parse(json);

  return Object.entries(value.devices ?? {})
    .flatMap(([runtime, devices]) => {
      const { os, version } = parseRuntime(runtime);

      return devices
        .filter((d) => d.isAvailable !== false && d.availability !== '(unavailable)')
        .map((d): IOSDevice => ({
          platform: 'ios',
          emulator: true,
          id: d.udid,
          name: d.name,
          runtime,
          version,
          status: d.state,
          active: d.state === 'Booted',
          label: `${d.name}  ${d.state === 'Booted' ? '●' : '○'}`,
          detail: `${os} ${version.join('.')}`,
        }));
    })
    .sort(
      (a, b) => Number(b.active) - Number(a.active) || compareVersionsDesc(a.version, b.version),
    );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const record = (value: unknown) => (isRecord(value) ? value : {});

const text = (value: unknown) => (typeof value === 'string' ? value : null);

/**
 * `xcrun devicectl list devices --json-output -`. CoreDevice lists simulators
 * and every Apple platform too; this keeps physical iOS devices, read from
 * the `properties` dictionary that replaces its deprecated fields, connected
 * ones first. Their id is the UDID, which xcodebuild destinations take.
 */
export function parsePhysicalIOSDevices(json: string): PhysicalIOSDevice[] {
  const devices = record(record(JSON.parse(json)).result).devices;

  if (!Array.isArray(devices)) throw new Error('devicectl listed no result.devices');

  return devices
    .flatMap((entry): PhysicalIOSDevice[] => {
      const { connection, hardware, software, state } = record(record(entry).properties);
      const { reality, platform, udid, marketingName } = record(hardware);
      const name = text(record(state).name);
      const status = text(record(connection).state) ?? 'unknown';
      const os = text(record(record(software).osVersionNumber).stringValue) ?? '';
      const id = text(udid);

      if (reality !== 'physical' || platform !== 'iOS' || !id || !name) return [];

      const active = status === 'connected';
      const model = text(marketingName);

      return [
        {
          platform: 'ios',
          emulator: false,
          id,
          name,
          status,
          active,
          version: os.split('.').map(Number),
          label: `${name}  ${active ? '●' : '○'}`,
          detail: [`iOS ${os}`, model].filter(Boolean).join(' · '),
        },
      ];
    })
    .sort((a, b) => Number(b.active) - Number(a.active));
}

/** The phone's side of its CoreDevice tunnel, from `xcrun devicectl device info details`. */
export function parseTunnelAddress(json: string): string {
  const { connection } = record(record(record(JSON.parse(json)).result).properties);
  const address = text(record(connection).tunnelIPAddressString);

  if (!address) throw new Error('devicectl reported no CoreDevice tunnel for the phone');

  return address;
}

// CoreDevice gives each phone a point-to-point /64: the phone is ::1, the Mac ::2.
const TUNNEL_PREFIX = 64;
const UNIQUE_LOCAL = new BlockList();

UNIQUE_LOCAL.addSubnet('fc00::', 7, 'ipv6');

/**
 * This Mac's address on the tunnel whose phone side is `phone`: the one
 * address in its /64 on a utun interface. CoreDevice's tunnels use unique
 * local addresses, and a Wi-Fi interface in the same range is not one.
 */
export function hostOnTunnel(
  phone: string,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string {
  if (isIP(phone) !== 6 || !UNIQUE_LOCAL.check(phone, 'ipv6'))
    throw new Error(`${phone} is not a CoreDevice tunnel address: re-pair the phone in Xcode`);

  const subnet = new BlockList();

  subnet.addSubnet(phone, TUNNEL_PREFIX, 'ipv6');

  const hosts = Object.entries(interfaces)
    .filter(([name]) => name.startsWith('utun'))
    .flatMap(([, addresses]) => addresses ?? [])
    .filter(
      ({ family, address }) =>
        family === 'IPv6' && address !== phone && subnet.check(address, 'ipv6'),
    );

  if (hosts.length > 1)
    throw new Error(
      `${hosts.length} local addresses share the phone's tunnel ${phone}: disconnect the other device on it`,
    );

  const [host] = hosts;

  if (!host)
    throw new Error(
      `No tunnel interface reaches the phone's tunnel ${phone}: unlock the phone and keep it on this Mac's network or cable.`,
    );

  return host.address;
}

/** Every typed word must appear in the device name or its runtime/detail. */
export function filterDevices<D extends Device>(devices: readonly D[], query: string): D[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  return devices.filter((device) => {
    const text = `${device.name} ${device.detail ?? ''}`.toLowerCase();

    return words.every((word) => text.includes(word));
  });
}

/**
 * Exact id, then exact name, then unique partial name. Duplicate exact names
 * (one simulator per runtime) resolve to the first in discovery order:
 * booted, else newest runtime.
 */
export function resolveDevice<D extends Device>(devices: readonly D[], query: string): D {
  const q = query.toLowerCase();
  const byId = devices.find((device) => device.id.toLowerCase() === q);

  if (byId) return byId;

  const byName = devices.find((device) => device.name.toLowerCase() === q);

  if (byName) return byName;

  const matches = devices.filter((device) => device.name.toLowerCase().includes(q));

  if (matches.length === 1) return matches[0];

  if (!matches.length)
    throw new Error(`Device '${query}' not found. Run kuito devices for available targets.`);

  throw new Error(
    `Ambiguous device '${query}': ${matches.map((d) => d.name).join(', ')}. Specify --device with its full ID.`,
  );
}

export function parseAndroidDevices(raw: string): AndroidDevice[] {
  return raw
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): AndroidDevice | null => {
      const [id, status, ...rest] = line.split(/\s+/);

      if (status !== 'device') return null;

      // Avoid offline/unauthorized targets.
      const model =
        rest
          .find((item) => item.startsWith('model:'))
          ?.slice(6)
          ?.replaceAll('_', ' ') || id;

      return {
        platform: 'android',
        id,
        name: model,
        status,
        active: true,
        emulator: id.startsWith('emulator-'),
        label: `${model}  ●`,
        detail: id,
      };
    })
    .filter((device) => device !== null);
}

export async function discover(
  runner: Runner,
  { platform, physicalIOS = false }: DiscoverOptions = {},
): Promise<Discovery> {
  const result: Discovery = { devices: [], diagnostics: [] };

  if ((!platform || platform === 'ios') && process.platform === 'darwin') {
    try {
      const ios = await runner.run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
        timeoutMs: 15000,
      });

      result.devices.push(...parseIOSDevices(ios.stdout));
    } catch (error) {
      result.diagnostics.push(`iOS discovery: ${toError(error).message}`);
    }

    if (physicalIOS)
      try {
        const phones = await runner.run(
          'xcrun',
          ['devicectl', 'list', 'devices', '--json-output', '-', '--quiet'],
          { timeoutMs: 15000 },
        );

        result.devices.push(...parsePhysicalIOSDevices(phones.stdout));
      } catch (error) {
        result.diagnostics.push(`iOS device discovery: ${toError(error).message}`);
      }
  }

  if (!platform || platform === 'android') {
    if (await hasAdb(runner)) {
      try {
        const adb = await runAdb(runner, ['devices', '-l'], { timeoutMs: 15000 });

        for (const device of parseAndroidDevices(adb.stdout)) {
          // Name running emulators by AVD, the same key `emulator -list-avds` uses below.
          const avd = device.emulator && (await avdName(runner, device.id));

          result.devices.push(avd ? { ...device, name: avd, label: `${avd}  ●` } : device);
        }
      } catch (error) {
        result.diagnostics.push(`Android discovery: ${toError(error).message}`);
      }
    } else result.diagnostics.push('Android SDK platform-tools (adb) missing');

    const emulator = await findEmulator(runner);

    if (emulator) {
      try {
        const avds = await runner.run(emulator, ['-list-avds'], { timeoutMs: 15000 });
        const running = new Set(
          result.devices.filter((d) => d.platform === 'android' && d.emulator).map((d) => d.name),
        );

        for (const name of avds.stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)) {
          if (!running.has(name))
            result.devices.push({
              platform: 'android',
              id: `avd:${name}`,
              name,
              status: 'Stopped',
              active: false,
              emulator: true,
              label: `${name}  ○`,
              detail: 'Android Virtual Device',
            });
        }
      } catch (error) {
        result.diagnostics.push(`AVD discovery: ${toError(error).message}`);
      }
    }
  }

  return result;
}

async function avdName(runner: Runner, id: string) {
  try {
    const { stdout } = await runAdb(runner, ['-s', id, 'emu', 'avd', 'name'], {
      timeoutMs: 8000,
    });

    return stdout.trim().split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  } // Console unavailable: keep the model name.
}

/** A tool inside the Android SDK, when ANDROID_HOME or ANDROID_SDK_ROOT has it. */
function sdkTool(folder: string, name: string): string | null {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

  if (!sdk) return null;

  const path = join(sdk, folder, process.platform === 'win32' ? `${name}.exe` : name);

  return existsSync(path) ? path : null;
}

export async function findEmulator(runner: Runner): Promise<string | null> {
  return (
    sdkTool('emulator', 'emulator') ?? ((await hasTool(runner, 'emulator')) ? 'emulator' : null)
  );
}

/** The SDK's adb, else the one on PATH. */
export const adbPath = () => sdkTool('platform-tools', 'adb') ?? 'adb';

export async function hasAdb(runner: Runner) {
  return sdkTool('platform-tools', 'adb') !== null || hasTool(runner, 'adb');
}

/** Runs adb; when there is none, the error says how to get it and keeps its ENOENT code. */
export function runAdb(runner: Runner, args: readonly string[], options?: RunOptions) {
  return runner.run(adbPath(), args, options).catch((error: unknown) => {
    throw isMissingExecutable(error)
      ? Object.assign(
          new Error('adb not found: install Android SDK Platform-Tools or set ANDROID_HOME'),
          { code: 'ENOENT' },
        )
      : error;
  });
}
