#!/usr/bin/env node
/**
 * Judges one commit for `git bisect run` by what its frames cost
 * (docs/performance.md#bisecting-frame-cost): it applies `--patch` files
 * (F8's build flags, counters a range predates), cost-replays `--replay`
 * recordings on the simulator, runs `--measure` commands, and exits 1 when a
 * reading crosses its `--max`, 0 when none does, 125 (skip) when the commit
 * cannot be judged. It leaves the tree as it found it.
 *
 *   cp scripts/bisect-frame-cost.ts "$TMPDIR/"
 *   git bisect start <bad> <good>
 *   git bisect run node "$TMPDIR/bisect-frame-cost.ts" --replay s1.krec --max p95=8
 *     [--patch flags.patch[,older.patch]] [--measure '<command>'] [--runs 3] [--log readings.jsonl]
 *
 * Bisect checks out older commits, so the script runs from a copy outside the
 * tree and imports nothing from it. A commit without the cost replay borrows
 * its files from `--harness` (main by default).
 */
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** One line a cost replay (`kuito-cost-replay`) or a counter run (`kuito-frame-cost`) printed. */
export interface Reading {
  /** What it measured: the platform and recording, or the interaction. */
  label: string;
  values: Record<string, number>;
}

const READING = /^(kuito-cost-replay|kuito-frame-cost) (\S+(?: \S+)*?)((?: \w+=-?[\d.]+)+)$/;

/** The readings in a run's output; other lines are ignored. */
export function parseReadings(output: string): Reading[] {
  return output.split('\n').flatMap((line) => {
    const match = READING.exec(line.trim());

    if (!match) return [];

    const values: Record<string, number> = {};

    for (const pair of match[3].trim().split(' ')) {
      const [key, value] = pair.split('=');

      values[key] = Number(value);
    }

    return [{ label: match[2], values }];
  });
}

/** `key=value` limits, as `--max` takes them. */
export function parseMaxima(pairs: string[]): Record<string, number> {
  return Object.fromEntries(
    pairs.map((pair) => {
      const [key, value, ...rest] = pair.split('=');
      const limit = Number(value);

      if (!key || rest.length || value === undefined || !Number.isFinite(limit))
        throw new Error(
          `--max ${pair}: expected [<label>.]<reading>=<number>, like p95=8 or s1-tap.p95=8`,
        );

      return [key, limit];
    }),
  );
}

/** Each reading's median value per key over repeated runs of the same label. */
export function medians(runs: Reading[]): Reading[] {
  const byLabel = new Map<string, Reading[]>();

  for (const reading of runs)
    byLabel.set(reading.label, [...(byLabel.get(reading.label) ?? []), reading]);

  return [...byLabel].map(([label, readings]) => {
    const keys = [...new Set(readings.flatMap((reading) => Object.keys(reading.values)))];
    const median = (key: string) => {
      const sorted = readings
        .map((reading) => reading.values[key])
        .filter((value) => value !== undefined);

      sorted.sort((a, b) => a - b);

      return sorted[Math.floor((sorted.length - 1) / 2)];
    };

    return { label, values: Object.fromEntries(keys.map((key) => [key, median(key)])) };
  });
}

/**
 * Where a commit stands: `bad` names each reading over its limit, `skip` a
 * commit with no reading of a limited key (a run that could not judge it).
 */
/**
 * The value `limit` names in `reading`: `p95` in every reading, or
 * `s1-tap.p95` only in the readings whose label ends with `s1-tap`.
 */
function limited(reading: Reading, limit: string): number | undefined {
  const dot = limit.lastIndexOf('.');
  const key = limit.slice(dot + 1);

  if (dot >= 0 && !reading.label.split(' ').includes(limit.slice(0, dot))) return undefined;

  return reading.values[key];
}

