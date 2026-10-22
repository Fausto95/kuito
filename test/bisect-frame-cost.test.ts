import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import { judge, medians, parseMaxima, parseReadings } from '../scripts/bisect-frame-cost.ts';

// scripts/bisect-frame-cost.ts judges a commit for `git bisect run`
// (docs/performance.md#bisecting-frame-cost) by the lines its runs print.

const output = [
  'Test Case started.',
  'kuito-cost-replay ios s1-tap batches=31 records=1204 frames=29 p50=0.41 p95=6.80 max=21.30 over=1 interval=16.67',
  'kuito-frame-cost s1-tap layoutPasses=2 labelRedraws=0',
  'Test Case passed (3.1 seconds).',
].join('\n');

test('a run’s cost replay and counter lines are its readings', () => {
  assert.deepEqual(parseReadings(output), [
    {
      label: 'ios s1-tap',
      values: {
        batches: 31,
        records: 1204,
        frames: 29,
        p50: 0.41,
        p95: 6.8,
        max: 21.3,
        over: 1,
        interval: 16.67,
      },
    },
    { label: 's1-tap', values: { layoutPasses: 2, labelRedraws: 0 } },
  ]);
});

test('repeated replays of a recording read as their median', () => {
  const runs = parseReadings(
    ['p95=9.1 over=2', 'p95=6.2 over=0', 'p95=7.0 over=1']
      .map((values) => `kuito-cost-replay ios s1-tap ${values}`)
      .join('\n'),
  );

  assert.deepEqual(medians(runs), [{ label: 'ios s1-tap', values: { p95: 7, over: 1 } }]);
});

test('a commit is bad when any reading crosses its limit, naming it', () => {
  const readings = parseReadings(output);

  assert.deepEqual(judge(readings, parseMaxima(['p95=8', 'layoutPasses=0'])), {
    verdict: 'bad',
    over: ['s1-tap layoutPasses=2 (max 0)'],
  });

  assert.deepEqual(judge(readings, parseMaxima(['p95=8', 'layoutPasses=2'])), {
    verdict: 'good',
    over: [],
  });
});

test('a limit named after a label holds only that label’s readings', () => {
  const readings = parseReadings(
    [
      'kuito-frame-cost reel-idle nodesFramed=1484352',
      'kuito-frame-cost reel-open nodesFramed=84440',
    ].join('\n'),
  );

  assert.deepEqual(judge(readings, parseMaxima(['reel-open.nodesFramed=70000'])), {
    verdict: 'bad',
    over: ['reel-open nodesFramed=84440 (max 70000)'],
  });

  assert.deepEqual(judge(readings, parseMaxima(['reel-open.nodesFramed=90000'])).verdict, 'good');
});

test('a commit no reading can judge is skipped, not passed', () => {
  assert.deepEqual(judge(parseReadings('the build printed nothing'), parseMaxima(['p95=8'])), {
    verdict: 'skip',
    over: [],
  });
});

test('a limit must be a reading and a number', () => {
  assert.throws(() => parseMaxima(['p95']), /--max p95: expected \[<label>.\]<reading>=<number>/);
  assert.throws(() => parseMaxima(['p95=fast']), /--max p95=fast/);
  assert.throws(() => judge([], {}), /pass at least one --max/);
});

test('a copy run through a symlinked path still judges, outside a checkout it stops the bisect', () => {
  // macOS's temporary directories sit under symlinks (/var, /tmp), where bisect's copy goes.
  const directory = mkdtempSync(join(tmpdir(), 'bisect-frame-cost-'));

  try {
    copyFileSync(
      join(ROOT, 'scripts/bisect-frame-cost.ts'),
      join(directory, 'bisect-frame-cost.ts'),
    );

    const run = spawnSync(
      process.execPath,
      [join(directory, 'bisect-frame-cost.ts'), '--max', 'p95=8'],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    );

    assert.equal(run.status, 128, run.stderr);
    assert.match(run.stderr, /run it inside the Kuito checkout being bisected/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
