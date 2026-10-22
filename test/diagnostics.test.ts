import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSourceCompiler, toDiagnostics, type Diagnostic } from '../src/dev/compiler.ts';
import { createTransformPlugin } from '../src/dev/transform.ts';
import type { sourceError } from '../src/dev/source-location.ts';

type SourceError = ReturnType<typeof sourceError>;

const broken = 'export default function App() {\n  return (,\n    <Text>hi</Text>);\n}\n';

test('component parse errors carry the source location and a code frame', () => {
  const plugin = createTransformPlugin({ modules: new Map() });
  // Rolldown types the hook with its plugin context; this one never reads `this`.
  const transform: (code: string, id: string) => unknown = plugin.transform as never;

  assert.throws(
    () => transform(broken, '/app/screen.tsx'),
    (error: SourceError) => {
      assert.equal(error.message, 'Unexpected token');
      assert.deepEqual(error.loc, { file: '/app/screen.tsx', line: 2, column: 11 });
      assert.match(error.frame, /2 \|\s+return \(,/);

      assert.doesNotMatch(
        error.frame,
        /,-\[|`-/,
        'location header and border are redundant with loc',
      );

      return true;
    },
  );
});

test('bundler failures become one diagnostic per error, without stack traces', () => {
  const aggregate = Object.assign(
    new Error(
      'Build failed with 1 error:\n\n[plugin p] /x.tsx\nError: Unexpected token\n    at transform (file:///x.ts:1:1)',
    ),
    {
      errors: [
        {
          message: 'Unexpected token',
          loc: { file: '/x.tsx', line: 2, column: 11 },
          frame: 'FRAME',
          plugin: 'p',
          id: '/x.tsx',
        },
      ],
    },
  );

  assert.deepEqual(toDiagnostics(aggregate), [
    {
      message: 'Unexpected token',
      file: '/x.tsx',
      line: 2,
      column: 11,
      frame: 'FRAME',
      plugin: 'p',
    },
  ]);

  assert.deepEqual(toDiagnostics(new Error('Hermes failed\n  at x')), [
    { message: 'Hermes failed' },
  ]);
});

test('a broken component edit rejects with located diagnostics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kuito-diagnostics-'));
  const entry = join(dir, 'app.tsx');

  writeFileSync(entry, broken);

  const compile = createSourceCompiler({ platform: 'ios', outputDir: join(dir, 'out') });

  await assert.rejects(compile(entry), (error: Error & { diagnostics: Diagnostic[] }) => {
    assert.equal(error.diagnostics.length, 1);
    assert.equal(error.diagnostics[0].message, 'Unexpected token');
    assert.equal(error.diagnostics[0].line, 2);
    assert.match(error.message, /app\.tsx:2:11 Unexpected token/);
    assert.doesNotMatch(error.message, /\n\s+at /);

    return true;
  });
});

test('diagnostics without a location still name the file and the plugin that failed', () => {
  const aggregate = Object.assign(new Error('Build failed'), {
    errors: [
      {
        message: 'Kuito styles (/app/theme.css): Unknown token --brand',
        id: '/app/theme.css',
        plugin: 'kuito-css-modules',
        hook: 'load',
      },
      {
        message: 'virtual entry failed',
        id: '\0kuito:component-entry',
        plugin: 'kuito-component-entry',
      },
    ],
  });

  assert.deepEqual(toDiagnostics(aggregate), [
    {
      message: 'Kuito styles (/app/theme.css): Unknown token --brand',
      file: '/app/theme.css',
      plugin: 'kuito-css-modules',
    },
    { message: 'virtual entry failed', plugin: 'kuito-component-entry' },
  ]);
});
