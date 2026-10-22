import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { frameBounds, parseCommits, parseFrames, summarize } from '../scripts/commit-stats.ts';

const LOG = `
2026-10-18 22:30:01.100 KuitoIOS[123:456] KuitoCommit records=120 calls=1 ms=8.500 parses=0
10-18 22:30:01.200  4321  4321 I Kuito  : KuitoCommit records=6 calls=1 ms=0.400 parses=2
unrelated line
10-18 22:30:01.300  4321  4321 I Kuito  : KuitoCommit records=8 calls=2 ms=0.600 parses=0
`;

test('commit lines from either platform parse; others are skipped', () => {
  assert.deepEqual(parseCommits(LOG), [
    { records: 120, calls: 1, ms: 8.5, parses: 0 },
    { records: 6, calls: 1, ms: 0.4, parses: 2 },
    { records: 8, calls: 2, ms: 0.6, parses: 0 },
  ]);
});

test('a summary has host calls per job, commit time percentiles and the first render', () => {
  const summary = summarize(parseCommits(LOG));

  assert.equal(summary.batches, 3);
  assert.equal(summary.maxCalls, 2);
  assert.equal(summary.p50Ms, 0.6);
  assert.equal(summary.p95Ms, 8.5);
  assert.equal(summary.firstRenderRecords, 120);
  assert.equal(summary.firstRenderMs, 8.5);
  assert.equal(summary.parses, 2);
});

test('no commit lines is an error that says why', () => {
  assert.throws(() => summarize([]), /commit logging/);
});

const FRAMES = `
2026-10-19 02:30:01.000 KuitoIOS[123:456] KuitoCommitFrames pending=0 mirror=4 frames=10 json=40 stringified=900
10-19 02:30:02.000  4321  4321 I Kuito  : KuitoCommitFrames pending=2 mirror=6 frames=70 json=160 stringified=1500
2026-10-19 02:30:02.500 KuitoIOS[123:456] KuitoCommit records=8 calls=1 ms=0.600 parses=0
10-19 02:30:03.000  4321  4321 I Kuito  : KuitoCommitFrames pending=1 mirror=6 frames=130 json=280 stringified=2100
`;

test('frame gauges parse apart from commits; their bounds are the most each reached', () => {
  assert.deepEqual(parseFrames(FRAMES), [
    { pending: 0, mirror: 4, frames: 10, jsonParses: 40, bytesStringified: 900 },
    { pending: 2, mirror: 6, frames: 70, jsonParses: 160, bytesStringified: 1500 },
    { pending: 1, mirror: 6, frames: 130, jsonParses: 280, bytesStringified: 2100 },
  ]);

  assert.equal(parseCommits(FRAMES).length, 1);

  assert.deepEqual(frameBounds(parseFrames(FRAMES)), {
    samples: 3,
    maxPending: 2,
    maxMirror: 6,
    lastMirror: 6,
    // Between the first gauge and the last: 120 frames.
    jsonParsesPerFrame: 2,
    bytesStringifiedPerFrame: 10,
  });

  assert.equal(frameBounds([]), null);
});
