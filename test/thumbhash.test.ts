import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

/**
 * Hashes of synthetic images, with and without alpha, landscape and
 * portrait, and every 37th pixel of the preview ThumbHash's reference
 * decoder (github.com/evanw/thumbhash, js/thumbhash.js) makes of each:
 * pixel index, then R, G, B, A.
 */
const vectors: { hash: string; w: number; h: number; samples: number[] }[] = JSON.parse(
  readFileSync(join(root, 'test/fixtures/thumbhash-vectors.json'), 'utf8'),
);

/** What test/thumbhash.cpp prints for each hash, or a skip without a compiler. */
function decode(hashes: string[]): string[] | undefined {
  const cc = process.env.CXX || 'c++';
  const probe: NodeJS.ErrnoException | undefined = spawnSync(cc, ['--version']).error;

  if (probe?.code === 'ENOENT') return undefined;

  const tmp = mkdtempSync(join(tmpdir(), 'kuito-thumbhash-'));

  try {
    const exe = join(tmp, 'thumbhash');
    const compile = spawnSync(
      cc,
      [
        '-std=c++17',
        '-O2',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I',
        join(root, 'native/shared'),
        join(root, 'test/thumbhash.cpp'),
        '-o',
        exe,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(compile.status, 0, compile.stderr);

    const run = spawnSync(exe, hashes, { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);

    return run.stdout.trimEnd().split('\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('the C++ decoder draws the preview the reference decoder draws', (t) => {
  const lines = decode(vectors.map(({ hash }) => hash));

  if (!lines) return t.skip('No C++ compiler');

  vectors.forEach(({ hash, w, h, samples }, index) => {
    const [width, height, ...rgba] = lines[index].split(' ').map(Number);

    assert.deepEqual([width, height], [w, h], `${hash}'s size`);
    assert.equal(rgba.length, w * h * 4, `${hash}'s bytes`);

    for (let i = 0; i < samples.length; i += 5) {
      const pixel = samples[i];
      const expected = samples.slice(i + 1, i + 5);
      const actual = rgba.slice(pixel * 4, pixel * 4 + 4);

      // The reference truncates doubles into a Uint8Array; a last-bit
      // difference in cos between V8 and libm may land one step lower.
      for (const [channel, value] of actual.entries())
        assert.ok(
          Math.abs(value - expected[channel]) <= 1,
          `${hash} pixel ${pixel}: ${actual.join(',')} is not ${expected.join(',')}`,
        );
    }
  });
});

test('the C++ decoder reads base64url as base64', (t) => {
  const [{ hash }] = vectors;
  const url = hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const lines = decode([hash, url]);

  if (!lines) return t.skip('No C++ compiler');

  assert.notEqual(url, hash, 'the vector has a character base64url spells differently');
  assert.equal(lines[1], lines[0]);
});

test('the C++ decoder refuses text that is not a ThumbHash', (t) => {
  const lines = decode([
    'not base64!',
    // Five bytes: a header without its alpha byte and factors.
    'IAiGFQo=',
    // A portrait header whose width is zero, with all its factors.
    '4AcKOBh3d3d3d3d3d3d3d3c=',
  ]);

  if (!lines) return t.skip('No C++ compiler');

  assert.deepEqual(lines, ['invalid', 'invalid', 'invalid']);
});
