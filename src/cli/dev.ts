import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, relative } from 'node:path';
import { createElement as h } from 'react';
import { render } from 'ink';
import type { Instance } from 'ink';
import { NODE_TYPESCRIPT, ROOT } from './config.ts';
import { buildDeviceAssets } from './device-assets.ts';
import type { Project } from './project.ts';
import { configuredModules, shellModules, watchModuleSources, type ShellNeeds } from './modules.ts';
import type { NativeModuleUse } from '../dev/modules/catalog.ts';
import type { BundledAsset } from '../dev/assets.ts';
import type { AppConfig } from './kuito-config.ts';
import { formatCrash } from './crash.ts';
import { discover, resolveDevice } from './devices.ts';
import {
  buildAndroid,
  buildIOS,
  ensureAndroidBooted,
  ensureIOSBooted,
  launchAndroid,
  launchIOS,
  phoneLinkAddress,
  streamDeviceLogs,
  watchApp,
} from './platforms.ts';
import { createSessionStore } from './session/store.ts';
import { plainLines } from './session/format.ts';
import { DevicePicker, SessionView } from './session/view.ts';
import { terminate, toError } from './runner.ts';
import type { CliArgs, Platform } from './config.ts';
import type { Device, DiscoverOptions } from './devices.ts';
import type {
  LaunchOptions,
  Launched,
  LogOptions,
  SignalOptions,
  WatchOptions,
} from './platforms.ts';
import type { OutputStream, Runner } from './runner.ts';
import type { Diagnostic } from '../dev/compiler.ts';
import { TOKEN_LENGTH } from '../dev/dev-auth.ts';
import type { SessionEvent } from './session/state.ts';
import type { SessionStore } from './session/store.ts';
import type { SessionActions } from './session/view.ts';
import type { Out } from './ui.ts';

/** An error the dev session already showed in its feed is marked `reported`. */
export interface CliError extends Error {
  reported?: boolean;
  diagnostics?: Diagnostic[];
}

type LiveServer = ChildProcessWithoutNullStreams;

type ServerSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => LiveServer;

interface LiveServerOptions {
  entry: string;
  port: number;
  /** The platform whose bundle the server compiles: each platform gets its own. */
  platform: Platform;
  /** The project served: LogBox opens files and shows paths relative to it. */
  cwd?: string;
  /** The app's `strict`: a JS-thread fallback fails the build (docs/placement.md). */
  strict?: boolean;
  /** The session token every client must send (src/dev/dev-auth.ts). */
  token: string;
  /** A paired iPhone's CoreDevice tunnel address, which the server also listens on. */
  tunnel?: string;
  onEvent?: (event: SessionEvent) => void;
  spawnImpl?: ServerSpawn;
  timeoutMs?: number;
}

/** Server stdout lines starting with `{` are its NDJSON events (src/dev/reporter.ts). */
function parseServerLine(line: string, stream: OutputStream): SessionEvent {
  if (stream === 'stdout' && line.startsWith('{')) {
    try {
      const event: SessionEvent = JSON.parse(line);

      return event;
    } catch {
      /* not an event; fall through to log */
    }
  }

  return { type: 'log', stream, text: line };
}

