import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  adbPath,
  findEmulator,
  hostOnTunnel,
  parseAndroidDevices,
  parseTunnelAddress,
  runAdb,
} from './devices.ts';
import { parseLaunchPid, summarizeAndroidCrash, summarizeCrashReport } from './crash.ts';
import { isAbortError, isMissingExecutable, terminate } from './runner.ts';
import type { Crash } from './crash.ts';
import type { Device } from './devices.ts';
import { ROOT } from './config.ts';
import { writeAppIcon } from './app-icons.ts';
import { hermesPackage } from './hermes-ios.ts';
import {
  androidGenerated,
  androidManifest,
  androidThemes,
  androidProperties,
  iosProjectSpec,
  linkSource,
} from './shells.ts';
import { shellUpdateSettings, UPDATE_SETTINGS_FILE } from './updates.ts';
import type { NativeModuleSource, ShellLink } from './modules.ts';
import { catalogOf } from '../dev/modules/catalog.ts';
import { FONT_DIRECTORY, writeFonts } from './fonts.ts';
import { IMAGE_CATALOG, IMAGE_RESOURCES, writeImages } from './bundled-images.ts';
import type { BundledAsset } from '../dev/assets.ts';
import { writeSplashScreen } from './splash-screens.ts';
import type { Platform, Profile } from './config.ts';
import { CONFIG_FILE, type Project } from './project.ts';
import {
  appStoreConnectKey,
  exportOptions,
  storeUploadKey,
  uploadKey,
  uploadKeyProperties,
  type Environment,
  type UploadKey,
} from './signing.ts';
import type { LineHandler, Runner } from './runner.ts';

interface BuildOptions {
  project: Project;
  /** The native modules the shell compiles in (src/cli/modules.ts). */
  modules: readonly NativeModuleSource[];
  /** The module functions its link table holds; none by default. */
  link?: ShellLink;
  /** The images the app imports (src/cli/bundled-images.ts). */
  assets?: readonly BundledAsset[];
  device?: Device | null;
  onLine?: LineHandler | null;
  /** What generating the shell had to fix, such as a flattened icon. */
  onWarning?: (message: string) => void;
  signal?: AbortSignal;
  /** `debug` unless the build is for release (src/cli/config.ts). */
  profile?: Profile;
  /** The profile's Hermes Swift package directory, put in place first (src/cli/hermes-ios.ts). */
  hermes?: (profile: Profile) => Promise<string>;
  /** Where signing credentials come from (src/cli/signing.ts); this process's by default. */
  environment?: Environment;
}

export interface SignalOptions {
  signal?: AbortSignal;
}

export interface LaunchOptions extends SignalOptions {
  device: Device;
  /** The bundle id or applicationId the app's config gives its shell. */
  appId: string;
  port?: number;
  /** The session token the app sends the dev server (src/dev/dev-auth.ts). */
  token: string;
}

export interface Launched {
  label: string;
  pid: number | null;
}

type WatchResult = Promise<Crash | null | undefined>;

export interface LogOptions extends SignalOptions {
  onLine: (text: string) => void;
}

export interface WatchOptions extends SignalOptions {
  runner: Runner;
  device: Device;
  appId: string;
  pid: number;
  since?: number;
}

export const ANDROID_ACTIVITY = 'dev.kuito.runtime.KuitoActivity';

/**
 * The database migrations, as each shell's Storage module reads them from
 * its bundle when it first opens the database (docs/storage.md#migrations).
 */
const MIGRATIONS_FILE = 'kuito-migrations.json';

const migrationsJson = ({ migrations }: Project['config']) => JSON.stringify(migrations, null, 2);

/** Leaves an unchanged file untouched, so Xcode and Gradle stay incremental. */
async function writeGenerated(file: string, contents: string) {
  if (existsSync(file) && (await readFile(file, 'utf8')) === contents) return;

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents);
}

/**
 * Removes every file under `directory` but `kept`: the shell projects
 * compile whatever their generated folder holds, so a file an older build
 * wrote must not outlive it.
 */
async function pruneGenerated(directory: string, kept: readonly string[]) {
  if (!existsSync(directory)) return;

  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true }))
    if (entry.isFile() && !kept.includes(join(entry.parentPath, entry.name)))
      await rm(join(entry.parentPath, entry.name));
}

