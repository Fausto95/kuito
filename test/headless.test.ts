import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import type { FontTable } from '../src/tests/fonts.ts';
import type { ModuleFakes } from '../src/tests/modules.ts';
import { replay } from '../src/tests/replay.ts';
import { headlessApp } from './support/headless.ts';
import { countingTests } from './support/test-counts.ts';

// The headless host (docs/testing.md): apps' tests through `kuito test`,
// golden replays of a device's recording, and Reel's Discover screen against
// the frames an iPhone 18 Pro simulator gave it.

const fixtures = join(ROOT, 'test/fixtures/headless');

/** UIKit's metrics for every face Discover's labels use, measured on the simulator. */
const iosFonts: FontTable = JSON.parse(readFileSync(join(fixtures, 'ios-fonts.json'), 'utf8'));

function kuitoTest(directory: string) {
  const counting = countingTests();
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts/kuito.ts'), 'test'], {
    cwd: directory,
    env: counting.env,
    encoding: 'utf8',
  });

  return { ...run, counts: counting.read() };
}

test('kuito test runs an app’s tests on the headless host', () => {
  const run = kuitoTest(join(fixtures, 'app'));

  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(run.counts, { passed: 26, failed: 0 });
});

test('a failing test fails the run and names its file and line', () => {
  const run = kuitoTest(join(fixtures, 'failing'));

  assert.equal(run.status, 1);
  assert.match(run.stdout, /No view shows the text Elsewhere/);
  assert.match(run.stdout, /failing\/tests\/failing\.test\.tsx:8:20/);
  assert.match(run.stdout, /failing\/tests\/failing\.test\.tsx:14:10/);
  assert.deepEqual(run.counts, { passed: 0, failed: 2 });
});

/** The lines of two trees whose frames differ by more than `tolerance` points, or that differ otherwise. */
function differences(expected: string, actual: string, tolerance: number): string[] {
  const frame = /^(.* )(-?[\d.]+),(-?[\d.]+) (-?[\d.]+)x(-?[\d.]+)(.*)$/;
  const want = expected.split('\n');
  const got = actual.split('\n');

  return want
    .flatMap((line, index) => {
      const other = got[index] ?? '';

      if (line === other) return [];

      const a = frame.exec(line);
      const b = frame.exec(other);
      const near =
        a &&
        b &&
        a[1] === b[1] &&
        a[6] === b[6] &&
        [2, 3, 4, 5].every((at) => Math.abs(Number(a[at]) - Number(b[at])) <= tolerance);

      return near ? [] : [`line ${index + 1}: expected ${line}, got ${other}`];
    })
    .concat(got.length === want.length ? [] : [`${want.length} lines expected, got ${got.length}`]);
}

test('a recording replays headlessly to the tree its device left', async () => {
  const { tree, recorded } = await replay(join(fixtures, 'reel-discover.krec'), {
    fonts: iosFonts,
  });

  assert.ok(recorded);
  assert.deepEqual(differences(recorded, tree, 0), []);
});

test('Discover renders headlessly with the simulator’s frames, within a point', async () => {
  const shows = readFileSync(join(fixtures, 'tvmaze-shows-page-0.json'), 'utf8');
  const requests: string[] = [];
  // What the simulator answered when the recording was made.
  const host = await headlessApp(join(ROOT, 'demo/app'), {
    fonts: iosFonts,
    fetch: ({ url }) => {
      requests.push(url);

      return { headers: { 'content-type': 'application/json' }, body: shows };
    },
    modules: { Haptics: { isSupported: () => false }, Clipboard: { hasText: false } },
  });
  const simulator = readFileSync(join(fixtures, 'reel-discover.krec.tree'), 'utf8');

  assert.deepEqual(requests, ['https://api.tvmaze.com/shows?page=0']);
  assert.deepEqual(differences(simulator, host.renderer.describeTree(), 1), []);
});

test('the app lays out in its first language’s direction, into its screens', async () => {
  const locale = (textDirection: 'ltr' | 'rtl') => ({
    Localization: { locales: [{ languageTag: 'x', textDirection }], calendars: [] },
  });
  const firstBox = async (modules: ModuleFakes) => {
    const host = await headlessApp(join(ROOT, 'test/fixtures/rtl-app.tsx'), { modules });
    const box = [...host.renderer.views.values()].find((view) => view.kind === 'Box');

    assert.ok(box, 'the screen shows its Box');

    return host.renderer.frame(box).x;
  };

  assert.equal(await firstBox({}), 10, 'left to right without a language that says otherwise');
  assert.equal(await firstBox(locale('ltr')), 10);
  assert.equal(await firstBox(locale('rtl')), 342, 'the inline start is the right in Arabic');
});
