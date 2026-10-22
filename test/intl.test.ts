import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createApp } from '../src/cli/create.ts';
import { ROOT } from '../src/cli/config.ts';

// The Intl subset docs/web-apis.md promises, as a new app's tsconfig types it.
// test/shell-smoke.test.ts checks the same calls in Hermes on each platform.

/** Where npm put the checkout's own tools, oxlint and the tsgolint it type-checks with. */
const TOOLS = join(
  dirname(dirname(createRequire(import.meta.url).resolve('oxlint/package.json'))),
  '.bin',
);

const SUBSET = `
const epoch = new Date(0);

export const formatted: string[] = [
  new Intl.NumberFormat('de-DE').format(1234.5),
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5),
  new Intl.NumberFormat('en-US', { style: 'percent', maximumSignificantDigits: 2 }).format(0.25),
  new Intl.NumberFormat('de-DE').resolvedOptions().locale,
  new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(epoch),
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', hour12: false }).format(epoch),
  new Intl.DateTimeFormat().resolvedOptions().timeZone,
  ...new Intl.DateTimeFormat('en-US').formatToParts(epoch).map((part) => part.type),
  ...Intl.getCanonicalLocales('EN-us'),
  ...Intl.NumberFormat.supportedLocalesOf(['fr-FR']),
  (1234.5).toLocaleString('en-US'),
  epoch.toLocaleDateString('en-US', { timeZone: 'UTC' }),
];

export const order: number = new Intl.Collator('de', { sensitivity: 'base' }).compare('ä', 'z');
`;

test('a new app types the Intl subset Hermes has on both platforms', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'kuito-intl-'));
  const directory = join(parent, 'Intl');

  onTestFinished(() => rmSync(parent, { recursive: true, force: true }));

  await createApp({ name: 'Intl', directory, framework: ROOT });
  mkdirSync(join(directory, 'node_modules'), { recursive: true });
  symlinkSync(ROOT, join(directory, 'node_modules/kuito'), 'dir');
  writeFileSync(join(directory, 'app/_intl.ts'), SUBSET);

  const lint = spawnSync(
    join(TOOLS, 'oxlint'),
    ['--type-aware', '--type-check', '-A', 'all', 'app/_intl.ts'],
    {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, PATH: TOOLS + ':' + (process.env.PATH ?? '') },
    },
  );

  assert.deepEqual(
    lint.stdout.split('\n').filter((line) => / error /.test(line)),
    [],
  );

  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
});
