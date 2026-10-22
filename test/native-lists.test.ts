import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Builds test/<name>.cpp against native/shared and runs it; its stdout, or undefined without a compiler. */
function run(name: string): string | undefined {
  const compiler = process.env.CXX || 'c++';
  const probe: NodeJS.ErrnoException | undefined = spawnSync(compiler, ['--version']).error;

  if (probe?.code === 'ENOENT') return undefined;

  const folder = mkdtempSync(join(tmpdir(), `kuito-${name}-`));

  try {
    const program = join(folder, name);
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
        join(root, `test/${name}.cpp`),
        '-o',
        program,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(build.status, 0, build.stderr || build.error?.message);

    const result = spawnSync(program, [], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.error?.message);

    return result.stdout;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test('list key edits apply in order or reject the diff whole', (t) => {
  const output = run('list-keys');

  if (output === undefined) return t.skip('C++ toolchain unavailable');

  assert.match(output, /KUITO_LIST_KEYS_PASS/);
});

test('list cells keep their keys and reuse the least recently used spare', (t) => {
  const output = run('list-cells');

  if (output === undefined) return t.skip('C++ toolchain unavailable');

  assert.match(output, /KUITO_LIST_CELLS_PASS/);
});
