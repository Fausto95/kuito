import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import { saveRecording } from '../src/dev/recordings.ts';
import { replay } from '../src/tests/replay.ts';

/** A `.krec` header (native/shared/Recording.h) and nothing recorded after it. */
const header = (truncated: boolean) =>
  Buffer.concat([Buffer.from('KREC'), Buffer.from([1, 0, 0, 0, truncated ? 1 : 0])]);

test('a saved recording lands in .kuito/recordings with the tree it built', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuito-recordings-'));

  try {
    const saved = await saveRecording({
      root,
      device: { id: 'A1', name: 'P17 iPhone 18 Pro', platform: 'ios' },
      recording: header(false).toString('base64'),
      tree: '1 Stack 0 0,0 402x874',
      now: new Date('2026-10-19T01:02:03'),
    });

    assert.equal(
      saved.file,
      join(root, '.kuito/recordings/20261019-010203-p17-iphone-18-pro.krec'),
    );

    assert.deepEqual(await readFile(saved.file), header(false));
    assert.equal(await readFile(saved.file + '.tree', 'utf8'), '1 Stack 0 0,0 402x874');
    assert.equal(saved.truncated, false);
    assert.equal(saved.bytes, 9);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a saved recording refuses what is not one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuito-recordings-'));

  try {
    await assert.rejects(
      saveRecording({
        root,
        device: { id: 'A1', name: 'Pixel', platform: 'android' },
        recording: Buffer.from('not a recording').toString('base64'),
        tree: '',
      }),
      /is not a Kuito recording/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a recording a shell wrote saves as one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kuito-recordings-'));
  const recorded = await readFile(join(ROOT, 'test/fixtures/recordings/ios/s1-tap.krec'));

  try {
    const saved = await saveRecording({
      root,
      device: { id: 'A1', name: 'iPhone', platform: 'ios' },
      recording: recorded.toString('base64'),
      tree: '',
    });

    assert.deepEqual(await readFile(saved.file), recorded);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// The cost replay's fixtures (docs/devtools.md#cost-replay): a recording replays
// only with the Kuito that recorded it, so they are re-recorded once this fails.
const costFixtures = join(ROOT, 'test/fixtures/recordings');

for (const platform of ['ios', 'android'])
  for (const name of ['s1-tap', 's2-push-pop', 's3-sheet', 's4-scroll', 's5-type'])
    test(`the ${platform} cost replay fixture ${name} still replays`, async () => {
      const { tree } = await replay(join(costFixtures, platform, `${name}.krec`));

      assert.notEqual(tree, '');
    });
