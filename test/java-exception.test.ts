import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The newest NDK's sysroot headers, where jni.h lives. */
function ndkHeaders(): string | undefined {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    join(homedir(), 'Library/Android/sdk');
  const ndk = join(sdk, 'ndk');

  if (!existsSync(ndk)) return undefined;

  for (const version of readdirSync(ndk).sort().reverse()) {
    const prebuilt = join(ndk, version, 'toolchains/llvm/prebuilt');

    if (!existsSync(prebuilt)) continue;

    for (const host of readdirSync(prebuilt)) {
      const include = join(prebuilt, host, 'sysroot/usr/include');

      if (existsSync(join(include, 'jni.h'))) return include;
    }
  }

  return undefined;
}

test('no Java exception stays pending and no C++ error crosses into the VM', (t) => {
  const compiler = process.env.CXX || 'c++';
  const probe: NodeJS.ErrnoException | undefined = spawnSync(compiler, ['--version']).error;

  if (probe?.code === 'ENOENT') return t.skip('C++ toolchain unavailable');

  const headers = ndkHeaders();

  if (!headers) return t.skip('Android NDK unavailable');

  const folder = mkdtempSync(join(tmpdir(), 'kuito-java-exception-'));

  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const program = join(folder, 'java-exception');
    const build = spawnSync(
      compiler,
      [
        '-std=c++17',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-I',
        join(root, 'native/android/app/src/main/cpp'),
        '-I',
        join(root, 'native/shared'),
        // jni.h only: the rest of the sysroot is Bionic's, not this host's.
        '-idirafter',
        headers,
        join(root, 'test/java-exception.cpp'),
        '-o',
        program,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(build.status, 0, build.stderr || build.error?.message);

    const run = spawnSync(program, [], { encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /KUITO_JAVA_EXCEPTION_PASS/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
