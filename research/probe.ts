#!/usr/bin/env node
/**
 * Real external-tool feasibility probes. BLOCKED != PASS: absent dependencies,
 * external binaries, or incompatible CLI options are surfaced in a JSON report.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const hermes = process.env.HERMES_BIN || 'hermes';
const shermes = process.env.SHERMES_BIN || 'shermes';
const selection = process.argv[2] || 'all';
const modes = ['typed', 'aot', 'bytecode', 'npm', 'npm-bytecode'];
const requested =
  selection === 'all'
    ? modes
    : selection === 'core'
      ? ['bytecode', 'npm', 'npm-bytecode']
      : [selection];

if (requested.some((mode) => !modes.includes(mode))) {
  console.error(`Usage: node research/probe.ts [all|core|${modes.join('|')}]`);
  process.exit(2);
}

await mkdir(dist, { recursive: true });

interface CommandRun {
  command: string[];
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error: string | null;
  missing: boolean;
}

interface ProbeResult {
  status: string;
  reason?: string;
  [detail: string]: unknown;
}

type NpmBundle =
  | { status: 'pass'; output: string; sizeBytes: number | null }
  | { status: 'blocked' | 'fail'; reason: string };

const results: Record<string, ProbeResult> = {};
const small = (value: string | null) => (value ?? '').slice(-4000);
const failure = (error: unknown) => (error instanceof Error && error.stack) || String(error);

function command(bin: string, args: string[], { cwd = root }: { cwd?: string } = {}): CommandRun {
  const started = performance.now();
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C' },
  });

  const error: NodeJS.ErrnoException | undefined = result.error;

  return {
    command: [bin, ...args],
    exitCode: result.status,
    durationMs: Math.round(performance.now() - started),
    stdout: small(result.stdout),
    stderr: small(result.stderr),
    error: error?.message || null,
    missing: error?.code === 'ENOENT',
  };
}

function check(run: CommandRun, marker: string, description: string): ProbeResult {
  return {
    status: run.missing
      ? 'blocked'
      : run.exitCode === 0 && run.stdout.includes(marker)
        ? 'pass'
        : 'fail',
    description,
    ...run,
    reason: run.missing ? `Missing executable: ${run.command[0]}` : undefined,
  };
}

async function bytes(path: string) {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function bundleNpm(): Promise<NpmBundle> {
  let rolldown: typeof import('rolldown').rolldown;

  try {
    ({ rolldown } = await import('rolldown'));
  } catch (error) {
    return {
      status: 'blocked',
      reason: `Missing Rolldown dependency; run npm install: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const output = resolve(dist, 'npm-bundle.js');

  try {
    const bundle = await rolldown({ input: resolve(root, 'research/experiments/npm-entry.js') });

    await bundle.write({ format: 'iife', file: output });
    await bundle.close();

    return { status: 'pass', output, sizeBytes: await bytes(output) };
  } catch (error) {
    return { status: 'fail', reason: failure(error) };
  }
}

async function runProbe(mode: string): Promise<ProbeResult> {
  if (mode === 'typed') {
    return check(
      command(shermes, ['-parse-ts', '-exec', 'research/experiments/typed.ts']),
      'KUITO_TYPED_PROBE_PASS',
      'Typed input compiled and executed by Static Hermes',
    );
  }

  if (mode === 'aot') {
    return check(
      command(shermes, ['-exec', 'research/experiments/plain.js']),
      'KUITO_AOT_PROBE_PASS',
      'Untyped JavaScript executed through Static Hermes native AOT',
    );
  }

  if (mode === 'bytecode') {
    const binary = resolve(dist, 'bytecode.hbc');
    const compile = command(hermes, [
      '-emit-binary',
      '-out',
      binary,
      'research/experiments/bytecode.js',
    ]);

    if (compile.missing)
      return { status: 'blocked', reason: `Missing executable: ${hermes}`, compile };

    if (compile.exitCode !== 0) return { status: 'fail', reason: 'HBC generation failed', compile };

    const execute = command(hermes, [binary]);

    return {
      ...check(execute, 'KUITO_BYTECODE_PROBE_PASS', 'Hermes compiled and interpreted bytecode'),
      compile,
      artifactSizeBytes: await bytes(binary),
    };
  }

  if (mode === 'npm' || mode === 'npm-bytecode') {
    const bundle = await bundleNpm();

    if (bundle.status !== 'pass') return bundle;

    if (mode === 'npm') {
      const execute = command(process.execPath, [bundle.output]);

      return {
        ...check(
          execute,
          'KUITO_NPM_PROBE_PASS',
          'Rolldown bundled unmodified lodash-es, executed in Node',
        ),
        bundle,
      };
    }

    const binary = resolve(dist, 'npm-bundle.hbc');
    const compile = command(hermes, ['-emit-binary', '-out', binary, bundle.output]);

    if (compile.missing)
      return { status: 'blocked', reason: `Missing executable: ${hermes}`, bundle, compile };

    if (compile.exitCode !== 0)
      return { status: 'fail', reason: 'npm HBC compilation failed', bundle, compile };

    const execute = command(hermes, [binary]);

    return {
      ...check(execute, 'KUITO_NPM_PROBE_PASS', 'Rolldown + lodash-es executed as Hermes bytecode'),
      bundle,
      compile,
      artifactSizeBytes: await bytes(binary),
    };
  }

  throw new Error(`Unknown probe: ${mode}`);
}

for (const mode of requested) {
  let result: ProbeResult;

  try {
    result = await runProbe(mode);
  } catch (error) {
    result = { status: 'fail', reason: failure(error) };
  }

  results[mode] = result;

  console.log(
    `[${result.status.toUpperCase()}] ${mode}${result.reason ? ': ' + result.reason : ''}`,
  );
}

const report = {
  note: 'Stage 0 experiments only. These are NOT native mobile UI or in-process Hermes HMR tests.',
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  tools: { hermes, shermes, hermesSha: process.env.HERMES_SHA || 'NOT_PINNED' },
  results,
};
const reportFile = resolve(
  dist,
  selection === 'all' ? 'stage0-results.json' : `stage0-${selection}.json`,
);

await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(`Report: ${reportFile}`);
if (Object.values(results).some((result) => result.status !== 'pass')) process.exitCode = 1;
