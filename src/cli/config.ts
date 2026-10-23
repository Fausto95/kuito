import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Node's flags for a process that loads Kuito's sources, which npm installs under node_modules. */
export const NODE_TYPESCRIPT = ['--import', pathToFileURL(join(ROOT, 'bin/strip-types.js')).href];

export const PLATFORMS = ['ios', 'android'] as const;

/**
 * What a build is for. `debug` is what a dev session runs: debuggable
 * bytecode, the dev kernel, a Debug shell. `release` is what an app ships:
 * optimized bytecode, the release kernel, a Release shell.
 */
export const PROFILES = ['debug', 'release'] as const;

export type Profile = (typeof PROFILES)[number];

/**
 * How an app `kuito create` makes declares its routes: file routes, an app/
 * directory whose files are the routes, or component routes, one <Router> in
 * app.tsx (docs/navigation.md).
 */
export const ROUTE_STYLES = ['files', 'components'] as const;

export type RouteStyle = (typeof ROUTE_STYLES)[number];

/** Every command, as parsing reads it and `kuito help` lists it. */
export const COMMAND_TABLE = [
  { name: 'dev', usage: 'dev [ios|android]', summary: 'Build, launch, and watch your app' },
  { name: 'run', usage: 'run [ios|android]', summary: 'Alias for dev' },
  {
    name: 'build',
    usage: 'build ios|android',
    summary: 'Build native app without launching (--profile release for the stores)',
  },
  {
    name: 'test',
    usage: 'test [ios|android] [files...]',
    summary: 'Run the app’s tests on the headless host',
  },
  { name: 'create', usage: 'create <name>', summary: 'Make a new app in ./<name> (alias: init)' },
  {
    name: 'module',
    usage: 'module create <Name>',
    summary: 'Add a native module in ./modules/<Name>',
  },
  {
    name: 'update',
    usage: 'update build <platform> | update key <file>',
    summary: 'Build and sign an over-the-air update, or make the key pair that signs them',
  },
  {
    name: 'symbolicate',
    usage: 'symbolicate <report.json>',
    summary: 'Map a release crash report back to your source',
  },
  { name: 'devices', usage: 'devices', summary: 'List simulators, emulators, connected devices' },
  { name: 'doctor', usage: 'doctor', summary: 'Check what building needs on this machine' },
  { name: 'logs', usage: 'logs <platform>', summary: 'Stream platform logs' },
  { name: 'help', usage: 'help', summary: 'Show this help' },
] as const;

export type Platform = (typeof PLATFORMS)[number];
type Command = (typeof COMMAND_TABLE)[number]['name'];

export const VALID_PLATFORMS: ReadonlySet<string> = new Set(PLATFORMS);
export const COMMANDS: ReadonlySet<string> = new Set(COMMAND_TABLE.map(({ name }) => name));

const isPlatform = (value: string): value is Platform => VALID_PLATFORMS.has(value);
const isCommand = (value: string): value is Command => COMMANDS.has(value);

const ALIASES: ReadonlyMap<string, Command> = new Map([['init', 'create']]);
const commandOf = (value: string) => (isCommand(value) ? value : ALIASES.get(value));

/** What `kuito update` does (docs/updates.md). */
const UPDATE_ACTIONS = ['build', 'key'] as const;

type UpdateAction = (typeof UPDATE_ACTIONS)[number];

const isUpdateAction = (value: string | undefined): value is UpdateAction =>
  UPDATE_ACTIONS.some((action) => action === value);

const UPDATE_USAGE = 'Usage: kuito update build <platform>, or kuito update key <file>';

