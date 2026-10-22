import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ROOT } from '../src/cli/config.ts';
import { buildDeviceAssets } from '../src/cli/device-assets.ts';
import { bundleKernel, bundleUIKernel, uiKernelHash } from '../src/dev/kernel.ts';
import { APP_CONFIG } from './support/app-config.ts';
import { assertKernel } from './support/kuito-host.ts';
import { hosting, nativeEvent } from './support/host-wire.ts';

const counterApp = readFileSync(new URL('fixtures/patches/v1.js', import.meta.url), 'utf8');

const devUI = await bundleUIKernel();
const releaseUI = await bundleUIKernel('release');
const dev = await bundleKernel('dev', devUI);
const release = await bundleKernel('release', releaseUI);

/** Strings only dev-only code holds, each standing for one feature; minifying keeps them. */
const DEV_ONLY = {
  devtools: ['__kuitoHostDevtools', 'devtoolsHello', 'devtoolsHighlight', 'Unknown panel message'],
  'cause tracking': ['devtoolsCause'],
  // Both kernels' console.
  'inspector console': ['__kuitoHostConsole'],
  // The UI kernel's frame budget, which reads the UI host's clock.
  'frame budget': ['__kuitoUINow'],
};

test('the dev kernels carry the devtools and cause tracking', () => {
  Object.values(DEV_ONLY)
    .flat()
    .forEach((marker) => assert.ok(dev.includes(marker) || devUI.includes(marker), marker));
});

test('no kernel restarts the app for the panel', () => {
  assert.ok(!dev.includes('devtoolsReload'));
});

test('the release kernels carry none of the dev-only code', () => {
  Object.entries(DEV_ONLY).forEach(([feature, markers]) =>
    markers.forEach((marker) =>
      assert.ok(!release.includes(marker) && !releaseUI.includes(marker), feature + ': ' + marker),
    ),
  );
});

test('the kernel names the UI kernel it was built with by hash, without its source', () => {
  for (const [kernel, ui] of [
    [dev, devUI],
    [release, releaseUI],
  ]) {
    assert.match(uiKernelHash(ui), /^[0-9a-f]{40}$/);
    assert.ok(kernel.includes(uiKernelHash(ui)));
    // Only the UI kernel installs it: the kernel would carry it only as the UI kernel's source.
    assert.ok(ui.includes('__kuitoUI'));
    assert.ok(!kernel.includes('__kuitoUISetProp'));
  }

  assert.notEqual(uiKernelHash(devUI), uiKernelHash(releaseUI));
});

test('the release kernels are minified', () => {
  assert.ok(release.length < dev.length * 0.6, `release ${release.length}, dev ${dev.length}`);
  assert.ok(releaseUI.length < devUI.length * 0.6);
  // Rolldown marks each module with a region comment; minifying drops them.
  assert.ok(devUI.includes('//#region src/ui-thread'));
  assert.ok(!release.includes('//#region'));
  assert.ok(!releaseUI.includes('//#region'));
});

test('the release kernel runs an app and never talks to an inspector', () => {
  const views = new Map<string, string>();
  const sent: string[] = [];
  const context = hosting({
    setProp(id: string, name: string, value: unknown) {
      if (name === 'text') views.set(id, String(value));
    },
    __kuitoHostDevtools(message: string) {
      sent.push(message);
    },
  });

  runInNewContext(release, context);
  assertKernel(context);
  runInNewContext(counterApp, context);
  nativeEvent(context.__kuito, 'counter.press');

  assert.equal(views.get('counter'), '1');
  assert.equal('__kuitoDevtools' in context, false);
  assert.deepEqual(sent, []);
});

test('a release device build compiles both kernels and the app as release bytecode', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kuito-release-'));
  const project = {
    root,
    cache: join(root, '.kuito'),
    environment: 'production',
    config: APP_CONFIG,
  };
  const compiled: { source: string; profile: string }[] = [];

  await buildDeviceAssets(join(ROOT, 'test/fixtures/greeting-app.tsx'), project, 'ios', {
    profile: 'release',
    compile: async (source, output, profile) => {
      compiled.push({ source, profile });
      await writeFile(output, '');
      // As release hermesc does: the map of its bytecode offsets.
      await writeFile(output + '.map', '{"version":3,"sources":[],"mappings":""}');
    },
  });

  const kernel = readFileSync(join(project.cache, 'mobile/ios/bootstrap.js'), 'utf8');
  const ui = readFileSync(join(project.cache, 'mobile/ios/ui.js'), 'utf8');

  assert.equal(kernel, release);
  assert.equal(ui, releaseUI);

  assert.ok(
    compiled.some(({ source }) => source === join(project.cache, 'mobile/ios/ui.js')),
    'the UI kernel ships as bytecode',
  );

  assert.ok(compiled.length >= 3, 'the kernels and the app start');
  assert.deepEqual(new Set(compiled.map(({ profile }) => profile)), new Set(['release']));
  assert.ok(existsSync(join(project.cache, 'ios/Resources/app.hbc')));
  assert.ok(existsSync(join(project.cache, 'ios/Resources/ui.hbc')), 'beside bootstrap.hbc');

  assert.ok(
    !existsSync(join(project.cache, 'ios/Resources/app.js')),
    'a release shell takes no Live Patch, so it carries no source to recognize one by',
  );
});

/** A device build of the motion fixture with a stand-in compiler: the sources it was given. */
async function buildMotionApp(profile: 'debug' | 'release') {
  const root = mkdtempSync(join(tmpdir(), `kuito-${profile}-`));
  const project = {
    root,
    cache: join(root, '.kuito'),
    environment: 'production',
    config: APP_CONFIG,
  };
  const sources: string[] = [];

  await buildDeviceAssets(join(ROOT, 'test/fixtures/motion-app.tsx'), project, 'ios', {
    profile,
    compile: async (source, output) => {
      sources.push(source);
      await writeFile(output, '');
      await writeFile(output + '.map', '{"version":3,"sources":[],"mappings":""}');
    },
  });

  const scratch = join(project.cache, 'mobile/ios');

  return {
    sources,
    scratch,
    resources: join(project.cache, 'ios/Resources'),
    start: readFileSync(join(scratch, 'start.js'), 'utf8'),
  };
}

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

test('a release device build ships the app UI bundle as bytecode, named by hash', async () => {
  const { sources, scratch, resources, start } = await buildMotionApp('release');
  const ui = readFileSync(join(scratch, 'app-ui.js'), 'utf8');

  assert.ok(ui.includes('__kuitoUI.define('), 'the app has UI-thread functions');
  assert.ok(sources.includes(join(scratch, 'app-ui.js')), 'compiled to bytecode');
  assert.ok(existsSync(join(resources, 'app-ui.hbc')), 'beside app.hbc');

  // The root chunk names the bundle by the hash hermesc writes into its header.
  assert.ok(start.includes(`loadShippedUI(${JSON.stringify(sha1(ui))}`), start.slice(-400));
  assert.ok(!start.includes(JSON.stringify(ui)), 'the root chunk carries none of its source');
});

test('a debug device build sends the app UI bundle as source, as a Live Patch does', async () => {
  const { sources, resources, start } = await buildMotionApp('debug');

  assert.ok(!sources.some((source) => source.endsWith('app-ui.js')));
  assert.ok(!existsSync(join(resources, 'app-ui.hbc')));
  assert.ok(start.includes('__kuito.loadUI('));
  assert.ok(!start.includes('loadShippedUI'));
});
