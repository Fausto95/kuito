import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { codeFrame, locate, sourceError } from '../src/dev/source-location.ts';

const source = 'one\ntwo three\nfour';

test('offsets map to 1-based line and column', () => {
  assert.deepEqual(locate(source, 0), { line: 1, column: 1 });
  assert.deepEqual(locate(source, 8), { line: 2, column: 5 });
});

test('a code frame shows the line, its neighbours and a caret under the column', () => {
  assert.equal(
    codeFrame(source, { line: 2, column: 5 }),
    [' 1 | one', ' 2 | two three', '   :     ^', ' 3 | four'].join('\n'),
  );
});

test('source errors carry the location and frame the CLI displays', () => {
  const error = sourceError('bad value', { file: '/a.tsx', source, start: 8 });

  assert.equal(error.message, 'bad value');
  assert.deepEqual(error.loc, { file: '/a.tsx', line: 2, column: 5 });
  assert.match(error.frame, /2 \| two three/);
});