export interface CliArgs {
  command: Command;
  platform: Platform | null;
  device: string | null;
  port: number;
  entry: string;
  /** The app `create` makes, or the module `module create` does. */
  name: string | null;
  /** The test files `test` runs; every one in the app when empty (docs/testing.md). */
  files: string[];
  /**
   * The crash report `symbolicate` reads (docs/crash-reports.md), or the
   * private key `update key` writes (docs/updates.md).
   */
  file: string | null;
  /** What `update` does: build and sign an update, or make the key pair. */
  action: UpdateAction | null;
  /** Where `update build` writes the update: `.kuito/updates` in the app by default. */
  out: string | null;
  /** The kuito.config.ts environment to build (docs/apps.md). */
  env: string;
  /** What `build` makes: `debug` unless `--profile release` (docs/cli.md#release-builds). */
  profile: Profile;
  /** How `create`'s app routes; null when not given, which asks or takes file routes. */
  routes: RouteStyle | null;
  noLaunch: boolean;
  noInstall: boolean;
  verbose: boolean;
  json: boolean;
  help: boolean;
}

type Flag = 'noLaunch' | 'noInstall' | 'verbose' | 'json' | 'help';

interface OptionValues {
  platform: string | null;
  device: string | null;
  port: string;
  entry: string | null;
  env: string | null;
  profile: string | null;
  routes: string | null;
  out: string | null;
}

interface OptionSpec {
  flags: readonly string[];
  help: string;
}

/** Every option, as parsing reads it and `kuito help` lists it: a value or a switch. */
export const OPTION_TABLE: readonly (OptionSpec &
  ({ value: keyof OptionValues; placeholder: string } | { flag: Flag }))[] = [
  { flags: ['-p', '--platform'], value: 'platform', placeholder: '<name>', help: 'iOS or Android' },
  {
    flags: ['-d', '--device'],
    value: 'device',
    placeholder: '<id/name>',
    help: 'Select device without picker',
  },
  {
    flags: ['--entry'],
    value: 'entry',
    placeholder: '<path>',
    help: 'TSX entry or app directory (default: the app/ directory if it exists, else app.tsx)',
  },
  {
    flags: ['--env'],
    value: 'env',
    placeholder: '<name>',
    help: 'kuito.config.ts environment (default: development for dev, production for build)',
  },
  {
    flags: ['--profile'],
    value: 'profile',
    placeholder: '<name>',
    help: 'build: debug (default) or release: an .ipa or .aab for the stores, or with --device an app to install',
  },
  {
    flags: ['--routes'],
    value: 'routes',
    placeholder: '<style>',
    help: 'create: files (an app/ directory of route files) or components (a <Router> in app.tsx)',
  },
  {
    flags: ['--out'],
    value: 'out',
    placeholder: '<dir>',
    help: 'update build: where the signed update goes (default: .kuito/updates)',
  },
  {
    flags: ['--port'],
    value: 'port',
    placeholder: '<number>',
    help: 'Dev server port (default: 8765)',
  },
  { flags: ['--no-launch'], flag: 'noLaunch', help: 'Start Live Patch server only' },
  { flags: ['--no-install'], flag: 'noInstall', help: 'create: skip npm install' },
  { flags: ['-v', '--verbose'], flag: 'verbose', help: 'Show full native build logs' },
  { flags: ['--json'], flag: 'json', help: 'JSON output for devices and doctor' },
  { flags: ['-h', '--help'], flag: 'help', help: 'Show this help' },
];

const OPTIONS = new Map(
  OPTION_TABLE.flatMap((option) => option.flags.map((flag) => [flag, option])),
);

const isProfile = (value: string): value is Profile => PROFILES.some((name) => name === value);

function profileOf(value: string | null, command: Command): Profile {
  if (value === null) return 'debug';

  if (command !== 'build')
    throw new Error('--profile only applies to kuito build; kuito dev runs the debug shell');

  if (!isProfile(value))
    throw new Error(`Unknown profile '${value}': use ${PROFILES.join(' or ')}`);

  return value;
}

const isRouteStyle = (value: string): value is RouteStyle =>
  ROUTE_STYLES.some((style) => style === value);

function routesOf(value: string | null, command: Command): RouteStyle | null {
  if (value === null) return null;
  if (command !== 'create') throw new Error('--routes only applies to kuito create');

  if (!isRouteStyle(value))
    throw new Error(`Unknown routes '${value}': use ${ROUTE_STYLES.join(' or ')}`);

  return value;
}