/**
 * What a release shell reads to check its updates (docs/updates.md); a
 * shell that takes none carries no file, not an empty one.
 */
async function writeUpdateSettings(
  directory: string,
  options: Parameters<typeof shellUpdateSettings>[0],
) {
  const settings = await shellUpdateSettings(options);
  const file = join(directory, UPDATE_SETTINGS_FILE);

  if (settings === null) await rm(file, { force: true });
  else await writeGenerated(file, settings);
}

const NO_LINK: ShellLink = { catalog: catalogOf([]), ids: [] };

/** Each profile's Xcode configuration. */
const XCODE_CONFIGURATIONS: Record<Profile, string> = { debug: 'Debug', release: 'Release' };

/**
 * What a build makes: an app to install, of its profile, or without a
 * device, in release, what the stores take.
 */
type Artifact = Profile | 'store';

const artifactOf = (device: Device | null | undefined, profile: Profile): Artifact =>
  profile === 'release' && !device ? 'store' : profile;

/** The Gradle task making each artifact, and where it lands under the build directory. */
const ANDROID_ARTIFACTS: Record<Artifact, { task: string; output: string }> = {
  debug: { task: ':app:assembleDebug', output: 'outputs/apk/debug/app-debug.apk' },
  release: { task: ':app:assembleRelease', output: 'outputs/apk/release/app-release.apk' },
  store: { task: ':app:bundleRelease', output: 'outputs/bundle/release/app-release.aab' },
};

/**
 * Whether the shell compiles the frame path's shared C++ (layout, gestures, the
 * UI runtime, the view table) at the build's own level, to step through it in a
 * debugger, rather than at -O2 (docs/performance.md#native-optimization).
 */
export const nativeDebug = (environment: Environment) => environment.KUITO_NATIVE_DEBUG === '1';

/** The upload key each artifact signs with: a store build cannot do without one. */
const UPLOAD_KEYS: Record<Artifact, (project: Project, env: Environment) => UploadKey | null> = {
  debug: () => null,
  release: uploadKey,
  store: storeUploadKey,
};

/**
 * What an iOS build runs on: a simulator, or a phone. Simulator builds are
 * signed ad hoc ("Sign to Run Locally"): no team needed, and the signature
 * gives the app the Keychain access an unsigned simulator build lacks. A
 * phone takes automatic signing with the app's team, which may have to
 * fetch or create a provisioning profile.
 */
interface IOSTarget {
  sdk: string;
  destination: (device: Device | null) => string;
  signing: readonly string[];
  /** Signing needs the app's `ios.teamId`. */
  team: boolean;
}

const IOS_TARGETS: Record<'simulator' | 'phone', IOSTarget> = {
  simulator: {
    sdk: 'iphonesimulator',
    destination: (device) =>
      device ? `platform=iOS Simulator,id=${device.id}` : 'generic/platform=iOS Simulator',
    signing: ['CODE_SIGN_IDENTITY=-'],
    team: false,
  },
  phone: {
    sdk: 'iphoneos',
    destination: (device) => (device ? `id=${device.id}` : 'generic/platform=iOS'),
    signing: ['-allowProvisioningUpdates'],
    team: true,
  },
};

/** Without a device, a debug build is for a simulator and a store build for phones. */
const DEFAULT_TARGETS: Record<Artifact, keyof typeof IOS_TARGETS> = {
  debug: 'simulator',
  release: 'phone',
  store: 'phone',
};

// Only a device discovery marks as physical is a phone.
const iosTarget = (device: Device | null | undefined, artifact: Artifact) =>
  IOS_TARGETS[
    device ? (device.emulator === false ? 'phone' : 'simulator') : DEFAULT_TARGETS[artifact]
  ];

