import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TraceMap, eachMapping } from '@jridgewell/trace-mapping';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { parseStack, Symbolicator } from '../src/dev/symbolicate.ts';
import { present } from './support/present.ts';

const fixture = resolve('test/fixtures/logbox-app.tsx');

/** Compiles the fixture and returns its map plus where `needle` landed in the bundle. */
async function compiled(dir: string) {
  const output = await createSourceCompiler({ platform: 'ios', outputDir: dir })(fixture);
  const map = JSON.parse(await readFile(output.path + '.map', 'utf8'));
  const lines = output.code.split('\n');
  const at = (needle: string) => {
    const line = lines.findIndex((text) => text.includes(needle));

    return { line: line + 1, column: present(lines[line], needle).indexOf(needle) + 1 };
  };

  return { map, at };
}

test('Hermes, V8 and JSC stack lines parse into frames; the message lines do not', () => {
  const stack = [
    'TypeError: bad',
    'with a second message line',
    '    at explode (kuito://patch/3:12:5)',
    '    at kuito://app:4:1',
    '    at forEach (native)',
    '    at handler (address at kuito://bootstrap:1:900)',
    '    at async load (kuito://patch/3:20:7)',
    'render@kuito://patch/3:30:2',
  ].join('\n');

  assert.deepEqual(parseStack(stack), [
    { name: 'explode', url: 'kuito://patch/3', line: 12, column: 5 },
    { name: '', url: 'kuito://app', line: 4, column: 1 },
    { name: 'forEach', url: 'native' },
    { name: 'handler', url: 'kuito://bootstrap', line: 1, column: 900 },
    { name: 'load', url: 'kuito://patch/3', line: 20, column: 7 },
    { name: 'render', url: 'kuito://patch/3', line: 30, column: 2 },
  ]);
});

test('a stack maps through the patch source map to app files, with a code frame', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-symbols-'));

  try {
    const { map, at } = await compiled(dir);
    const thrown = at('new Error("boom")');
    const symbols = new Symbolicator({ root: process.cwd() });

    symbols.remember('kuito://patch/1', map, dir);

    const result = symbols.symbolicate(
      [
        'Error: boom',
        `    at explode (kuito://patch/1:${thrown.line}:${thrown.column})`,
        '    at dispatch (kuito://bootstrap:1:400)',
        '    at forEach (native)',
      ].join('\n'),
    );
    const [app, kernel, native] = result.frames;

    assert.deepEqual(
      { ...present(app, 'app frame'), column: 0 },
      { name: 'explode', file: 'test/fixtures/logbox-app.tsx', line: 4, column: 0, kind: 'app' },
    );

    assert.ok(present(app, 'app frame').column! > 0);
    assert.deepEqual(kernel, { name: 'dispatch', kind: 'kuito' });
    assert.deepEqual(native, { name: 'forEach', kind: 'native' });

    const frame = present(result.codeFrame, 'code frame');

    assert.equal(frame.file, 'test/fixtures/logbox-app.tsx');
    assert.equal(frame.line, 4);
    assert.match(frame.frame, / 4 \|   throw new Error\('boom'\);/);
    assert.match(frame.frame, / 3 \| function explode\(\): never \{/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('frames in Kuito itself are told apart from app frames', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-symbols-'));

  try {
    const { map } = await compiled(dir);
    const trace = new TraceMap(map);
    let inside: { line: number; column: number } | undefined;

    eachMapping(trace, (mapping) => {
      if (!inside && mapping.source?.includes('src/ui/'))
        inside = { line: mapping.generatedLine, column: mapping.generatedColumn + 1 };
    });

    const position = present(inside, 'a mapping into src/ui');
    const symbols = new Symbolicator({ root: process.cwd() });

    symbols.remember('kuito://patch/1', map, dir);

    const [frame] = symbols.symbolicate(
      `Error\n    at h (kuito://patch/1:${position.line}:${position.column})`,
    ).frames;

    assert.equal(frame?.kind, 'kuito');
    assert.match(frame?.file ?? '', /^src\/ui\//);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unknown bundle keeps the raw frame and offers no code frame', () => {
  const result = new Symbolicator({ root: process.cwd() }).symbolicate(
    'Error\n    at f (kuito://patch/9:1:1)',
  );

  assert.deepEqual(result, { frames: [{ name: 'f', kind: 'app' }] });
});

test('a frame already at a place in the source maps to it, with a code frame', () => {
  const result = new Symbolicator({ root: process.cwd() }).symbolicate(
    '    at 3.scroll (test/fixtures/logbox-app.tsx:4:3)',
  );

  assert.deepEqual(result.frames, [
    { name: '3.scroll', kind: 'app', file: 'test/fixtures/logbox-app.tsx', line: 4, column: 3 },
  ]);

  assert.match(present(result.codeFrame, 'code frame').frame, / 4 \|   throw new Error\('boom'\);/);
});

test('a frame at a file that is not there stays raw', () => {
  const result = new Symbolicator({ root: process.cwd() }).symbolicate(
    '    at f (address at InternalBytecode.js:1:900)',
  );

  assert.deepEqual(result, { frames: [{ name: 'f', kind: 'app' }] });
});

test('only a relative place inside the project is source: bytecode and outside files stay raw', () => {
  const symbols = new Symbolicator({ root: resolve('test/fixtures') });

  // Debug shells name the bytecode they run by its absolute path in the project.
  assert.deepEqual(
    symbols.symbolicate(`    at f (${resolve('test/fixtures/logbox-app.tsx')}:4:3)`),
    {
      frames: [{ name: 'f', kind: 'app' }],
    },
  );

  assert.deepEqual(symbols.symbolicate('    at f (../symbolicate.test.ts:4:3)'), {
    frames: [{ name: 'f', kind: 'app' }],
  });

  assert.ok(symbols.symbolicate('    at f (logbox-app.tsx:4:3)').codeFrame, 'inside, it is source');
});

test('bytecode a debug shell names by its script maps through the map beside it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-beside-'));

  try {
    const { map, at } = await compiled(dir);
    const script = join(dir, 'bytecode-source.js');
    const { line, column } = at('new Error("boom")');

    await writeFile(script, '');

    await writeFile(
      script + '.map',
      JSON.stringify({
        ...map,
        sources: map.sources.map((source: string) => resolve(dir, source)),
      }),
    );

    const symbols = new Symbolicator({ root: dir });
    const { frames } = symbols.symbolicate(`    at explode (${script}:${line}:${column})`);

    assert.equal(frames[0]?.file, fixture);
    assert.equal(frames[0]?.line, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('only the most recent bundles are kept', () => {
  const symbols = new Symbolicator({ root: process.cwd(), keep: 2 });
  const map = { version: 3 as const, sources: [], names: [], mappings: '' };

  for (const url of ['kuito://patch/1', 'kuito://patch/2', 'kuito://patch/3'])
    symbols.remember(url, map, '/tmp');

  assert.deepEqual(symbols.bundles(), ['kuito://patch/2', 'kuito://patch/3']);
});

test('bundle glue that maps to no source is not mistaken for app code', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kuito-symbols-'));

  try {
    const { map } = await compiled(dir);
    const symbols = new Symbolicator({ root: process.cwd() });

    symbols.remember('kuito://patch/1', map, dir);

    assert.deepEqual(symbols.symbolicate('Error\n    at global (kuito://patch/1:1:1)').frames, [
      { name: 'global', kind: 'kuito' },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