function platformOf(value: string | null): Platform | null {
  if (!value) return null;
  if (!isPlatform(value)) throw new Error(`Unknown platform '${value}'`);

  return value;
}

const isDirectory = (path: string) => existsSync(path) && statSync(path).isDirectory();

/**
 * `--entry` is relative to where kuito runs. Without it, the project runs its
 * `./app`: the routes directory `kuito create` makes, or a single `app.tsx`.
 */
function entryOf(entry: string | null, cwd: string) {
  if (entry) return resolve(cwd, entry);

  const app = join(cwd, 'app');

  return isDirectory(app) ? app : `${app}.tsx`;
}

export function parseArgs(
  args: readonly string[],
  { cwd = process.cwd() }: { cwd?: string } = {},
): CliArgs {
  const flags: Record<Flag, boolean> = {
    noLaunch: false,
    noInstall: false,
    verbose: false,
    json: false,
    help: false,
  };
  const values: OptionValues = {
    platform: null,
    device: null,
    port: '8765',
    entry: null,
    env: null,
    profile: null,
    routes: null,
    out: null,
  };
  const argv = [...args];
  let command: Command = 'dev';
  let name: string | null = null;
  let file: string | null = null;
  const files: string[] = [];
  const first = argv[0] === undefined ? undefined : commandOf(argv[0]);

  if (first) {
    command = first;
    argv.shift();
  }

  // `create` is the only module action so far.
  const asksHelp = argv.some((arg) => OPTIONS.get(arg)?.flags.includes('--help'));

  if (command === 'module' && !asksHelp && (argv.shift() !== 'create' || !argv[0]))
    throw new Error('Usage: kuito module create <Name>');

  const action = command === 'update' && !asksHelp ? argv.shift() : undefined;

  if (command === 'update' && !asksHelp && !isUpdateAction(action)) throw new Error(UPDATE_USAGE);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const option = OPTIONS.get(arg);

    if (option && 'flag' in option) flags[option.flag] = true;
    else if (VALID_PLATFORMS.has(arg) && !values.platform) values.platform = arg;
    else if (option) {
      const value = argv[i + 1];

      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a value`);
      values[option.value] = value;
      i++;
    } else if (
      (command === 'create' || command === 'module') &&
      name === null &&
      !arg.startsWith('-')
    )
      name = arg;
    else if (command === 'test' && !arg.startsWith('-')) files.push(arg);
    else if (
      (command === 'symbolicate' || action === 'key') &&
      file === null &&
      !arg.startsWith('-')
    )
      file = resolve(cwd, arg);
    else throw new Error(`Unknown argument: ${arg}. Run kuito help for usage.`);
  }

  if (command === 'symbolicate' && file === null && !flags.help)
    throw new Error('Name the report: kuito symbolicate <report.json>');

  if (action === 'key' && file === null)
    throw new Error('Name the key file: kuito update key <file>');

  if (action === 'build' && !values.platform && !flags.help) throw new Error(UPDATE_USAGE);

  if (values.out !== null && action !== 'build')
    throw new Error('--out only applies to kuito update build');

  if (command === 'create' && name === null && !flags.help)
    throw new Error('Name the app to create: kuito create <name>');

  const platform = platformOf(values.platform);
  const port = Number(values.port);

  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Port must be between 1 and 65535');

  return {
    command,
    platform,
    device: values.device,
    port,
    entry: entryOf(values.entry, cwd),
    name,
    files,
    file,
    action: isUpdateAction(action) ? action : null,
    out: values.out === null ? null : resolve(cwd, values.out),
    env: values.env ?? (command === 'build' || command === 'update' ? 'production' : 'development'),
    profile: profileOf(values.profile, command),
    routes: routesOf(values.routes, command),
    noLaunch: flags.noLaunch,
    noInstall: flags.noInstall,
    verbose: flags.verbose,
    json: flags.json,
    help: flags.help,
  };
}
