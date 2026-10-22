import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('CHECK still fails a C++ test built with -DNDEBUG, naming the file and line', (t) => {
  const c = process.env.CXX || 'c++';
  const probe: NodeJS.ErrnoException | undefined = spawnSync(c, ['--version']).error;

  if (probe?.code === 'ENOENT') return t.skip('C++ compiler unavailable');

  const dir = mkdtempSync(join(tmpdir(), 'kuito-check-'));

  try {
    const source = join(dir, 'failing.cpp');
    const output = join(dir, 'failing');

    writeFileSync(
      source,
      '#include "check.h"\nint main() {\n  CHECK(1 + 1 == 2);\n  CHECK(2 + 2 == 5);\n  return 0;\n}\n',
    );

    const build = spawnSync(
      c,
      [
        '-std=c++17',
        '-O2',
        '-DNDEBUG',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I',
        fileURLToPath(new URL('support', import.meta.url)),
        source,
        '-o',
        output,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(build.status, 0, build.stderr);

    const run = spawnSync(output, [], { encoding: 'utf8' });

    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /failing\.cpp:4: CHECK\(2 \+ 2 == 5\) failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
