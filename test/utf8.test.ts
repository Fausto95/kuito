import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('native UTF-8 conversion follows the Encoding standard', (t) => {
  const compiler = process.env.CXX || 'c++';
  const probe: NodeJS.ErrnoException | undefined = spawnSync(compiler, ['--version']).error;

  if (probe?.code === 'ENOENT') return t.skip('C++ toolchain unavailable');

  const folder = mkdtempSync(join(tmpdir(), 'kuito-utf8-'));

  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const program = join(folder, 'kuito-utf8');
    const build = spawnSync(
      compiler,
      [
        '-std=c++17',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-DNDEBUG',
        '-I',
        join(root, 'native/shared'),
        '-I',
        join(root, 'test/support'),
        join(root, 'test/utf8.cpp'),
        '-o',
        program,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(build.status, 0, build.stderr || build.error?.message);

    const run = spawnSync(program, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /KUITO_UTF8_PASS/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