/** Generates the app's iOS shell into its `.kuito/ios` (src/cli/shells.ts) and builds it there. */
export async function buildIOS(
  runner: Runner,
  {
    project,
    modules,
    link = NO_LINK,
    assets = [],
    device,
    onLine,
    onWarning,
    signal,
    profile = 'debug',
    hermes = hermesPackage,
    environment = process.env,
  }: BuildOptions,
) {
  if (process.platform !== 'darwin')
    throw new Error('iOS builds require macOS with Xcode installed.');

  const artifact = artifactOf(device, profile);
  const target = iosTarget(device, artifact);
  const { teamId } = project.config.ios;

  if (target.team && !teamId)
    throw new Error(
      `Building for an iPhone needs a team to sign with: set ios.teamId in ${join(project.root, CONFIG_FILE)} ` +
        'to your Apple Developer Team ID (Xcode > Settings > Accounts), or pass --device with a simulator.',
    );

  const authentication = target.team ? appStoreConnectKey(environment, project.root) : [];
  const dir = join(project.cache, 'ios');
  const configuration = XCODE_CONFIGURATIONS[profile];

  const spec = iosProjectSpec(
    project.config,
    ROOT,
    modules,
    await hermes(profile),
    assets.length > 0,
    profile,
    nativeDebug(environment),
  );

  await mkdir(join(dir, 'Resources'), { recursive: true });
  await mkdir(join(dir, 'Modules'), { recursive: true });
  await writeGenerated(join(dir, 'project.json'), spec);

  await pruneGenerated(join(dir, 'Generated'), [join(dir, 'Generated/KuitoLink.swift')]);

  await writeGenerated(join(dir, 'Generated/KuitoLink.swift'), linkSource('ios', modules, link));

  for (const warning of await writeAppIcon('ios', project.config, join(dir, 'AppIcon.xcassets')))
    onWarning?.(warning);

  await writeFonts(project.config, join(dir, FONT_DIRECTORY));
  await writeGenerated(join(dir, 'Resources', MIGRATIONS_FILE), migrationsJson(project.config));

  await writeUpdateSettings(join(dir, 'Resources'), {
    project,
    platform: 'ios',
    modules,
    link,
    assets,
    profile,
  });

  await writeImages('ios', assets, project.root, join(dir, IMAGE_CATALOG));

  for (const warning of await writeSplashScreen('ios', project.config, join(dir, 'Splash')))
    onWarning?.(warning);

  await runner.run('xcodegen', ['generate', '--spec', 'project.json'], { cwd: dir, signal });

  const derived = join(project.cache, 'build/ios');
  const shared = [
    '-project',
    join(dir, 'KuitoIOS.xcodeproj'),
    '-scheme',
    'KuitoIOS',
    '-configuration',
    configuration,
    '-sdk',
    target.sdk,
    '-destination',
    target.destination(device ?? null),
    '-derivedDataPath',
    derived,
    ...target.signing,
    ...authentication,
  ];
  const xcodebuild = (args: readonly string[]) =>
    runner.run('xcodebuild', args, {
      cwd: dir,
      quiet: !onLine,
      onLine,
      signal,
      timeoutMs: 600_000,
    });

  if (artifact === 'store') {
    const archive = join(derived, 'KuitoIOS.xcarchive');
    const exported = join(derived, 'export');
    const options = join(derived, 'ExportOptions.plist');

    await xcodebuild([...shared, '-archivePath', archive, 'archive']);
    await writeGenerated(options, exportOptions(teamId ?? ''));
    await rm(exported, { recursive: true, force: true });

    await xcodebuild([
      '-exportArchive',
      '-archivePath',
      archive,
      '-exportPath',
      exported,
      '-exportOptionsPlist',
      options,
      ...target.signing,
      ...authentication,
    ]);

    const ipa = join(exported, 'KuitoIOS.ipa');

    if (!existsSync(ipa)) throw new Error(`Export finished but no .ipa exists at ${ipa}`);

    return ipa;
  }

  await xcodebuild([...shared, 'build']);

  const app = join(derived, `Build/Products/${configuration}-${target.sdk}/KuitoIOS.app`);

  if (!existsSync(app)) throw new Error(`Build finished but no .app exists at ${app}`);

  return app;
}