/** Spawn the Live Patch server in NDJSON mode; resolves once it is ready for devices. */
export async function startLiveServer({
  entry,
  port,
  platform,
  cwd = process.cwd(),
  strict = false,
  token,
  tunnel,
  onEvent = () => {},
  spawnImpl = spawn,
  timeoutMs = 30000,
}: LiveServerOptions): Promise<LiveServer> {
  const child = spawnImpl(
    process.execPath,
    [...NODE_TYPESCRIPT, join(ROOT, 'scripts/dev-device.ts'), entry],
    {
      cwd,
      env: {
        ...process.env,
        KUITO_PORT: String(port),
        KUITO_PLATFORM: platform,
        ...(strict ? { KUITO_STRICT: '1' } : {}),
        KUITO_DEV_TOKEN: token,
        ...(tunnel ? { KUITO_PHONE_ADDRESS: tunnel } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  let settled = false;
  let output = '';
  const ready = new Promise<LiveServer>((resolve, reject) => {
    const timer = setTimeout(
      () => fail(new Error('Timed out waiting for the Kuito Live Patch server')),
      timeoutMs,
    );

    function pass() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(child);
    }

    function fail(err: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    }

    child.once('error', fail);

    child.once('exit', (code, signal) =>
      fail(new Error(`Live Patch server exited (${code ?? signal}). ${output.slice(-1800)}`)),
    );

    for (const stream of ['stdout', 'stderr'] as const) {
      createInterface({ input: child[stream] }).on('line', (line) => {
        output = (output + line + '\n').slice(-4000);

        const event = parseServerLine(line, stream);

        onEvent(event);
        if (event.type === 'ready') pass();
      });
    }
  });

  try {
    await ready;
    return child;
  } catch (error) {
    await terminate(child);
    throw error;
  }
}

interface PlatformSteps {
  bootLabel: (device: Device) => string;
  boot: (device: Device, options: SignalOptions) => Promise<Device>;
  build: (
    device: Device,
    options: SignalOptions & {
      needs: ShellNeeds;
      assets: readonly BundledAsset[];
      onWarning?: (message: string) => void;
    },
  ) => Promise<string>;
  launch: (
    device: Device,
    artifact: string,
    options: Omit<LaunchOptions, 'device' | 'appId'>,
  ) => Promise<Launched>;
}

interface PlatformDeps {
  discover: (options?: DiscoverOptions) => ReturnType<typeof discover>;
  platform: (device: Device) => PlatformSteps;
  watchApp: (options: Omit<WatchOptions, 'runner' | 'appId'>) => ReturnType<typeof watchApp>;
  streamLogs: (device: Device, options: LogOptions) => ReturnType<typeof streamDeviceLogs>;
  startServer: typeof startLiveServer;
  buildDeviceAssets: (
    entry: string,
    platform: Platform,
  ) => Promise<{
    nativeModules: NativeModuleUse[];
    links: number[];
    linkHash: string;
    assets: BundledAsset[];
  }>;
  /** Calls `onChange` when a module's Swift, Kotlin or manifest changes; returns the stop. */
  watchNative: (onChange: () => void) => () => void;
}

/** The id each platform's shell is installed under, from the app's config. */
const APP_IDS: Record<Platform, (config: AppConfig) => string> = {
  ios: (config) => config.ios.bundleIdentifier,
  android: (config) => config.android.applicationId,
};

/**
 * Facade over the per-platform native steps, so the session never branches on
 * platform. Every step builds and runs the project's own shell.
 */
export function createPlatformDeps(runner: Runner, project: Project): PlatformDeps {
  const PLATFORMS: Record<Platform, PlatformSteps> = {
    ios: {
      bootLabel: (device) => (device.emulator === false ? 'Phone reached' : 'Simulator booted'),
      boot: async (device, options) => {
        const booted = await ensureIOSBooted(runner, device, options);

        return booted.emulator === false
          ? { ...booted, tunnel: await phoneLinkAddress(runner, booted, options) }
          : booted;
      },
      build: async (device, { needs, ...options }) =>
        buildIOS(runner, {
          project,
          ...(await shellModules(project.root, needs, configuredModules(project.config))),
          device,
          ...options,
        }),
      launch: (device, artifact, options) =>
        launchIOS(runner, {
          device,
          app: artifact,
          appId: APP_IDS.ios(project.config),
          ...options,
        }),
    },
    android: {
      bootLabel: () => 'Device ready',
      boot: (device, options) => ensureAndroidBooted(runner, device, options),
      build: async (_device, { needs, ...options }) =>
        buildAndroid(runner, {
          project,
          ...(await shellModules(project.root, needs, configuredModules(project.config))),
          ...options,
        }),
      launch: (device, artifact, options) =>
        launchAndroid(runner, {
          device,
          apk: artifact,
          appId: APP_IDS.android(project.config),
          ...options,
        }),
    },
  };

  return {
    discover: (options) => discover(runner, options),
    platform: (device) => PLATFORMS[device.platform],
    watchApp: (options) =>
      watchApp({ runner, appId: APP_IDS[options.device.platform](project.config), ...options }),
    streamLogs: (device, options) => streamDeviceLogs(runner, device, options),
    startServer: (options) => startLiveServer({ ...options, strict: project.config.strict }),
    buildDeviceAssets: (entry, platform) => buildDeviceAssets(entry, project, platform),
    watchNative: (onChange) => watchModuleSources(project.root, onChange),
  };
}

function noDevicesError(platform: Platform | null) {
  const hint =
    platform === 'ios'
      ? 'Install a simulator in Xcode > Settings > Platforms'
      : 'Create an AVD with Android SDK or connect a device with adb';

  return new Error(`No ${platform || 'iOS/Android'} devices found. ${hint}. Run kuito doctor.`);
}

/** Standalone picker for one-shot commands (build, logs). Resolves null when cancelled. */
export async function chooseDevice(
  devices: Device[],
  { message = 'Where should Kuito run?' }: { message?: string } = {},
): Promise<Device | null> {
  if (devices.length === 1) return devices[0];

  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'Multiple devices found. Specify --device <id> or --platform <ios|android> in non-interactive mode.',
    );

  const picked = Promise.withResolvers<Device | null>();
  const instance = render(
    h(DevicePicker, {
      devices,
      message,
      onSelect: picked.resolve,
      onCancel: () => picked.resolve(null),
    }),
    { exitOnCtrlC: false },
  );
  const device = await picked.promise;

  instance.clear();
  instance.unmount();

  return device;
}

function printPlain(store: SessionStore, { cwd, out }: { cwd: string; out: Out }) {
  let printed = 0;
  let epoch = 0;

  return store.subscribe((state) => {
    if (state.epoch !== epoch) {
      epoch = state.epoch;
      printed = 0;
    }

    for (const item of state.feed.slice(printed))
      for (const line of plainLines(item, { cwd, entry: state.entry })) out(line);

    printed = state.feed.length;
  });
}

const CLEAR_SCREEN = '\x1b[2J\x1b[3J\x1b[H';

/**
 * `kuito dev`: boot, build, serve, launch, then react to edits, crashes and
 * shortcuts until quit. Interactive terminals get the Ink view; anything else
 * (CI, pipes) gets the same feed as plain lines and fails fast on a crash.
 */
/**
 * The token every client of the session's server sends (src/dev/dev-auth.ts):
 * a new 256-bit one, or the environment's KUITO_DEV_TOKEN, which pins it for
 * a tool that reconnects to an app kuito dev launched.
 */
export function sessionToken(env: NodeJS.ProcessEnv): string {
  const pinned = env.KUITO_DEV_TOKEN;

  if (pinned === undefined) return randomBytes(32).toString('base64url');

  if (pinned.length < TOKEN_LENGTH)
    throw new Error(`KUITO_DEV_TOKEN must be at least ${TOKEN_LENGTH} characters`);

  return pinned;
}

export async function runDev({
  args,
  deps,
  cwd = process.cwd(),
  out = console.log,
  interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY),
  stdin = process.stdin,
}: {
  args: Pick<CliArgs, 'entry' | 'port' | 'device' | 'platform' | 'noLaunch'>;
  deps: PlatformDeps;
  cwd?: string;
  out?: Out;
  interactive?: boolean;
  stdin?: NodeJS.ReadableStream;
}) {
  const store = createSessionStore({ entry: args.entry });
  const abort = new AbortController();
  const token = sessionToken(process.env);
  const session: {
    device: Device | null;
    server: LiveServer | null;
    /** The phone tunnel the running server also listens on. */
    tunnel: string | null;
    watch: AbortController | null;
    logs: AbortController | null;
    busy: boolean;
    picking: ((device: Device | null) => void) | null;
    quitting: boolean;
    /** What the running shell was built for. */
    needs: ShellNeeds;
    /** The images the running shell bundles, by name and hash. */
    assets: readonly BundledAsset[];
    /** A native rebuild asked for while other work ran. */
    rebuild: boolean;
    stopNative: (() => void) | null;
  } = {
    device: null,
    server: null,
    tunnel: null,
    watch: null,
    logs: null,
    busy: false,
    picking: null,
    quitting: false,
    needs: { uses: [], links: [], linkHash: '' },
    assets: [],
    rebuild: false,
    stopNative: null,
  };
  const finish = Promise.withResolvers<void>();
  const done = finish.promise;

  async function step<T>(id: string, label: string, detail: string, work: () => Promise<T>) {
    const started = performance.now();

    store.dispatch({ type: 'step:start', id, label, detail });

    try {
      const value = await work();

      store.dispatch({ type: 'step:end', id, ok: true, ms: performance.now() - started });

      return value;
    } catch (thrown) {
      if (abort.signal.aborted) throw thrown;

      const error: CliError = toError(thrown);

      store.dispatch({
        type: 'step:end',
        id,
        ok: false,
        ms: performance.now() - started,
        message: error.message,
        diagnostics: error.diagnostics,
      });

      throw Object.assign(error, { reported: true });
    }
  }

  function fail(thrown: unknown) {
    const error: CliError = toError(thrown);

    if (!error.reported) store.dispatch({ type: 'error', source: 'kuito', message: error.message });

    return Object.assign(error, { reported: true });
  }

  function stopApp() {
    session.watch?.abort();
    stopLogs();
  }

  function watchLaunched(device: Device, { pid }: Launched, since: number) {
    if (!pid) return;

    const watch = (session.watch = new AbortController());

    deps.watchApp({ device, pid, since, signal: watch.signal }).then(
      (crash) => {
        if (crash === undefined || watch.signal.aborted) return;

        store.dispatch(
          crash ? { type: 'app', status: 'crashed', crash } : { type: 'app', status: 'exited' },
        );

        if (crash && !interactive)
          finish.reject(Object.assign(new Error(formatCrash(crash)), { reported: true }));
      },
      (error) => finish.reject(fail(error)),
    );
  }

  /** Starts the server once, and again when the phone tunnel it must listen on changes. */
  async function startServer(platform: Platform, tunnel: string | null) {
    if (session.server && session.tunnel === tunnel) return;

    await stopServer();

    const server = await step(
      'server',
      `Live Patch on :${args.port}`,
      relative(cwd, args.entry),
      () =>
        deps.startServer({
          entry: args.entry,
          port: args.port,
          platform,
          cwd,
          token,
          tunnel: tunnel ?? undefined,
          onEvent: (event) => {
            store.dispatch(event);

            if (event.type !== 'patched') return;

            const missing = missingModules(event.nativeModules);
            const unlinked = unlinkedFunctions(event.links, event.linkHash);
            const stale = staleImages(event.assets);

            if (missing.length) rebuild(`the app now requires ${missing.join(', ')}`);
            else if (unlinked) rebuild(unlinked);
            else if (stale.length) rebuild(`the app now bundles ${stale.join(', ')}`);
          },
        }),
    );

    session.server = server;
    session.tunnel = tunnel;

    server.once('exit', (code: number | null) => {
      if (!session.quitting && session.server === server)
        finish.reject(fail(new Error(`Live Patch server stopped (${code})`)));
    });
  }

  async function stopServer() {
    const server = session.server;

    if (!server) return;

    session.server = null;
    server.stdin.end('exit\n');
    await terminate(server);
  }

  async function launch(device: Device) {
    const platform = deps.platform(device);

    stopApp();

    // The app is bundled into the native build, so compile it first; the
    // bundle also says which native modules and images the shell needs.
    const compiled = await step('assets', 'On-device app compiled', 'Rolldown/Oxc', () =>
      deps.buildDeviceAssets(args.entry, device.platform),
    );
    const needs = {
      uses: compiled.nativeModules,
      links: compiled.links,
      linkHash: compiled.linkHash,
    };

    session.needs = needs;
    session.assets = compiled.assets;

    const artifact = await step('build', 'Native app built', `${device.platform} · Debug`, () =>
      platform.build(device, {
        signal: abort.signal,
        needs,
        assets: compiled.assets,
        onWarning: (message) => store.dispatch({ type: 'console', level: 'warn', message }),
      }),
    );

    await startServer(device.platform, device.tunnel ?? null);

    const since = Date.now();
    const launched = await step('launch', 'App launched', device.name, () =>
      platform.launch(device, artifact, {
        port: args.port,
        token,
        signal: abort.signal,
      }),
    );

    watchLaunched(device, launched, since);
    store.dispatch({ type: 'connected' });
    session.stopNative ??= deps.watchNative(() => rebuild('a native module source changed'));
  }

  /** The modules a Live Patch requires that the running shell was built without. */
  function missingModules(required: readonly NativeModuleUse[] | undefined) {
    const built = session.needs.uses;

    if (!required) return [];

    const names = new Set(built.map(({ name }) => name));

    return [...new Set(required.map(({ name }) => name))].filter((name) => !names.has(name));
  }

  /**
   * Why a Live Patch needs another link table, if it does: it calls a
   * function the running shell did not link, or the specs renumbered them.
   */
  function unlinkedFunctions(links: readonly number[] | undefined, hash: string | undefined) {
    const built = session.needs;

    if (hash && built.linkHash && hash !== built.linkHash) return 'a native module spec changed';

    const linked = new Set(built.links);
    const added = (links ?? []).filter((id) => !linked.has(id));

    return added.length
      ? `the app now calls ${added.length} more native module function${added.length === 1 ? '' : 's'}`
      : null;
  }

  /** The images a Live Patch imports that the running shell lacks or has other bytes of. */
  function staleImages(imported: readonly BundledAsset[] | undefined) {
    const built = new Set(session.assets.map(({ name, hash }) => name + '\0' + hash));

    return (imported ?? [])
      .filter(({ name, hash }) => !built.has(name + '\0' + hash))
      .map(({ file }) => relative(cwd, file));
  }

  /** Native code or the module set changed: rebuild the shell and relaunch, once at a time. */
  function rebuild(reason: string) {
    if (!session.device || session.quitting) return;

    store.dispatch({ type: 'log', source: 'kuito', text: `Rebuilding the shell: ${reason}` });

    if (session.busy) {
      session.rebuild = true;
      return;
    }

    actions.relaunch();
  }

  async function runOn(device: Device) {
    stopApp();
    store.dispatch({ type: 'target', device });

    const platform = deps.platform(device);

    const booted = await step('boot', platform.bootLabel(device), device.name, () =>
      platform.boot(device, { signal: abort.signal }),
    );

    session.device = booted;
    await launch(booted);
  }

  async function pick(message: string): Promise<Device | null> {
    const { devices } = await deps.discover({ platform: args.platform, physicalIOS: true });

    if (!devices.length) throw noDevicesError(args.platform);
    if (devices.length === 1) return devices[0];

    if (!interactive)
      throw new Error(
        'Multiple devices found. Specify --device <id> or --platform <ios|android> in non-interactive mode.',
      );

    return new Promise((resolve) => {
      session.picking = resolve;
      store.dispatch({ type: 'pick', devices, message });
    });
  }

  function endPick(device: Device | null) {
    store.dispatch({ type: 'picked' });
    session.picking?.(device);
    session.picking = null;
  }

  /** Shortcut work runs one at a time; its failures stay in the feed instead of ending the session. */
  const exclusive = (work: () => Promise<void>) => () => {
    if (session.busy) return;
    session.busy = true;

    work()
      .catch(fail)
      .finally(() => {
        session.busy = false;

        if (session.rebuild) {
          session.rebuild = false;
          actions.relaunch();
        }
      });
  };

  function stopLogs() {
    if (!session.logs) return;
    session.logs.abort();
    session.logs = null;
    store.dispatch({ type: 'logs', on: false });
  }

  function toggleLogs() {
    if (session.logs) return stopLogs();
    if (!session.device) return;

    const logs = (session.logs = new AbortController());

    store.dispatch({ type: 'logs', on: true });

    deps
      .streamLogs(session.device, {
        signal: logs.signal,
        onLine: (text) => store.dispatch({ type: 'log', source: 'device', text }),
      })
      .catch((error) => {
        if (!logs.signal.aborted) fail(error);
      });
  }

  let ink: Instance | null = null;
  const actions: SessionActions = {
    // Boot again first: a phone's tunnel may have a new address since the last launch.
    relaunch: exclusive(async () => {
      if (session.device) await runOn(session.device);
    }),
    toggleLogs,
    switchDevice: exclusive(async () => {
      const device = await pick('Run on which device?');

      if (device) await runOn(device);
    }),
    clear: () => {
      ink?.clear();
      process.stdout.write(CLEAR_SCREEN);
      store.dispatch({ type: 'clear' });
    },
    devtools: () => session.server?.stdin.write('devtools\n'),
    debugJS: () => session.server?.stdin.write('debug js\n'),
    debugUI: () => session.server?.stdin.write('debug ui\n'),
    components: () => session.server?.stdin.write('components\n'),
    record: () => session.server?.stdin.write('record\n'),
    help: () => store.dispatch({ type: 'help' }),
    quit: () => finish.resolve(),
    select: (device) => endPick(device),
    cancelPick: () => endPick(null),
  };

  const unsubscribe = interactive ? null : printPlain(store, { cwd, out });

  ink = interactive
    ? render(h(SessionView, { store, actions, cwd }), { exitOnCtrlC: false })
    : null;

  const lines = interactive ? null : createInterface({ input: stdin });

  lines?.on('line', (line) => {
    const command = line.trim();

    if (['q', 'quit', 'exit'].includes(command)) finish.resolve();
    else if (command) session.server?.stdin.write(command + '\n');
  });

  const onSignal = () => finish.resolve();

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    const start = (async () => {
      if (args.noLaunch) {
        if (!args.platform)
          throw new Error(
            'kuito dev --no-launch needs a platform, as kuito dev ios --no-launch: each platform gets its own bundle.',
          );

        await startServer(args.platform, null);
        store.dispatch({ type: 'connected' });

        return;
      }

      const device = args.device
        ? resolveDevice(
            (await deps.discover({ platform: args.platform, physicalIOS: true })).devices,
            args.device,
          )
        : await pick('Where should Kuito run?');

      if (!device) return finish.resolve();
      await runOn(device);
    })();

    start.catch((error) => finish.reject(fail(error)));
    await done;
  } finally {
    session.quitting = true;
    abort.abort();
    stopApp();
    session.stopNative?.();

    await stopServer();

    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    lines?.close();
    store.dispatch({ type: 'stopped' });
    unsubscribe?.();

    if (ink) {
      await new Promise((resolve) => setTimeout(resolve, 50)); // let Ink paint the final frame
      ink.unmount();
    }
  }
}
