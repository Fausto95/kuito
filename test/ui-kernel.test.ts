import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytecodeArgs, hermes, hermescEntry } from '../src/cli/hermesc.ts';
import { bundleUIKernel, uiKernelHash } from '../src/dev/kernel.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

/** The pinned compiler if this machine has it: the test downloads nothing. */
const cachedHermesc = () => {
  const path = join(homedir(), '.cache/kuito', `hermesc-${hermes.version}`, hermescEntry());

  return existsSync(path) ? path : null;
};

test('the UI runtime takes only the ui.hbc built with its kernel', async (t) => {
  const compiler = process.env.CXX || 'c++';
  const probe: NodeJS.ErrnoException | undefined = spawnSync(compiler, ['--version']).error;

  if (probe?.code === 'ENOENT') return t.skip('C++ toolchain unavailable');

  const folder = mkdtempSync(join(tmpdir(), 'kuito-ui-kernel-'));

  try {
    const program = join(folder, 'kuito-ui-kernel');
    const build = spawnSync(
      compiler,
      [
        '-std=c++17',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I',
        join(root, 'native/shared'),
        '-I',
        join(root, 'test/support'),
        join(root, 'test/ui-kernel.cpp'),
        '-o',
        program,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(build.status, 0, build.stderr || build.error?.message);

    const args: string[] = [];
    const hermesc = cachedHermesc();

    // Holds the header layout to the pinned Hermes: hermesc writes the
    // SHA-1 of the source it compiled, the hash the kernel carries.
    if (hermesc) {
      const ui = await bundleUIKernel('release');
      const source = join(folder, 'ui.js');
      const output = join(folder, 'ui.hbc');

      writeFileSync(source, ui);

      const compiled = spawnSync(hermesc, bytecodeArgs(source, output, 'release'), {
        encoding: 'utf8',
      });

      assert.equal(compiled.status, 0, compiled.stderr);
      args.push(output, uiKernelHash(ui));
    }

    const run = spawnSync(program, args, { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /KUITO_UI_KERNEL_PASS/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