export function judge(
  readings: Reading[],
  maxima: Record<string, number>,
): { verdict: 'good' | 'bad' | 'skip'; over: string[] } {
  const limits = Object.keys(maxima);

  if (!limits.length)
    throw new Error('Nothing to judge by: pass at least one --max <reading>=<number>');

  if (!readings.some((reading) => limits.some((limit) => limited(reading, limit) !== undefined)))
    return { verdict: 'skip', over: [] };

  const over = readings.flatMap((reading) =>
    limits.flatMap((limit) => {
      const value = limited(reading, limit);

      return value !== undefined && value > maxima[limit]
        ? [
            `${reading.label} ${limit.slice(limit.lastIndexOf('.') + 1)}=${value} (max ${maxima[limit]})`,
          ]
        : [];
    }),
  );

  return { verdict: over.length ? 'bad' : 'good', over };
}

/** `git bisect run`'s exit codes: 125 skips the commit; above 127 stops the bisect. */
export const EXIT = { good: 0, bad: 1, skip: 125, abort: 128 } as const;

/** The cost replay's files, borrowed by commits that predate them. */
export const HARNESS = [
  'native/ios/Renderer/KuitoMutationBatch.h',
  'native/ios/Renderer/KuitoMutationBatch.mm',
  'native/ios/Renderer/KuitoMutationBatch+Mutations.h',
  'native/ios/Tests/KuitoReplayBatch.h',
  'native/ios/Tests/KuitoReplayBatch.mm',
  'native/ios/Tests/KuitoCostReplay.swift',
  'native/ios/Tests/KuitoCostReplayTests.swift',
];

const BRIDGING_HEADER = 'native/ios/Tests/KuitoRendererTests-Bridging-Header.h';
const TESTS_SPEC = 'native/ios/tests.yml';

class Skip extends Error {}

function run(
  command: string,
  args: string[],
  options: Omit<SpawnSyncOptionsWithStringEncoding, 'encoding'> = {},
) {
  const result = spawnSync(command, args, { maxBuffer: 1 << 28, ...options, encoding: 'utf8' });

  return { ok: result.status === 0, output: result.stdout + result.stderr };
}

const git = (...args: string[]) => run('git', args);

/** Puts the cost replay into a commit that lacks it: its files from `harness`, and the two lines that build them. */
function borrowHarness(harness: string) {
  if (existsSync('native/ios/Tests/KuitoCostReplayTests.swift')) return;

  for (const path of HARNESS) {
    const file = git('show', `${harness}:${path}`);

    if (!file.ok)
      throw new Skip(`${harness} has no ${path}: pass --harness <a commit with the cost replay>`);

    writeFileSync(path, file.output);
  }

  const header = readFileSync(BRIDGING_HEADER, 'utf8');

  if (!header.includes('KuitoReplayBatch.h'))
    writeFileSync(BRIDGING_HEADER, header + '#import "KuitoReplayBatch.h"\n');

  const spec = readFileSync(TESTS_SPEC, 'utf8');

  if (!spec.includes('../shared/ViewTable.cpp'))
    writeFileSync(
      TESTS_SPEC,
      spec.replace(
        '      - path: ../shared/layout\n',
        '      - path: ../shared/ViewTable.cpp\n      - path: ../shared/layout\n',
      ),
    );
}

/** The replay lines of `recordings` on the simulator, `runs` times each from one build. */
function replay(recordings: string[], device: string, runs: number): string {
  const project = [
    '-project',
    'native/ios/KuitoRendererTests.xcodeproj',
    '-scheme',
    'KuitoRendererTests',
  ];
  const destination = ['-destination', `platform=iOS Simulator,name=${device}`];

  if (!run('xcodegen', ['generate', '--spec', TESTS_SPEC]).ok) throw new Skip('xcodegen failed');

  const built = run('xcodebuild', ['build-for-testing', ...project, ...destination]);

  if (!built.ok)
    throw new Skip(
      `the renderer tests do not build:\n${built.output
        .split('\n')
        .filter((line) => line.includes('error:'))
        .join('\n')}`,
    );

  let output = '';

  for (const recording of recordings)
    for (let n = 0; n < runs; n++) {
      const tested = run(
        'xcodebuild',
        [
          'test-without-building',
          ...project,
          ...destination,
          '-only-testing:KuitoRendererTests/KuitoCostReplayTests/testCostOfYourRecording',
        ],
        { env: { ...process.env, TEST_RUNNER_KUITO_RECORDING: recording } },
      );

      // A recording replays only with the Kuito that recorded it: a commit it does not decode on is not judged.
      if (!tested.ok)
        throw new Skip(
          `${recording} did not replay:\n${tested.output
            .split('\n')
            .filter((line) => /error|KUITO_/.test(line))
            .join('\n')}`,
        );

      output += tested.output;
    }

  return output;
}

