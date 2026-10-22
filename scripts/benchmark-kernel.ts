#!/usr/bin/env node
/**
 * The kernel microbenchmarks (benchmarks/kernel/README.md): the kernel, then
 * the cases in benchmarks/kernel/cases.ts, as one script a host evaluates.
 * Node runs it here in `node:vm`, with a host that drops the kernel's batches;
 * `--out` writes the script for a device's Hermes to run later.
 *
 *   node scripts/benchmark-kernel.ts [--profile release|dev] [--case <name>]
 *     [--rounds 7] [--scale 1] [--json] [--out dist/benchmarks/kernel.js]
 *
 * Node's JIT, not Hermes: compare builds with each other, never these times
 * with a device's.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runInNewContext } from 'node:vm';
import { bundleKernel, type KernelProfile } from '../src/dev/kernel.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BENCH_ENTRY = resolve(ROOT, 'benchmarks/kernel/main.ts');

interface CaseResult {
  name: string;
  does: string;
  iterations: number;
  microseconds: number;
}

export interface KernelBenchmarkOptions {
  profile?: KernelProfile;
  only?: string;
  rounds?: number;
  scale?: number;
}

/** The kernel and the benchmark cases as one ES2022 script, as a device would evaluate it. */
export async function benchmarkScript(profile: KernelProfile): Promise<string> {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: BENCH_ENTRY,
    tsconfig: false,
    transform: { target: 'es2022' },
  });

  try {
    const { output } = await bundle.generate({ format: 'iife' });

    if (output.length !== 1 || output[0].type !== 'chunk')
      throw new Error('Expected one chunk for ' + BENCH_ENTRY);

    return (await bundleKernel(profile)) + '\n' + output[0].code;
  } finally {
    await bundle.close();
  }
}

/** Runs `script` in a fresh `node:vm` context and resolves with its results. */
export function runBenchmarkScript(
  script: string,
  { only, rounds, scale }: Omit<KernelBenchmarkOptions, 'profile'> = {},
): Promise<CaseResult[]> {
  return new Promise((done, fail) => {
    const host = {
      __kuitoHostCommit() {},
      __kuitoBenchOptions: JSON.stringify({ only, rounds, scale }),
      __kuitoBenchNow: () => performance.now(),
      __kuitoBenchReport(json: string) {
        const report: { results?: CaseResult[]; error?: string } = JSON.parse(json);

        if (report.error !== undefined || !report.results)
          fail(new Error('The kernel benchmarks failed: ' + report.error));
        else done(report.results);
      },
    };

    runInNewContext(script, host);
  });
}

async function main() {
  const { values: options } = parseArgs({
    options: {
      profile: { type: 'string', default: 'release' },
      case: { type: 'string' },
      rounds: { type: 'string', default: '7' },
      scale: { type: 'string', default: '1' },
      json: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  });

  if (options.profile !== 'release' && options.profile !== 'dev')
    throw new Error('--profile is release or dev');

  const profile: KernelProfile = options.profile;
  const script = await benchmarkScript(profile);

  if (options.out) {
    mkdirSync(dirname(resolve(options.out)), { recursive: true });
    writeFileSync(options.out, script);
  }

  const results = await runBenchmarkScript(script, {
    only: options.case,
    rounds: Number(options.rounds),
    scale: Number(options.scale),
  });

  console.log(
    options.json
      ? JSON.stringify({ profile, node: process.version, results })
      : [
          `kernel ${profile}, Node ${process.version}`,
          '',
          '| case | µs per iteration | what one iteration does |',
          '| ---- | ---------------: | ----------------------- |',
          ...results.map(
            ({ name, microseconds, does }) => `| ${name} | ${microseconds.toFixed(1)} | ${does} |`,
          ),
        ].join('\n'),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