/** Builds the framework's Android project, configured for the app, into its `.kuito/android`. */
export async function buildAndroid(
  runner: Runner,
  {
    project,
    modules,
    link = NO_LINK,
    assets = [],
    onLine,
    device,
    onWarning,
    signal,
    profile = 'debug',
    environment = process.env,
  }: BuildOptions,
) {
  // The release variant shrinks with R8 and signs with the upload key, or
  // without one the debug keystore (native/android/app/build.gradle.kts).
  const artifact = artifactOf(device, profile);
  const { task, output } = ANDROID_ARTIFACTS[artifact];
  const key = UPLOAD_KEYS[artifact](project, environment);
  const dir = join(ROOT, 'native/android');
  const wrapper = join(dir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const cache = join(project.cache, 'android');
  const generated = androidGenerated(project.cache);

  await pruneGenerated(generated.sources, [generated.link]);

  await writeGenerated(generated.link, linkSource('android', modules, link));

  await writeGenerated(generated.manifest, androidManifest(project.config, modules));

  for (const [file, contents] of Object.entries(androidThemes(project.config, modules)))
    await writeGenerated(join(generated.settings, file), contents);

  for (const warning of await writeAppIcon('android', project.config, join(cache, 'res')))
    onWarning?.(warning);

  await writeFonts(project.config, join(cache, 'assets', FONT_DIRECTORY));
  await writeGenerated(join(cache, 'assets', MIGRATIONS_FILE), migrationsJson(project.config));

  await writeUpdateSettings(join(cache, 'assets'), {
    project,
    platform: 'android',
    modules,
    link,
    assets,
    profile,
  });

  await writeImages('android', assets, project.root, join(cache, IMAGE_RESOURCES));

  for (const warning of await writeSplashScreen('android', project.config, join(cache, 'splash')))
    onWarning?.(warning);

  await runner.run(
    existsSync(wrapper) ? wrapper : 'gradle',
    [
      '-p',
      dir,
      task,
      '--no-daemon',
      '--project-cache-dir',
      join(cache, '.gradle'),
      ...androidProperties(project, modules, assets.length > 0, nativeDebug(environment)),
      ...uploadKeyProperties(key),
    ],
    {
      cwd: dir,
      // The key's passwords, which Gradle reads from its environment.
      env: environment,
      quiet: !onLine,
      onLine,
      signal,
      timeoutMs: 600_000,
    },
  );

  const built = join(cache, 'build/app', output);

  if (!existsSync(built)) throw new Error(`Build finished but nothing exists at ${built}`);

  return built;
}

export async function ensureIOSBooted(
  runner: Runner,
  device: Device,
  { signal }: SignalOptions = {},
): Promise<Device> {
  // Nothing here can boot a phone; a paired one must be connected to build for it.
  // devicectl lists a Wi-Fi phone as disconnected while its CoreDevice tunnel is
  // idle, and any request to the phone brings the tunnel up.
  if (device.emulator === false) {
    if (device.active) return device;

    try {
      await runner.run('xcrun', ['devicectl', 'device', 'info', 'details', '--device', device.id], {
        signal,
        quiet: true,
        timeoutMs: 60_000,
      });
    } catch {
      throw new Error(
        `${device.name} is ${device.status}: connect and unlock it, or pick another device from kuito devices.`,
      );
    }

    return { ...device, status: 'connected', active: true };
  }

  if (!device.active)
    await runner.run('xcrun', ['simctl', 'boot', device.id], { signal, timeoutMs: 60_000 });

  await runner.run('xcrun', ['simctl', 'bootstatus', device.id, '-b'], {
    signal,
    timeoutMs: 180_000,
  });

  return device;
}

export async function ensureAndroidBooted(
  runner: Runner,
  device: Device,
  { signal }: SignalOptions = {},
): Promise<Device> {
  if (!device.id.startsWith('avd:')) return device;

  const emulator = await findEmulator(runner);

  if (!emulator)
    throw new Error('Android emulator executable missing. Install Android SDK Emulator.');

  const avd = device.id.slice(4);
  const started = startEmulator(emulator, avd);

  try {
    const booted = await waitForAvd(runner, avd, started.failed, signal);

    // Booted, it outlives this command, as an emulator started by hand would.
    started.child.unref();

    return booted;
  } catch (error) {
    await terminate(started.child, { group: true });
    throw error;
  }
}

/**
 * Starts the emulator in its own process group, writing to a log file rather
 * than to pipes it would outlive. `failed` rejects, with the end of that log,
 * if it exits unsuccessfully.
 */
function startEmulator(emulator: string, avd: string) {
  const log = join(tmpdir(), `kuito-emulator-${avd}.log`);
  const output = openSync(log, 'w');
  const child = spawn(emulator, ['-avd', avd], {
    detached: true,
    stdio: ['ignore', output, output],
  });

  closeSync(output);

  const failed = new Promise<never>((_, reject) => {
    child.once('error', reject);

    child.once('exit', (code, signal) => {
      if (code === 0) return;

      const printed = readFileSync(log, 'utf8').trim().slice(-2400);

      reject(
        new Error(
          `The Android emulator for ${avd} exited (${code ?? signal}) before it booted` +
            (printed ? `:\n${printed}` : `; its log is ${log}`),
        ),
      );
    });
  });

  // Nothing awaits it once the boot settles.
  failed.catch(() => {});

  return { child, failed };
}

async function waitForAvd(
  runner: Runner,
  avd: string,
  failed: Promise<never>,
  signal: AbortSignal | undefined,
): Promise<Device> {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Emulator launch cancelled');

    try {
      const raw = (await runAdb(runner, ['devices', '-l'], { timeoutMs: 8000 })).stdout;

      for (const running of parseAndroidDevices(raw).filter((d) => d.emulator)) {
        const name = (
          await runAdb(runner, ['-s', running.id, 'emu', 'avd', 'name'], { timeoutMs: 8000 })
        ).stdout
          .trim()
          .split(/\r?\n/)[0];

        if (name === avd) {
          const ready = (
            await runAdb(runner, ['-s', running.id, 'shell', 'getprop', 'sys.boot_completed'], {
              timeoutMs: 8000,
            })
          ).stdout.trim();

          if (ready === '1') return { ...running, name: avd };
        }
      }
    } catch (error) {
      // Anything else means the AVD is still booting.
      if (isMissingExecutable(error)) throw error;
    }

    await Promise.race([sleep(2000, undefined, { signal }), failed]);
  }

  throw new Error(`Timed out booting Android virtual device ${avd}`);
}

