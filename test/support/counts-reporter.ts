// A reporter for Node's test runner that writes the run's totals as JSON.
// Loaded by the `node --test` that `kuito test` starts (test-counts.ts).
import type { TestEvent } from 'node:test/reporters';

export default async function* countsReporter(source: AsyncIterable<TestEvent>) {
  for await (const event of source)
    // Each file's own summary names it; the run's does not.
    if (event.type === 'test:summary' && event.data.file === undefined)
      yield JSON.stringify(event.data);
}
