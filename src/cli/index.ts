import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createApp } from './create.ts';
import { createModule, moduleDirectory } from './create-module.ts';
import { configuredModules, shellModules } from './modules.ts';
import { loadProject, type Project } from './project.ts';
import { buildDeviceAssets } from './device-assets.ts';
import type { BundledAsset } from '../dev/assets.ts';
import { createRunner, toError } from './runner.ts';
import { parseCrashReport, symbolicateReport, type CrashReport } from './crash-reports.ts';
import { checkHost } from './requirements.ts';
import { buildUpdate, writeKeyPair } from './updates.ts';
import { discover, resolveDevice } from './devices.ts';
import {
  buildAndroid,
  buildIOS,
  ensureAndroidBooted,
  ensureIOSBooted,
  streamDeviceLogs,
} from './platforms.ts';
import { parseArgs, ROOT } from './config.ts';
import { HELP } from './help.ts';
import { banner, check, step, warn, problem, dim, task } from './ui.ts';
import { chooseDevice, createPlatformDeps, runDev } from './dev.ts';
import type { CliArgs, Profile } from './config.ts';
import type { CliError } from './dev.ts';
import type { Device } from './devices.ts';
import type { Runner } from './runner.ts';
import type { Out } from './ui.ts';

interface OutputOptions {
  json?: boolean;
  out?: Out;
}

function printDevices(
  devices: Device[],
  diagnostics: string[],
  { json = false, out = console.log }: OutputOptions = {},
) {
  if (json) {
    out(JSON.stringify({ devices, diagnostics }, null, 2));
    return;
  }

  banner(out);
  if (!devices.length) warn('No available devices. Run kuito doctor or create an emulator.', out);

  for (const device of devices)
    step(device.name, `${device.platform} · ${device.id} · ${device.status}`, out);

  for (const diagnostic of diagnostics) warn(diagnostic, out);
}

async function doctor(runner: Runner, { json = false, out = console.log }: OutputOptions = {}) {
  const checks = await checkHost(runner);

  if (json) out(JSON.stringify({ checks, os: process.platform }, null, 2));
  else {
    banner(out);
    step('Environment', `${process.platform} · Node ${process.version}`, out);
    for (const { ok, name, fix } of checks) check(ok, name, fix, out);
    out('');
    warn('iOS is macOS-only.', out);
  }

  return checks;
}

/** `physicalIOS` for a build: a log stream reaches simulators only. */
async function selectDevice(runner: Runner, args: CliArgs, { physicalIOS = false } = {}) {
  const { devices } = await discover(runner, { platform: args.platform, physicalIOS });

  if (!devices.length)
    throw new Error(`No ${args.platform || 'iOS/Android'} devices found. Run kuito doctor.`);

  if (args.device) return resolveDevice(devices, args.device);

  const device = await chooseDevice(devices);

  if (!device) throw new Error('Device selection cancelled');

  return device;
}

const BOOT = { ios: ensureIOSBooted, android: ensureAndroidBooted };

const PROFILE_LABELS: Record<Profile, string> = { debug: 'Debug', release: 'Release' };

async function build(
  runner: Runner,
  args: CliArgs,
  project: Project,
  device: Device | null,
  needs: Parameters<typeof shellModules>[1],
  assets: readonly BundledAsset[],
) {
  const target = device?.platform || args.platform;

  if (!target) throw new Error('Select a platform: kuito build ios or kuito build android');

  const onLine = args.verbose ? (line: string) => console.log(dim('    ' + line)) : null;
  const warnings: string[] = [];
  const onWarning = (message: string) => warnings.push(message);
  const shell = await shellModules(project.root, needs, configuredModules(project.config));
  const { profile } = args;
  const options = { project, ...shell, assets, onLine, onWarning, profile };
  const artifact = await task(
    'Build native app',
    `${target} · ${PROFILE_LABELS[profile]} · ${project.environment}`,
    () =>
      target === 'ios'
        ? buildIOS(runner, { ...options, device })
        : buildAndroid(runner, { ...options, device }),
  );

  for (const message of warnings) warn(message);

  step('Artifact', relative(project.root, artifact));

  return artifact;
}

async function readReport(file: string) {
  let text: string;

  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new Error(`Cannot read the crash report ${file}`);
  }

  try {
    return parseCrashReport(JSON.parse(text));
  } catch (error) {
    throw new Error(`${file}: ${toError(error).message}`);
  }
}

/** A report's frames at the app's source; a native stack as the platform printed it. */
function printSymbolicated(report: CrashReport, project: Project, out: Out) {
  const { message, frames } = symbolicateReport(report, project);
  const what = `${report.fatal ? 'fatal ' : ''}${report.kind}`;

  problem(message, out);

  const update = report.app.update === null ? '' : ` update ${report.app.update}`;

  step(
    what,
    `${report.platform} ${report.app.version} (${report.app.build})${update} · ${report.time}`,
    out,
  );

  if (report.kind === 'native') {
    out(report.stack);

    return;
  }

  for (const { name, kind, file, line, column } of frames)
    out(
      `    at ${name || '<anonymous>'}  ` +
        (file ? `${file}:${line}:${column}` : kind === 'native' ? '(native)' : `(${kind})`),
    );
}