/** This Mac's address on a paired iPhone's CoreDevice tunnel, which the phone dials back. */
export async function phoneLinkAddress(
  runner: Runner,
  device: Device,
  { signal, interfaces }: SignalOptions & { interfaces?: Parameters<typeof hostOnTunnel>[1] } = {},
) {
  const { stdout } = await runner.run(
    'xcrun',
    [
      'devicectl',
      'device',
      'info',
      'details',
      '--device',
      device.id,
      '--json-output',
      '-',
      '--quiet',
    ],
    { signal, quiet: true, timeoutMs: 60_000 },
  );

  return hostOnTunnel(parseTunnelAddress(stdout), interfaces);
}

/**
 * A paired iPhone runs the app devicectl launched, with the dev URL on its
 * tunnel and the session token. DEVICECTL_CHILD_ variables reach the app the
 * way SIMCTL_CHILD_ ones do, and keep the token out of the process list.
 */
async function launchOnPhone(
  runner: Runner,
  { device, app, appId, port = 8765, token, signal }: LaunchOptions & { app: string },
): Promise<Launched> {
  if (!device.tunnel || !token)
    throw new Error(
      `${device.name} has no phone link: kuito dev reaches a phone before launching on it.`,
    );

  await runner.run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', device.id, app], {
    signal,
    timeoutMs: 300_000,
  });

  await runner.run(
    'xcrun',
    [
      'devicectl',
      'device',
      'process',
      'launch',
      '--terminate-existing',
      '--device',
      device.id,
      appId,
    ],
    {
      signal,
      env: {
        DEVICECTL_CHILD_KUITO_DEV_URL: `ws://[${device.tunnel}]:${port}`,
        DEVICECTL_CHILD_KUITO_DEV_TOKEN: token,
      },
      timeoutMs: 60_000,
    },
  );

  return { label: `iOS ${device.name}`, pid: null };
}

