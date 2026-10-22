import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// native/shared/PathData.h, the parser of a Path's `d` both renderers draw
// from: its cases, then a fuzz pass under the address and undefined-behavior
// sanitizers, where malformed input must throw, never crash.
test('C++ path data parses SVG path grammar and rejects malformed input with a clear error', (t) => {
  const cc = process.env.CXX || 'c++';
  const probe: NodeJS.ErrnoException | undefined = spawnSync(cc, ['--version']).error;

  if (probe?.code === 'ENOENT') return t.skip('No C++ compiler');

  const tmp = mkdtempSync(join(tmpdir(), 'kuito-path-'));

  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const exe = join(tmp, 'path-data-test');
    const sanitized = ['-fsanitize=address,undefined', '-fno-sanitize-recover=all'];
    const flags = (extra: string[]) => [
      '-std=c++17',
      '-O1',
      '-g',
      '-Wall',
      '-Wextra',
      '-Werror',
      ...extra,
      '-I',
      join(root, 'native/shared'),
      join(root, 'test/path-data.cpp'),
      '-o',
      exe,
    ];
    let compile = spawnSync(cc, flags(sanitized), { encoding: 'utf8' });

    // A toolchain without the sanitizers' runtimes still runs every case.
    if (compile.status !== 0 && /sanitize|asan|ubsan/i.test(compile.stderr))
      compile = spawnSync(cc, flags([]), { encoding: 'utf8' });

    assert.equal(compile.status, 0, compile.stderr);

    const run = spawnSync(exe, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /KUITO_PATH_DATA_PASS/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
