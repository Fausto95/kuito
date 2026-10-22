import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('the ablation switchboard reads KUITO_ABLATE and slows or elides a subsystem', (t) => {
  const c = process.env.CXX || 'c++';

  const probe: NodeJS.ErrnoException | undefined = spawnSync(c, ['--version']).error;

  if (probe?.code === 'ENOENT') return t.skip('C++ compiler unavailable');

  const dir = mkdtempSync(join(tmpdir(), 'kuito-ablation-'));

  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const output = join(dir, 'ablation');
    const r = spawnSync(
      c,
      [
        '-std=c++17',
        '-O2',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-DKUITO_INSTRUMENTS=1',
        '-I',
        join(root, 'test/support'),
        '-I',
        join(root, 'native/shared'),
        join(root, 'test/ablation.cpp'),
        '-o',
        output,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(r.status, 0, r.stderr);

    const run = spawnSync(output, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /KUITO_ABLATION_PASS/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
