import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const shared = join(root, 'native/shared');

// The clang-format package.json pins, built to WebAssembly: Xcode's and each
// distribution's clang-format format the same file differently.
const clangFormat = createRequire(import.meta.url).resolve(
  '@wasm-fmt/clang-format/clang-format-cli.cjs',
);

test('native/shared follows its .clang-format', () => {
  const files = readdirSync(shared, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(h|cpp)$/.test(file))
    .map((file) => join(shared, file));
  const run = spawnSync(process.execPath, [clangFormat, '--dry-run', '--Werror', ...files], {
    encoding: 'utf8',
  });

  assert.equal(
    run.status,
    0,
    `Run: npx clang-format -i native/shared/*.{h,cpp} native/shared/layout/*.{h,cpp}\n${run.stderr.slice(0, 4000)}`,
  );
});