export async function launchIOS(
  runner: Runner,
  options: LaunchOptions & { app: string },
): Promise<Launched> {
  if (options.device.emulator === false) return launchOnPhone(runner, options);

  const { device, app, appId, port = 8765, token, signal } = options;

  await runner.run('xcrun', ['simctl', 'install', device.id, app], { signal, timeoutMs: 120_000 });

  const launched = await runner.run(
    'xcrun',
    ['simctl', 'launch', '--terminate-running-process', device.id, appId],
    {
      signal,
      env: {
        SIMCTL_CHILD_KUITO_DEV_URL: `ws://127.0.0.1:${port}`,
        SIMCTL_CHILD_KUITO_DEV_TOKEN: token,
      },
      timeoutMs: 60_000,
    },
  );

  return { label: `iOS ${device.name}`, pid: parseLaunchPid(launched.stdout) };
}

const IOS_PROCESS = 'KuitoIOS';

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

async function findCrashReport(
  reportsDir: string,
  pid: number,
  since: number,
): Promise<Crash | null> {
  const names = (await readdir(reportsDir).catch((): string[] => [])).filter(
    (name) => name.startsWith(`${IOS_PROCESS}-`) && name.endsWith('.ips'),
  );

  for (const name of names) {
    const path = join(reportsDir, name);

    if ((await stat(path)).mtimeMs < since) continue;

    try {
      const crash = summarizeCrashReport(await readFile(path, 'utf8'));

      if (crash.pid === pid) return { ...crash, report: path };
    } catch {
      /* ReportCrash may still be writing; retried on the next poll */
    }
  }

  return null;
}

/**
 * Polls until the process dies, then until its crash report appears. Resolves
 * with the crash (a partial one if the full report never lands), null when the
 * process exited without a crash, undefined when the watch is aborted.
 */
interface ProcessWatch extends SignalOptions {
  isAlive: () => boolean | Promise<boolean>;
  findCrash: () => Promise<Crash | null>;
  pollMs: number;
  reportWaitMs: number;
}

async function watchProcess({
  isAlive,
  findCrash,
  signal,
  pollMs,
  reportWaitMs,
}: ProcessWatch): WatchResult {
  try {
    while (await isAlive()) await sleep(pollMs, undefined, { signal });

    const deadline = Date.now() + reportWaitMs;
    let partial: Crash | null = null;

    do {
      const crash = await findCrash();

      if (crash?.frames.length) return crash;
      partial = crash ?? partial;
      await sleep(pollMs, undefined, { signal });
    } while (Date.now() < deadline);

    return partial;
  } catch (error) {
    if (isAbortError(error)) return undefined;
    throw error;
  }
}

/** Simulator apps are host processes, so the launched pid can be polled directly. */
export function watchIOSApp({
  pid,
  since = Date.now(),
  signal,
  isAlive = isProcessAlive,
  reportsDir = join(homedir(), 'Library/Logs/DiagnosticReports'),
  pollMs = 500,
  reportWaitMs = 10_000,
}: SignalOptions & {
  pid: number;
  since?: number;
  isAlive?: (pid: number) => boolean | Promise<boolean>;
  reportsDir?: string;
  pollMs?: number;
  reportWaitMs?: number;
}): WatchResult {
  return watchProcess({
    isAlive: () => isAlive(pid),
    findCrash: () => findCrashReport(reportsDir, pid, since),
    signal,
    pollMs,
    reportWaitMs,
  });
}

async function androidPid(runner: Runner, device: Device, appId: string, signal?: AbortSignal) {
  const result = await runAdb(runner, ['-s', device.id, 'shell', 'pidof', appId], {
    signal,
  }).catch((error: unknown) => {
    if (isAbortError(error)) throw error;
    return { stdout: '' }; // pidof exits non-zero when the app is not running
  });

  return result.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
}

/** A relaunch gets a new pid, so the watched pid disappearing from pidof means it died. */
export function watchAndroidApp({
  runner,
  device,
  appId,
  pid,
  signal,
  pollMs = 1000,
  reportWaitMs = 10_000,
}: WatchOptions & { pollMs?: number; reportWaitMs?: number }): WatchResult {
  const report = `adb -s ${device.id} logcat -b crash -d`;

  return watchProcess({
    isAlive: async () => (await androidPid(runner, device, appId, signal)).includes(pid),
    findCrash: async () => {
      const { stdout } = await runAdb(
        runner,
        ['-s', device.id, 'logcat', '-b', 'crash', '-d', '-v', 'threadtime'],
        { signal },
      );
      const crash = summarizeAndroidCrash(stdout, { pid, process: appId });

      return crash && { ...crash, report };
    },
    signal,
    pollMs,
    reportWaitMs,
  });
}

