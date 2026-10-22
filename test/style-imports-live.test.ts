import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSourceCompiler } from '../src/dev/compiler.ts';

test('Live Patch watches and recompiles the token files a stylesheet @imports', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-css-imports-')));
  const tokens = join(dir, 'tokens.css');
  const entry = join(dir, 'app.tsx');

  try {
    writeFileSync(tokens, ':root { --accent: #ff5a5f; }');

    writeFileSync(
      join(dir, 'card.css'),
      '@import "./tokens.css";\n.card { color: var(--accent); }',
    );

    writeFileSync(entry, "import css from './card.css';\nexport default () => css.card;\n");

    const compile = createSourceCompiler({ platform: 'ios', outputDir: join(dir, 'out') });
    const first = await compile(entry);

    assert.ok(first.watched.includes(tokens), 'the imported token file is watched');
    assert.match(first.code, /#ff5a5f/);

    writeFileSync(tokens, ':root { --accent: #1768db; }');

    const second = await compile(entry);

    assert.match(second.code, /#1768db/);
    assert.doesNotMatch(second.code, /#ff5a5f/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
