import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectFile } from '../src/dev/project-file.ts';

/** A project with a file of its own and a link to one outside it. */
function project() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-project-')));
  const root = join(base, 'app');
  const secret = join(base, 'secret.env');

  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/App.tsx'), 'export {};');
  writeFileSync(secret, 'TOKEN=1');
  symlinkSync(secret, join(root, 'src/linked.env'));
  symlinkSync(base, join(root, 'up'));

  return { root, secret };
}

test('a project file is one that resolves inside the root', () => {
  const { root } = project();

  assert.equal(projectFile(root, join(root, 'src/App.tsx')), join(root, 'src/App.tsx'));
  assert.equal(projectFile(root, join(root, 'src/missing.tsx')), undefined);

  assert.equal(
    projectFile(root, 'src/App.tsx'),
    undefined,
    'Hermes names scripts by absolute path',
  );
});

test('a symlink cannot lead a project file outside the root', () => {
  const { root, secret } = project();

  assert.equal(projectFile(root, join(root, 'src/linked.env')), undefined);
  assert.equal(projectFile(root, join(root, 'up/secret.env')), undefined);
  assert.equal(projectFile(root, join(root, '../secret.env')), undefined);
  assert.equal(projectFile(root, secret), undefined);
});

test('a path that cannot resolve is not a project file, whatever the reason', () => {
  const { root } = project();

  symlinkSync(join(root, 'loop'), join(root, 'loop'));

  assert.equal(projectFile(root, join(root, 'loop')), undefined, 'ELOOP');
  assert.equal(projectFile(root, join(root, `${'a/'.repeat(600)}x`)), undefined, 'ENAMETOOLONG');
});
