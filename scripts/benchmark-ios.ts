#!/usr/bin/env node
/**
 * Cold-start benchmark for the installed shell on an iOS simulator: the iOS
 * counterpart of benchmark-android.ts's `launch` scenario. Each run
 * terminates the app, launches it and reads the
 * `Kuito evaluate` and `Kuito commit` signposts (KuitoTrace.swift) from the
 * simulator's log until the app stops committing. See docs/performance.md.
 *
 *   node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" [--runs 5]
 *     [--label after] [--port 8765]
 *
 * Without --port the app starts offline, from its bundled scripts alone.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { median, type LaunchTimeline } from './frame-stats.ts';
import { iosLaunchTimeline } from './ios-launch.ts';

const { values: options } = parseArgs({
  options: {
    device: { type: 'string' },
    runs: { type: 'string', default: '5' },
    label: { type: 'string', default: 'run' },
    port: { type: 'string' },
    app: { type: 'string', default: 'dev.kuito.shell' },
    process: { type: 'string', default: 'KuitoIOS' },
  },
});

if (!options.device) throw Error('Pass --device, a booted simulator by name or UDID');

const device = options.device;

function simctl(...args: string[]) {
  return spawnSync('xcrun', ['simctl', ...args], { encoding: 'utf8' });
}

/** The app is idle once no commit has landed for this long. */
const QUIET_MS = 3000;

async function launch(): Promise<LaunchTimeline> {
  simctl('terminate', device, options.app);

  const stream = spawn('xcrun', [
    'simctl',
    'spawn',
    device,
    'log',
    'stream',
    '--signpost',
    '--style',
    'ndjson',
    '--level',
    'debug',
    '--predicate',
    `process == "${options.process}"`,
  ]);
  let text = '';
  let lastCommit = 0;

  stream.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    text += chunk;
    if (chunk.includes('"Kuito commit"')) lastCommit = Date.now();
  });

  try {
    const ready = Date.now() + 10_000;

    while (!text.includes('Filtering the log data')) {
      if (Date.now() > ready) throw Error('log stream did not start');
      await sleep(50);
    }

    const env = {
      ...process.env,
      ...(options.port && { SIMCTL_CHILD_KUITO_DEV_URL: `ws://127.0.0.1:${options.port}` }),
    };
    const launched = spawnSync('xcrun', ['simctl', 'launch', device, options.app], {
      encoding: 'utf8',
      env,
    });

    if (launched.status !== 0) throw Error(`The app did not launch:\n${launched.stderr}`);

    const deadline = Date.now() + 60_000;

    while (!lastCommit || Date.now() - lastCommit < QUIET_MS) {
      if (Date.now() > deadline) throw Error(`${options.app} kept committing for 60s`);
      await sleep(100);
    }
  } finally {
    stream.kill();
  }

  return iosLaunchTimeline(text);
}

const runs: LaunchTimeline[] = [];

for (let run = 1; run <= Number(options.runs); run++) {
  const timeline = await launch();

  runs.push(timeline);
  console.log(`${options.label} run ${run}: ${JSON.stringify(timeline)}`);
}

const summary = {
  label: options.label,
  device,
  runs,
  median: {
    contentMs: Math.round(median(runs.map((run) => run.contentMs))),
    evaluateMs: Math.round(median(runs.map((run) => run.evaluateMs))),
  },
};

mkdirSync('dist/benchmarks', { recursive: true });
writeFileSync(`dist/benchmarks/ios-launch-${options.label}.json`, JSON.stringify(summary, null, 2));
console.log(`${options.label} median: ${JSON.stringify(summary.median)}`);