const WATCHERS: Record<Platform, (options: WatchOptions) => WatchResult> = {
  ios: watchIOSApp,
  android: watchAndroidApp,
};

// Each stream knows its command and how to keep app messages, dropping tool chatter.
interface LogStream {
  command: (device: Device) => [bin: string, args: string[]];
  message: (line: string) => string | null;
}

const LOG_STREAMS: Record<Platform, LogStream> = {
  ios: {
    command: (device) => {
      if (device.emulator === false)
        throw new Error(
          `${device.name}'s logs stream from the phone, not from kuito: open Console.app and select ${device.name}.`,
        );

      return [
        'xcrun',
        [
          'simctl',
          'spawn',
          device.id,
          'log',
          'stream',
          '--level',
          'info',
          '--style',
          'compact',
          '--predicate',
          `process == "${IOS_PROCESS}"`,
        ],
      ];
    },
    // `2026-10-17 02:23:09.123 Df KuitoIOS[pid:tid] message`
    message: (line) =>
      /^\d{4}-\d\d-\d\d \S+\s+\w+\s+\S+\[[0-9a-f:]+\] (.*)$/.exec(line)?.[1] ?? null,
  },
  android: {
    command: (device) => [
      adbPath(),
      ['-s', device.id, 'logcat', '-v', 'threadtime', '-s', 'Kuito:*', 'AndroidRuntime:E'],
    ],
    // `10-17 01:46:57.626   890   890 I Kuito  : message`
    message: (line) => {
      const match = /^\S+\s+\S+\s+\d+\s+\d+\s+[VDIWEF]\s+(.*?)\s*: (.*)$/.exec(line);

      return match ? `${match[1]}: ${match[2]}` : null;
    },
  },
};

/** Streams app log messages until `signal` aborts. */
export function streamDeviceLogs(runner: Runner, device: Device, { onLine, signal }: LogOptions) {
  const { command, message } = LOG_STREAMS[device.platform];
  const [bin, args] = command(device);

  return runner.run(bin, args, {
    quiet: false,
    signal,
    timeoutMs: 0,
    onLine: (line) => {
      const text = signal?.aborted ? null : message(line);

      if (text !== null) onLine(text);
    },
  });
}

/** Options: { runner, device, appId, pid, since, signal }; each platform reads what it needs. */
export function watchApp(options: WatchOptions): WatchResult {
  return WATCHERS[options.device.platform](options);
}

// The debug shell reads its dev link here (KuitoDevLink.kt): run-as is the
// shell's alone, so no other app can point the shell at a server of its own,
// as any app could through an extra on the exported activity's intent.
const ANDROID_DEV_LINK = 'kuito-dev-link.json';

export async function launchAndroid(
  runner: Runner,
  { device, apk, appId, port = 8765, token, signal }: LaunchOptions & { apk: string },
): Promise<Launched> {
  await runAdb(runner, ['-s', device.id, 'install', '-r', apk], { signal, timeoutMs: 120_000 });

  const isEmulator = device.emulator;

  if (!isEmulator)
    await runAdb(runner, ['-s', device.id, 'reverse', `tcp:${port}`, `tcp:${port}`], { signal });

  const url = isEmulator ? `ws://10.0.2.2:${port}` : `ws://127.0.0.1:${port}`;

  await runAdb(
    runner,
    [
      '-s',
      device.id,
      'shell',
      `run-as ${appId} sh -c 'mkdir -p files && cat > files/${ANDROID_DEV_LINK}.new && mv files/${ANDROID_DEV_LINK}.new files/${ANDROID_DEV_LINK}'`,
    ],
    { signal, input: JSON.stringify({ url, token }) },
  );

  await runAdb(
    runner,
    ['-s', device.id, 'shell', 'am', 'start', '-W', '-n', `${appId}/${ANDROID_ACTIVITY}`],
    { signal },
  );

  const [pid = null] = await androidPid(runner, device, appId, signal);

  return { label: `Android ${device.name}`, pid };
}
