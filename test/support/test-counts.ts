// What a `kuito test` run counted, read from Node's test runner rather than
// from its reporter's text: on a pipe Node 22 reports TAP and Node 24 the
// spec reporter, and their summaries read differently.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vite-plus/test';

const reporter = new URL('./counts-reporter.ts', import.meta.url).href;

export interface TestCounts {
  passed: number;
  failed: number;
}

/**
 * `env` with which the `node --test` a `kuito test` starts reports to its
 * output with the spec reporter on every Node version, and writes its
 * totals for `read` once it has exited.
 */
export function countingTests(env: NodeJS.ProcessEnv = process.env) {
  const directory = mkdtempSync(join(tmpdir(), 'kuito-test-counts-'));
  const destination = join(directory, 'counts.json');
  const options = [
    env.NODE_OPTIONS ?? '',
    '--test-reporter=spec --test-reporter-destination=stdout',
    `--test-reporter=${reporter} --test-reporter-destination=${JSON.stringify(destination)}`,
  ];

  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));

  return {
    env: { ...env, NODE_OPTIONS: options.join(' ').trim() },
    read(): TestCounts {
      const { counts }: { counts: TestCounts } = JSON.parse(readFileSync(destination, 'utf8'));

      return { passed: counts.passed, failed: counts.failed };
    },
  };
}
