import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editorCommand, openInEditor, pickEditor } from '../src/dev/editor.ts';

const at = { file: '/work/app/src/App.tsx', line: 12, column: 5 };

test('each editor family gets the arguments that jump to the line and column', () => {
  assert.deepEqual(editorCommand('code', at), {
    command: 'code',
    args: ['-g', '/work/app/src/App.tsx:12:5'],
  });

  assert.deepEqual(editorCommand('/usr/local/bin/cursor', at).args, [
    '-g',
    '/work/app/src/App.tsx:12:5',
  ]);

  assert.deepEqual(editorCommand('zed', at).args, ['/work/app/src/App.tsx:12:5']);
  assert.deepEqual(editorCommand('subl', at).args, ['/work/app/src/App.tsx:12:5']);

  assert.deepEqual(editorCommand('webstorm', at).args, [
    '--line',
    '12',
    '--column',
    '5',
    '/work/app/src/App.tsx',
  ]);

  assert.deepEqual(editorCommand('code --new-window', at), {
    command: 'code',
    args: ['--new-window', '-g', '/work/app/src/App.tsx:12:5'],
  });

  assert.deepEqual(editorCommand('mystery', at).args, ['/work/app/src/App.tsx']);
});

test('KUITO_EDITOR wins, then a graphical VISUAL or EDITOR, then VS Code', () => {
  assert.equal(pickEditor({ KUITO_EDITOR: 'zed', EDITOR: 'code' }), 'zed');
  assert.equal(pickEditor({ VISUAL: 'cursor', EDITOR: 'vim' }), 'cursor');
  assert.equal(pickEditor({ EDITOR: 'vim' }), 'code');
  assert.equal(pickEditor({}), 'code');
});

test('only files inside the project open, resolved from the project root', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-editor-')));
  const root = join(base, 'app');
  const launched: { command: string; args: string[] }[] = [];
  const launch = (command: string, args: string[]) => launched.push({ command, args });

  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/App.tsx'), 'export {};');
  writeFileSync(join(base, 'secrets.txt'), 'TOKEN=1');
  symlinkSync(join(base, 'secrets.txt'), join(root, 'src/secrets.txt'));

  openInEditor({ file: 'src/App.tsx', line: 3, column: 1 }, { root, env: {}, launch });
  assert.deepEqual(launched, [{ command: 'code', args: ['-g', `${root}/src/App.tsx:3:1`] }]);

  for (const file of ['../secrets.txt', 'src/secrets.txt', 'src/missing.tsx'])
    assert.throws(
      () => openInEditor({ file, line: 1, column: 1 }, { root, launch }),
      /outside the project/,
      file,
    );

  assert.equal(launched.length, 1);
});
