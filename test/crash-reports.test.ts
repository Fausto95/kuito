import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TraceMap, eachMapping, originalPositionFor } from '@jridgewell/trace-mapping';
import { parseArgs, ROOT } from '../src/cli/config.ts';
import {
  CRASH_REPORT_KEYS,
  parseCrashReport,
  sourceMapDirectory,
  symbolicateReport,
} from '../src/cli/crash-reports.ts';
import { buildDeviceAssets } from '../src/cli/device-assets.ts';
import { bytecodeArgs } from '../src/cli/hermesc.ts';
import { APP_CONFIG } from './support/app-config.ts';

const FIXTURE = join(ROOT, 'test/fixtures/crash-app.tsx');
// `throw new Error(...)` in the fixture.
const THROW_LINE = 4;

function projectIn() {
  const root = mkdtempSync(join(tmpdir(), 'kuito-crash-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root, cache: join(root, '.kuito'), environment: 'production', config: APP_CONFIG };
}

const report = (stack: string, extra: Record<string, unknown> = {}) => ({
  id: '5E0C1D2A-0000-4000-8000-000000000000',
  kind: 'javascript',
  fatal: false,
  message: 'Error: boom: pressed',
  stack,
  time: '2026-10-21T15:00:00Z',
  app: { id: 'dev.kuito.shell', version: '1.0.0', build: '1' },
  platform: 'ios',
  os: '27.0',
  device: 'iPhone18,2',
  ...extra,
});

test('release bytecode writes the source map its stack offsets resolve through', () => {
  assert.ok(bytecodeArgs('app.js', 'app.hbc', 'release').includes('-output-source-map'));
  assert.ok(!bytecodeArgs('app.js', 'app.hbc', 'debug').includes('-output-source-map'));
});

test('a release build keeps every script’s maps by version and build, outside the shell', async () => {
  const project = projectIn();

  await buildDeviceAssets(FIXTURE, project, 'ios', { profile: 'release' });

  const maps = sourceMapDirectory(project, 'ios', '1.0.0', '1');

  assert.equal(maps, join(project.cache, 'sourcemaps/ios/1.0.0-1'));

  for (const file of ['app.hbc.map', 'app.js.map'])
    assert.ok(existsSync(join(maps, file)), `${file} is kept`);

  assert.ok(
    !existsSync(join(project.cache, 'ios/Resources/app.hbc.map')),
    'the app ships no map: it would hand out its source',
  );

  // The bundle's map names the app's files relative to the project.
  const bundle = JSON.parse(readFileSync(join(maps, 'app.js.map'), 'utf8')) as {
    sources: string[];
  };

  assert.ok(bundle.sources.some((source) => source.endsWith('test/fixtures/crash-app.tsx')));

  const debug = projectIn();

  await buildDeviceAssets(FIXTURE, debug, 'ios');

  assert.ok(
    !existsSync(join(debug.cache, 'sourcemaps')),
    'a debug build carries debug info instead',
  );
});

test('a debug build leaves each script’s map beside it, where the dev server looks', async () => {
  const project = projectIn();

  await buildDeviceAssets(FIXTURE, project, 'ios');

  // A debug shell names its bytecode by the script it was compiled from, so a
  // frame's file is one of these; the map beside it resolves to the app's files.
  const scratch = join(project.cache, 'mobile/ios');
  const app = JSON.parse(readFileSync(join(scratch, 'start.js.map'), 'utf8')) as {
    sources: string[];
  };

  assert.ok(app.sources.includes(FIXTURE), 'sources are absolute');

  for (const script of ['bootstrap.js', 'ui.js'])
    assert.ok(existsSync(join(scratch, script + '.map')), `${script} has its map`);
});

test('kuito symbolicate maps a release stack’s bytecode offsets to the app’s source', async () => {
  const project = projectIn();

  await buildDeviceAssets(FIXTURE, project, 'ios', { profile: 'release' });

  const maps = sourceMapDirectory(project, 'ios', '1.0.0', '1');
  const bytecode = new TraceMap(readFileSync(join(maps, 'app.hbc.map'), 'utf8'));
  const bundle = new TraceMap(readFileSync(join(maps, 'app.js.map'), 'utf8'));
  let offset: number | undefined;

  // The bytecode offset of the throw, found the way the CLI resolves one.
  eachMapping(bytecode, ({ generatedColumn, originalLine, originalColumn }) => {
    if (offset !== undefined || originalLine === null || originalColumn === null) return;

    const source = originalPositionFor(bundle, { line: originalLine, column: originalColumn });

    if (source.source?.endsWith('crash-app.tsx') && source.line === THROW_LINE)
      offset = generatedColumn;
  });

  assert.ok(offset !== undefined, 'the throw has a bytecode offset');

  const symbolicated = symbolicateReport(
    parseCrashReport(
      report(
        `Error: boom: pressed\n    at explode (address at kuito://app:1:${offset})\n    at anonymous (native)`,
      ),
    ),
    project,
  );

  assert.equal(symbolicated.message, 'Error: boom: pressed');

  const [thrower, caller] = symbolicated.frames;

  assert.equal(thrower?.name, 'explode');
  assert.equal(thrower?.kind, 'app');
  assert.equal(thrower?.line, THROW_LINE);
  assert.match(thrower?.file ?? '', /test\/fixtures\/crash-app\.tsx$/);
  assert.equal(caller?.kind, 'native');
});

test('a report from a build whose maps are gone names the directory to keep', () => {
  const project = projectIn();

  assert.throws(
    () =>
      symbolicateReport(
        parseCrashReport(report('Error\n    at f (address at kuito://app:1:9)')),
        project,
      ),
    /sourcemaps\/ios\/1\.0\.0-1.*kuito build --profile release/s,
  );
});

test('a report from an update resolves through that update’s maps, kept by its id', () => {
  const project = projectIn();
  const app = { id: 'dev.kuito.shell', version: '1.0.0', build: '1' };
  const update = report('Error\n    at f (address at kuito://app:1:9)', {
    app: { ...app, update: '0123456789abcdef' },
  });

  assert.equal(parseCrashReport(update).app.update, '0123456789abcdef');
  assert.equal(parseCrashReport(report('')).app.update, null);

  assert.throws(
    () => symbolicateReport(parseCrashReport(update), project),
    /sourcemaps\/ios\/update-0123456789abcdef.*kuito update build/s,
  );

  assert.throws(
    () => parseCrashReport({ ...update, app: { ...app, update: 7 } }),
    /app\.update must be a string/,
  );
});

test('a crash report is checked at the boundary, naming what is wrong', () => {
  assert.equal(parseCrashReport(report('')).app.build, '1');

  assert.throws(
    () => parseCrashReport({ ...report(''), kind: 'oops' }),
    /kind must be javascript or native/,
  );

  assert.throws(() => parseCrashReport({ ...report(''), app: { id: 'x' } }), /app\.version/);
  assert.throws(() => parseCrashReport('nope'), /a crash report is an object/);
});

test('kuito symbolicate takes the report file', () => {
  const args = parseArgs(['symbolicate', 'crash.json'], { cwd: '/app' });

  assert.equal(args.command, 'symbolicate');
  assert.equal(args.file, '/app/crash.json');
  assert.throws(() => parseArgs(['symbolicate']), /kuito symbolicate <report\.json>/);
});

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

test('both shells write a crash report with the same keys', () => {
  const swift = read('native/ios/App/KuitoCrashReports.swift');
  const kotlin = read('native/android/app/src/main/java/dev/kuito/runtime/KuitoCrashReports.kt');

  for (const key of CRASH_REPORT_KEYS) {
    assert.match(swift, new RegExp(`\\b${key}\\b`), `iOS writes ${key}`);
    assert.match(kotlin, new RegExp(`"${key}"`), `Android writes ${key}`);
  }
});

test('only the release shells report crashes and JS errors', () => {
  const shells = {
    ios: [
      'native/ios/App/Release/KuitoViewController.swift',
      'native/ios/App/Debug/KuitoViewController.swift',
    ],
    android: [
      'native/android/app/src/release/java/dev/kuito/runtime/KuitoActivity.kt',
      'native/android/app/src/debug/java/dev/kuito/runtime/KuitoActivity.kt',
    ],
  };

  for (const [release, debug] of Object.values(shells)) {
    const text = read(release ?? '');

    assert.match(text, /KuitoCrashReports[.\w]*\.install\(/, `${release} installs the crash hook`);
    assert.match(text, /KuitoCrashReports[.\w]*\.record\(/, `${release} reports JS errors`);
    assert.doesNotMatch(read(debug ?? ''), /KuitoCrashReports/, `${debug} has the LogBox instead`);
  }
});

const MOTION_FIXTURE = join(ROOT, 'test/fixtures/motion-app.tsx');
// `opacity={1 - offset.value / 200}` in the fixture: a UI-thread function.
const UI_LINE = 16;

/** The first bytecode offset whose bundle position `accept` takes, found as the CLI resolves one. */
function offsetOf(
  maps: string,
  name: string,
  accept: (source: string, line: number) => boolean,
): number | undefined {
  const bytecode = new TraceMap(readFileSync(join(maps, `${name}.hbc.map`), 'utf8'));
  const bundle = new TraceMap(readFileSync(join(maps, `${name}.js.map`), 'utf8'));
  let offset: number | undefined;

  eachMapping(bytecode, ({ generatedColumn, originalLine, originalColumn }) => {
    if (offset !== undefined || originalLine === null || originalColumn === null) return;

    const source = originalPositionFor(bundle, { line: originalLine, column: originalColumn });

    if (source.source !== null && source.line !== null && accept(source.source, source.line))
      offset = generatedColumn;
  });

  return offset;
}

test('a release build keeps the maps of both kernels and the UI bundle', async () => {
  const project = projectIn();

  await buildDeviceAssets(MOTION_FIXTURE, project, 'ios', { profile: 'release' });

  const maps = sourceMapDirectory(project, 'ios', '1.0.0', '1');

  for (const name of ['app-ui', 'ui', 'bootstrap'])
    for (const file of [`${name}.hbc.map`, `${name}.js.map`])
      assert.ok(existsSync(join(maps, file)), `${file} is kept`);

  for (const file of ['app-ui.hbc.map', 'ui.hbc.map', 'bootstrap.hbc.map'])
    assert.ok(
      !existsSync(join(project.cache, 'ios/Resources', file)),
      'the app ships no map: it would hand out its source',
    );
});

test('kuito symbolicate maps a release stack through the UI bundle and both kernels', async () => {
  const project = projectIn();

  await buildDeviceAssets(MOTION_FIXTURE, project, 'ios', { profile: 'release' });

  const maps = sourceMapDirectory(project, 'ios', '1.0.0', '1');
  const app = offsetOf(
    maps,
    'app-ui',
    (source, line) => source.endsWith('motion-app.tsx') && line === UI_LINE,
  );
  const kernel = offsetOf(maps, 'ui', (source) => source.includes('src/ui-thread/'));
  const bootstrap = offsetOf(maps, 'bootstrap', (source) => source.includes('src/runtime/'));

  assert.ok(app !== undefined, 'the UI function has a bytecode offset');
  assert.ok(kernel !== undefined, 'the UI kernel has bytecode offsets');
  assert.ok(bootstrap !== undefined, 'the kernel has bytecode offsets');

  const { frames } = symbolicateReport(
    parseCrashReport(
      report(
        'Error: UI thread frame: boom\n' +
          `    at anonymous (address at kuito://ui/0a1b2c3d4e5f:1:${app})\n` +
          `    at frame (address at kuito://ui-kernel:1:${kernel})\n` +
          `    at dispatch (address at kuito://bootstrap:1:${bootstrap})`,
      ),
    ),
    project,
  );

  const [inApp, inKernel, inBootstrap] = frames;

  assert.equal(inApp?.kind, 'app');
  assert.equal(inApp?.line, UI_LINE);
  assert.match(inApp?.file ?? '', /test\/fixtures\/motion-app\.tsx$/);

  assert.equal(inKernel?.kind, 'kuito');
  assert.match(inKernel?.file ?? '', /src\/ui-thread\/.+\.ts$/);

  assert.equal(inBootstrap?.kind, 'kuito');
  assert.match(inBootstrap?.file ?? '', /src\/runtime\/.+\.ts$/);
});
