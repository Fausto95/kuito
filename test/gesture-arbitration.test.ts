import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('gestures wait for and run alongside each other as their relations say', (t) => {
  const cc = process.env.CXX || 'c++';
  const probe: NodeJS.ErrnoException | undefined = spawnSync(cc, ['--version']).error;

  if (probe?.code === 'ENOENT') return t.skip('No C++ compiler');

  const root = fileURLToPath(new URL('../', import.meta.url));
  const gestures = join(root, 'native/shared/gestures');
  const tmp = mkdtempSync(join(tmpdir(), 'kuito-gestures-'));

  try {
    const exe = join(tmp, 'gesture-arbitration');
    const compile = spawnSync(
      cc,
      [
        '-std=c++17',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I',
        join(root, 'native/shared'),
        '-I',
        join(root, 'test/support'),
        ...readdirSync(gestures)
          .filter((file) => file.endsWith('.cpp'))
          .map((file) => join(gestures, file)),
        join(root, 'test/gesture-arbitration.cpp'),
        '-o',
        exe,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(compile.status, 0, compile.stderr);

    const run = spawnSync(exe, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /KUITO_GESTURE_ARBITRATION_PASS/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
