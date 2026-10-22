#!/usr/bin/env node
/**
 * What each commit costs on the UI thread, from cold launches of the shell
 * with commit logging on: host calls per job, commit time percentiles, the
 * first render's batch and prop parses (benchmarks/README.md); and, for an
 * app that animates, the most batches the frame handoff and motion values
 * the mirror held.
 *
 *   node scripts/benchmark-commits.ts --platform ios --device <udid> --port 8850
 *     [--runs 5] [--seconds 8] [--label after]
 *
 * A dev server must already serve the app to measure on `--port`
 * (`kuito dev --entry first-render.tsx`), and the shell must be installed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  frameBounds,
  parseCommits,
  parseFrames,
  summarize,
  type CommitSummary,
} from './commit-stats.ts';

const APP = 'dev.kuito.shell';
const ACTIVITY = 'dev.kuito.runtime.KuitoActivity';

const { values: options } = parseArgs({
  options: {
    platform: { type: 'string' },
    device: { type: 'string' },
    port: { type: 'string', default: '8765' },
    runs: { type: 'string', default: '5' },
    seconds: { type: 'string', default: '8' },
    label: { type: 'string', default: 'run' },
  },
});

const { platform, device: target } = options;

if ((platform !== 'ios' && platform !== 'android') || !target)
  throw new Error(
    'Usage: --platform ios|android --device <id> [--port] [--runs] [--seconds] [--label]',
  );

const device: string = target;
const seconds = Number(options.seconds);
const adb = (...args: string[]) =>
  spawnSync('adb', ['-s', device, ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

/** Waits `ms` while the app runs; the run's length is the measurement. */
const elapse = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runIOS(): Promise<string> {
  const stream = spawn('xcrun', [
    'simctl',
    'spawn',
    device,
    'log',
    'stream',
    '--style',
    'compact',
    '--predicate',
    'eventMessage CONTAINS "KuitoCommit"',
  ]);
  let log = '';

  stream.stdout.on('data', (chunk: Buffer) => (log += chunk.toString()));
  await elapse(1000);

  const launched = spawnSync(
    'xcrun',
    ['simctl', 'launch', '--terminate-running-process', device, APP],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        SIMCTL_CHILD_KUITO_DEV_URL: `ws://127.0.0.1:${options.port}`,
        SIMCTL_CHILD_KUITO_COMMIT_LOG: '1',
      },
    },
  );

  if (launched.status !== 0) throw new Error('simctl launch failed: ' + launched.stderr);

  await elapse(seconds * 1000);
  stream.kill();

  return log;
}

async function runAndroid(): Promise<string> {
  adb('shell', 'am', 'force-stop', APP);
  adb('logcat', '-c');

  const launched = adb(
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${APP}/${ACTIVITY}`,
    '--es',
    'kuito_dev_url',
    `ws://10.0.2.2:${options.port}`,
    '--ez',
    'kuito_commit_log',
    'true',
  );

  if (launched.status !== 0) throw new Error('am start failed: ' + launched.stderr);

  await elapse(seconds * 1000);

  return adb('logcat', '-d', '-s', 'Kuito:I').stdout;
}

const runs: CommitSummary[] = [];

for (let run = 0; run < Number(options.runs); run++) {
  const log = platform === 'ios' ? await runIOS() : await runAndroid();
  const summary = summarize(parseCommits(log));
  // How far the frame handoff and the motion mirror grew: bounded over a long
  // run of an animating app (benchmarks/README.md).
  const frames = frameBounds(parseFrames(log));

  runs.push(summary);
  console.log(`run ${run + 1}:`, JSON.stringify(summary), frames ? 'frames: ' + JSON.stringify(frames) : '');
}

const median = (pick: (summary: CommitSummary) => number) => {
  const values = runs.map(pick).sort((a, b) => a - b);

  return values[Math.floor(values.length / 2)];
};

const row = {
  label: options.label,
  runs: runs.length,
  maxCalls: Math.max(...runs.map((summary) => summary.maxCalls)),
  meanCalls: median((summary) => summary.meanCalls),
  p50Ms: median((summary) => summary.p50Ms),
  p95Ms: median((summary) => summary.p95Ms),
  totalMs: median((summary) => summary.totalMs),
  firstRenderMs: median((summary) => summary.firstRenderMs),
  firstRenderRecords: median((summary) => summary.firstRenderRecords),
  parses: median((summary) => summary.parses),
};
const folder = join('dist', 'benchmarks');

mkdirSync(folder, { recursive: true });

writeFileSync(
  join(folder, `commits-${platform}-${options.label}.json`),
  JSON.stringify({ row, runs }, null, 2) + '\n',
);

console.log(
  `| ${row.label} | ${row.runs} | ${row.maxCalls} | ${row.meanCalls.toFixed(2)} | ${row.p50Ms} | ${row.p95Ms} | ${row.totalMs.toFixed(1)} | ${row.firstRenderMs} (${row.firstRenderRecords} records) | ${row.parses} |`,
);