/** `kuito update build <platform>` and `kuito update key <file>` (docs/updates.md). */
async function update(args: CliArgs, { cwd, out }: { cwd: string; out: Out }) {
  // Before the config has a public key to check: the app is where `kuito` runs.
  if (args.action === 'key') {
    const publicKey = await task('Create update key', args.file ?? '', () =>
      writeKeyPair(args.file ?? '', cwd),
    );

    step('Next', 'set it as updates.publicKey in kuito.config.ts', out);
    out(`    publicKey: '${publicKey}'`);
    out('');

    warn(
      'Keep the private key safe: losing it strands every shell built with this public key.',
      out,
    );

    return;
  }

  const project = await loadProject(cwd, args.env);
  const platform = args.platform;

  if (!platform)
    throw new Error('Select a platform: kuito update build ios or kuito update build android');

  const { directory, manifest } = await task(
    'Build update',
    `${platform} · ${project.environment}`,
    () =>
      buildUpdate({
        entry: args.entry,
        project,
        platform,
        ...(args.out && { out: args.out }),
      }),
    out,
  );

  step('Update', `${manifest.id} · for shell ${manifest.fingerprint.slice(0, 12)}`, out);
  step('Upload', relative(project.root, directory), out);

  out(
    `    to updates.url as ${platform}/${manifest.fingerprint}/: ${manifest.id}/ first, then update.json`,
  );
}

/** A new app in `<cwd>/<name>`, depending on this checkout (docs/cli.md). */
async function create(runner: Runner, args: CliArgs, { cwd, out }: { cwd: string; out: Out }) {
  if (!args.name) throw new Error('Name the app to create: kuito create <name>');

  const { name } = args;
  const directory = resolve(cwd, name);
  const where = relative(cwd, directory);

  await task('Create app', where, () => createApp({ name, directory, framework: ROOT }), out);

  if (!args.noInstall)
    await task(
      'Install dependencies',
      'npm install',
      () => runner.run('npm', ['install'], { cwd: directory, timeoutMs: 600_000 }),
      out,
    );

  out('');
  step('Next', '', out);
  out(`    cd ${where}`);
  if (args.noInstall) out('    npm install');
  out('    npm run ios        or: npm run android');
}

/** `kuito module create <Name>`: a native module in the app's modules/ (docs/native-modules.md). */
async function addModule(args: CliArgs, { cwd, out }: { cwd: string; out: Out }) {
  if (!args.name) throw new Error('Usage: kuito module create <Name>');

  const { name } = args;
  const { root, config } = await loadProject(cwd, args.env);
  const folder = moduleDirectory(name);
  const files = await task(
    'Create module',
    `modules/${folder}`,
    () => createModule({ name, root, config }),
    out,
  );

  for (const file of files) out(`    ${file}`);
  out('');
  step('Next', 'import it, and kuito dev builds it into the shell', out);
  out(`    import ${name} from './modules/${folder}/${folder}';`);
}

export async function main(
  argv = process.argv.slice(2),
  {
    runner = createRunner(),
    out = console.log,
    cwd = process.cwd(),
  }: { runner?: Runner; out?: Out; cwd?: string } = {},
) {
  const args = parseArgs(argv, { cwd });

  if (args.help || args.command === 'help') {
    out(HELP);
    return;
  }

  if (args.command === 'doctor') {
    await doctor(runner, { json: args.json, out });
    return;
  }

  if (args.command === 'devices') {
    const found = await discover(runner, { platform: args.platform, physicalIOS: true });

    printDevices(found.devices, found.diagnostics, { json: args.json, out });

    return;
  }

  if (args.command === 'dev' || args.command === 'run') {
    const project = await loadProject(cwd, args.env);

    if (!existsSync(args.entry))
      throw new Error(
        `App entry not found: ${args.entry}. Supply --entry <file or app directory>.`,
      );

    return runDev({ args, deps: createPlatformDeps(runner, project) });
  }

  if (args.command === 'test') {
    const { runTests } = await import('../tests/runner.ts');

    // Node's test runner reports; the exit code says whether every test passed.
    process.exitCode = await runTests(cwd, args.platform ?? 'ios', args.files);

    return;
  }

  banner(out);

  if (args.command === 'create') {
    await create(runner, args, { cwd, out });

    return;
  }

  if (args.command === 'module') {
    await addModule(args, { cwd, out });

    return;
  }

  if (args.command === 'build') {
    const project = await loadProject(cwd, args.env);
    const device = args.device ? await selectDevice(runner, args, { physicalIOS: true }) : null;
    const booted =
      device &&
      (await task('Boot device', device.name, () => BOOT[device.platform](runner, device)));

    const platform = device?.platform || args.platform;

    if (!platform) throw new Error('Select a platform: kuito build ios or kuito build android');

    const compiled = await task('Compile on-device app', `Rolldown/Oxc ${platform} bundle`, () =>
      buildDeviceAssets(args.entry, project, platform, { profile: args.profile }),
    );

    await build(
      runner,
      args,
      project,
      booted,
      { uses: compiled.nativeModules, links: compiled.links, linkHash: compiled.linkHash },
      compiled.assets,
    );

    return;
  }

  if (args.command === 'update') {
    await update(args, { cwd, out });

    return;
  }

  if (args.command === 'symbolicate') {
    const project = await loadProject(cwd, args.env);

    printSymbolicated(await readReport(args.file ?? ''), project, out);

    return;
  }

  if (args.command === 'logs') {
    const device = await selectDevice(runner, args);

    step('Streaming logs', device.name, out);
    await streamDeviceLogs(runner, device, { onLine: (line) => out(line) });
  }
}

export async function cli(argv = process.argv.slice(2)) {
  try {
    await main(argv);
  } catch (thrown) {
    const error: CliError = toError(thrown);

    // Session errors were already shown in the feed; everything else is reported here.
    if (!error.reported) problem(error.message);
    process.exitCode = 1;
  }
}
