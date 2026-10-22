#!/usr/bin/env node
/**
 * Checks the npm package the way a user meets it: packs this checkout,
 * installs the tarball, runs its `kuito create`, runs the new app's tests
 * against the tarball and compiles the app with the installed compiler. A
 * checkout runs Kuito from outside node_modules, so only an installed package
 * catches a file missing from `files`, a runtime dependency left in
 * devDependencies, a source Node refuses to strip under node_modules, or a
 * compiler pass that skips Kuito's own sources there.
 *
 *   node scripts/check-package.ts
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../src/cli/config.ts';

function run(command: string, args: string[], options: SpawnSyncOptions = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });

  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`);
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

function dependencyOn(file: string, name: string): unknown {
  const manifest = readJson(file);

  return typeof manifest === 'object' &&
    manifest !== null &&
    'dependencies' in manifest &&
    typeof manifest.dependencies === 'object' &&
    manifest.dependencies !== null &&
    name in manifest.dependencies
    ? Object.getOwnPropertyDescriptor(manifest.dependencies, name)?.value
    : undefined;
}

// npm resolves file: dependencies from the real path; macOS's temp directory is a link.
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-package-')));

try {
  run('npm', ['pack', '--pack-destination', scratch], { cwd: ROOT });

  const manifest = readJson(join(ROOT, 'package.json'));
  const field = (key: string): unknown =>
    typeof manifest === 'object' && manifest !== null && key in manifest
      ? Object.getOwnPropertyDescriptor(manifest, key)?.value
      : null;
  const name = field('name');
  const version = field('version');

  if (typeof name !== 'string' || typeof version !== 'string')
    throw new Error('package.json has no name or version');

  // npm pack names a scoped package's tarball <scope>-<name>-<version>.tgz.
  const tarball = join(scratch, `${name.replace('@', '').replace('/', '-')}-${version}.tgz`);
  const release = `npm:${name}@^${version}`;
  const cli = join(scratch, 'cli');

  mkdirSync(cli);
  writeFileSync(join(cli, 'package.json'), '{ "private": true }\n');
  run('npm', ['install', '--no-audit', '--no-fund', tarball], { cwd: cli });
  run(join(cli, 'node_modules/.bin/kuito'), ['create', 'Smoke', '--no-install'], { cwd: scratch });

  const app = join(scratch, 'Smoke');
  const declared = dependencyOn(join(app, 'package.json'), 'kuito');

  if (declared !== release)
    throw new Error(`The created app depends on kuito ${String(declared)}, not ${release}`);

  // The release is not on npm yet: the app installs the tarball it would download.
  const pkg = readFileSync(join(app, 'package.json'), 'utf8');

  writeFileSync(
    join(app, 'package.json'),
    pkg.replace(JSON.stringify(release), JSON.stringify(tarball)),
  );

  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: app });
  run('npm', ['test'], { cwd: app });

  // Kuito ships its sources uncompiled: its own UI-thread functions reach the
  // UI bundle only if the installed compiler compiles node_modules/kuito too.
  const installed = join(app, 'node_modules/kuito');
  const compiled = `
    const { createSourceCompiler } = await import(${JSON.stringify(pathToFileURL(join(installed, 'src/dev/compiler.ts')).href)});
    const { uiMap } = await createSourceCompiler({ platform: 'ios', outputDir: ${JSON.stringify(join(scratch, 'compiled'))} })('app');
    if (!JSON.parse(uiMap).sources.some((source) => source.includes('node_modules/kuito/src/ui/')))
      throw new Error('The UI bundle holds none of Kuito’s own UI-thread functions');
  `;

  run(
    process.execPath,
    [
      '--import',
      pathToFileURL(join(installed, 'bin/strip-types.js')).href,
      '--input-type=module',
      '-e',
      compiled,
    ],
    { cwd: app },
  );

  console.log(
    `${name} ${version}: packed, installed, created an app, passed its tests and compiled it`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
