import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createApp } from '../src/cli/create.ts';
import { ROOT } from '../src/cli/config.ts';

/** Where npm put the checkout's own tools, oxlint and the tsgolint it type-checks with. */
const TOOLS = join(
  dirname(dirname(createRequire(import.meta.url).resolve('oxlint/package.json'))),
  '.bin',
);

/** The type errors oxlint reports for `source`, as an app file of a new app, by line. */
async function typeErrors(source: string): Promise<number[]> {
  const parent = mkdtempSync(join(tmpdir(), 'kuito-types-'));
  const directory = join(parent, 'Types');

  onTestFinished(() => rmSync(parent, { recursive: true, force: true }));

  await createApp({ name: 'Types', directory, framework: ROOT });
  mkdirSync(join(directory, 'node_modules'), { recursive: true });
  symlinkSync(ROOT, join(directory, 'node_modules/kuito'), 'dir');
  writeFileSync(join(directory, 'app/_types.tsx'), source);

  const lint = spawnSync(
    join(TOOLS, 'oxlint'),
    ['--type-aware', '--type-check', '-A', 'all', 'app/_types.tsx'],
    {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, PATH: TOOLS + ':' + (process.env.PATH ?? '') },
    },
  );

  return [...lint.stdout.matchAll(/_types\.tsx:(\d+):\d+: error typescript/g)].map((match) =>
    Number(match[1]),
  );
}

// The manifest gives maxFontScale to Text alone; a Button's title follows the
// user's text size without a cap (docs/appearance.md#text-size).
test('a Button takes the native props the manifest gives it, not all of Text', async () => {
  const errors = await typeErrors(`import { Button, Text } from 'kuito';

export const title = <Text maxFontScale={1.5}>Night Drive</Text>;
export const save = <Button maxFontScale={1.5}>Save</Button>;
export const play = <Button fontWeight="bold" disabled>Play</Button>;
`);

  assert.deepEqual(errors, [4]);
});
