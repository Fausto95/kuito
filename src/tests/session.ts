// The headless host the running test file renders into: `kuito test` starts
// one per file (src/tests/runner.ts) before the file's code runs.
import type { HeadlessHost } from './host.ts';

let current: HeadlessHost | null = null;

export function useHost(host: HeadlessHost): void {
  current = host;
}

export function currentHost(): HeadlessHost {
  if (!current)
    throw new Error('kuito/tests runs in the tests `kuito test` runs (docs/testing.md)');

  return current;
}
