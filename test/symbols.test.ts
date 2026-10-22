import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import { createSourceCompiler, type Diagnostic } from '../src/dev/compiler.ts';
import { ligatures, symbolNames } from '../src/dev/symbols.ts';

const UI = join(ROOT, 'src/ui');

async function compile(app: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-symbols-')));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'app.tsx'), app);

  try {
    await createSourceCompiler({ platform: 'ios', outputDir: join(root, 'dist'), root })(
      join(root, 'app.tsx'),
    );

    return [];
  } catch (error) {
    const diagnostics: Diagnostic[] = Reflect.get(Object(error), 'diagnostics') ?? [];

    assert.ok(diagnostics.length, String(error));

    return diagnostics.map(({ message, line }) => ({ message, line }));
  }
}

const app = (body: string) => `import { VStack, Symbol as Icon, Tab, Tabs } from '${UI}';
export default function App() {
  return (
    <VStack>
      ${body}
    </VStack>
  );
}`;

test('the Material Symbols font names its symbols through its ligatures', () => {
  const font = readFileSync(
    join(ROOT, 'native/android/app/src/main/res/font/material_symbols.ttf'),
  );
  const names = ligatures(font);

  for (const name of ['search', 'home', 'library_books', 'explore'])
    assert.ok(names.has(name), name);

  assert.ok(!names.has('magnifyingglass'));
});

test('symbol names both platforms have compile', async () => {
  assert.deepEqual(
    await compile(
      app(`<Icon name="star" />
      <Icon name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />`),
    ),
    [],
  );
});

test('a name Android lacks is a compile error at its line', async () => {
  assert.deepEqual(await compile(app(`<Icon name={{ ios: 'star', android: 'stars.fill' }} />`)), [
    {
      message:
        '<Symbol name="stars.fill">: no Material Symbol has that name (fonts.google.com/icons)',
      line: 5,
    },
  ]);
});

test('a name iOS lacks is a compile error at its line', async (t) => {
  if (!symbolNames().ios) return t.skip('SF Symbols are listed on macOS only');

  assert.deepEqual(await compile(app(`<Icon name="library_books" />`)), [
    {
      message:
        '<Symbol name="library_books">: no SF Symbol has that name (developer.apple.com/sf-symbols)',
      line: 5,
    },
  ]);
});

test('a tab icon is checked too, where it names a symbol', async () => {
  const tabs = (icon: string) =>
    app(`<Tabs><Tab name="a" title="A" icon=${icon}><VStack /></Tab></Tabs>`);

  assert.deepEqual(await compile(tabs(`{{ ios: 'house', uri: 'x' }}`)), []);
  assert.deepEqual(await compile(tabs(`{{ ios: 'house' }}`)), []);

  assert.deepEqual(
    (await compile(tabs(`{{ android: 'house.fill' }}`))).map(({ message }) => message),
    ['<Tab icon="house.fill">: no Material Symbol has that name (fonts.google.com/icons)'],
  );
});
