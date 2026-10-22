import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { benchmarkScript, runBenchmarkScript } from '../scripts/benchmark-kernel.ts';

const script = benchmarkScript('release');

test('the kernel benchmarks run as one script on a host, each case timed', async () => {
  const results = await runBenchmarkScript(await script, {
    rounds: 1,
    scale: 0.05,
  });

  assert.deepEqual(
    results.map((result) => result.name),
    [
      'signal-1000-bindings',
      'signal-1000-computeds',
      'reconcile-reverse-1000',
      'reconcile-move-1000',
      'plan-mount-1000',
      'plan-replan-1000',
      'commit-props-10',
      'commit-props-50',
      'commit-props-200',
    ],
  );

  assert.ok(results.every((result) => result.microseconds > 0 && result.iterations >= 1));
});

test('a case nobody wrote fails the run, naming it', async () => {
  await assert.rejects(
    runBenchmarkScript(await script, { only: 'nothing' }),
    /No kernel benchmark is named nothing/,
  );
});
