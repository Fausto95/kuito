import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERMES_PACKAGES } from '../src/cli/hermes-ios.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

// The pinned Hermes's Mac Catalyst slice runs on the Mac itself, so the link
// values cross a real JSI runtime here, off any device.
const hermes = HERMES_PACKAGES.debug;
const catalyst = join(hermes, 'hermesvm.xcframework', 'ios-arm64_x86_64-maccatalyst');

test('module values cross JSI typed by their signature, with no JSON', (t) => {
  if (process.platform !== 'darwin')
    return t.skip('the Hermes the test links is the Mac Catalyst slice');

  if (!existsSync(catalyst))
    return t.skip('Hermes for iOS is not unpacked: run `kuito dev ios` once');

  const folder = mkdtempSync(join(tmpdir(), 'kuito-link-jsi-'));

  try {
    const program = join(folder, 'link-jsi');
    const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    const build = spawnSync(
      process.env.CXX || 'c++',
      [
        '-std=c++20',
        `--target=${arch}-apple-ios16.0-macabi`,
        '-Wall',
        '-Wextra',
        '-Werror',
        '-DNDEBUG',
        '-isystem',
        join(hermes, 'include'),
        '-I',
        join(root, 'native/shared'),
        '-I',
        join(root, 'test/support'),
        '-F',
        catalyst,
        join(root, 'test/link-jsi.cpp'),
        '-framework',
        'hermesvm',
        `-Wl,-rpath,${catalyst}`,
        '-o',
        program,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(build.status, 0, build.stderr || build.error?.message);

    const run = spawnSync(program, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /link workload: jsonParses=0 bytesStringified=0/);
    assert.match(run.stdout, /KUITO_LINK_JSI_PASS/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
