import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('C++ flex layout engine lays out Kuito views like CSS flexbox', (t) => {
  const cc = process.env.CXX || 'c++';

  const probe: NodeJS.ErrnoException | undefined = spawnSync(cc, ['--version']).error;

  if (probe?.code === 'ENOENT') return t.skip('No C++ compiler');

  const tmp = mkdtempSync(join(tmpdir(), 'kuito-flex-'));

  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const exe = join(tmp, 'flex-test');
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
        ...[
          'FlexLayout.cpp',
          'Flexbox.cpp',
          'Absolute.cpp',
          'Balance.cpp',
          'KuitoLayoutStyle.cpp',
        ].map((file) => join(root, 'native/shared/layout', file)),
        join(root, 'test/flex-layout.cpp'),
        '-o',
        exe,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(compile.status, 0, compile.stderr);

    const run = spawnSync(exe, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /KUITO_FLEX_LAYOUT_PASS/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