const untracked = () =>
  new Set(git('ls-files', '--others', '--exclude-standard').output.split('\n').filter(Boolean));

/** Back to the commit: its tracked files, and none of the files the step added. The user's own untracked files stay. */
function restore(before: Set<string>) {
  git('reset', '-q', '--hard', 'HEAD');

  const added = [...untracked()].filter((path) => !before.has(path));

  if (added.length) git('clean', '-fq', '--', ...added);
}

async function main() {
  const { values: options } = parseArgs({
    options: {
      replay: { type: 'string', multiple: true, default: [] },
      measure: { type: 'string', multiple: true, default: [] },
      patch: { type: 'string', multiple: true, default: [] },
      max: { type: 'string', multiple: true, default: [] },
      runs: { type: 'string', default: '3' },
      device: { type: 'string', default: 'iPhone 18 Pro' },
      harness: { type: 'string', default: 'main' },
      log: { type: 'string' },
    },
  });
  const maxima = parseMaxima(options.max);
  // Paths as the user typed them, before moving to the checkout's root.
  const patches = options.patch.map((choices) => choices.split(',').map((file) => resolve(file)));
  const recordings = options.replay.map((file) => resolve(file));
  const root = git('rev-parse', '--show-toplevel');

  if (!root.ok) {
    console.error('bisect-frame-cost: run it inside the Kuito checkout being bisected');
    process.exit(EXIT.abort);
  }

  process.chdir(root.output.trim());

  const commit = git('rev-parse', '--short', 'HEAD').output.trim();

  if (git('status', '--porcelain', '--untracked-files=no').output.trim()) {
    console.error(
      `bisect-frame-cost: ${commit} has uncommitted changes; commit or stash them before bisecting`,
    );

    process.exit(EXIT.abort);
  }

  const before = untracked();
  let output = '';

  try {
    for (const choices of patches) {
      // A patch a range predates comes in versions for its stretches: the first that applies.
      const applied = choices.find((patch) => git('apply', patch).ok);

      if (!applied) throw new Skip(`none of ${choices.join(', ')} applies`);
    }

    if (recordings.length) {
      borrowHarness(options.harness);
      output += replay(recordings, options.device, Number(options.runs));
    }

    for (const command of options.measure) {
      const measured = run('sh', ['-c', command]);

      if (!measured.ok) throw new Skip(`${command} failed:\n${measured.output.slice(-2000)}`);
      output += measured.output;
    }
  } catch (error) {
    if (!(error instanceof Skip)) throw error;
    console.error(`bisect-frame-cost: skipping ${commit}: ${error.message}`);
    process.exitCode = EXIT.skip;

    return;
  } finally {
    restore(before);
  }

  const readings = medians(parseReadings(output));
  const { verdict, over } = judge(readings, maxima);

  if (options.log)
    appendFileSync(options.log, JSON.stringify({ commit, verdict, readings }) + '\n');

  for (const reading of readings)
    console.log(
      `${commit} ${reading.label} ` +
        Object.entries(reading.values)
          .map(([key, value]) => `${key}=${value}`)
          .join(' '),
    );

  console.log(`${commit} ${verdict}${over.length ? ': ' + over.join('; ') : ''}`);
  process.exitCode = EXIT[verdict];
}

// Real paths: the copy usually sits under a symlink ($TMPDIR, /tmp on macOS).
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
