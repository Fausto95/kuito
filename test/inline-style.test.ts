import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import type { sourceError } from '../src/dev/source-location.ts';
import { extractInlineStyles } from '../src/style/inline.ts';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { createTransformPlugin } from '../src/dev/transform.ts';
import { present } from './support/present.ts';

type SourceError = ReturnType<typeof sourceError>;

test('replaces static styles with classes and extracted native props', () => {
  const source =
    "const sheet=styles({ card:{padding:12, backgroundColor:'#123456'}, title:{fontSize:17} });";
  const compiled = present(extractInlineStyles(source, 'screen.tsx'), 'compiled styles');

  assert.match(compiled.code, /vx-[a-f0-9]{10}/);
  assert.match(compiled.code, /__kuito.installStyles/);
  assert.equal(Object.keys(compiled.styles).length, 2);
  assert.ok(!compiled.code.includes('styles('));
});

test('nonstatic CSS-in-JS is rejected with a precise reason', () => {
  assert.throws(
    () => extractInlineStyles('const x=styles({a:{padding:space}})', 'a.tsx'),
    /compile-time literal/,
  );

  assert.throws(
    () => extractInlineStyles('const x=styles({a:{float:"left"}})', 'a.tsx'),
    /unsupported property/,
  );
});

test('negative numbers and expression-free templates are compile-time literals', () => {
  const compiled = present(
    extractInlineStyles('const s=styles({ a:{ marginTop:-4, color:`#123456` } });', 'screen.tsx'),
    'compiled styles',
  );

  assert.deepEqual(Object.values(compiled.styles), [{ marginTop: -4, color: '#123456' }]);

  assert.throws(
    () => extractInlineStyles('const s=styles({ a:{ color:`#${hex}` } });', 'screen.tsx'),
    /compile-time literal/,
  );
});

test('style errors point at the offending value with a code frame', () => {
  const source = [
    "import { styles } from 'kuito';",
    'const sheet = styles({',
    '  card: { padding: space },',
    '});',
  ].join('\n');

  assert.throws(
    () => extractInlineStyles(source, '/app/screen.tsx'),
    (error: SourceError) => {
      assert.match(error.message, /padding must be a compile-time literal/);
      assert.deepEqual(error.loc, { file: '/app/screen.tsx', line: 3, column: 20 });
      assert.match(error.frame, /3 \|\s+card: \{ padding: space \},/);
      assert.match(error.frame, /^\s+: {20}\^$/m, 'caret under the s of space');

      return true;
    },
  );
});

test('an unsupported property is located at its key', () => {
  assert.throws(
    () => extractInlineStyles('const x=styles({a:{float:"left"}})', '/a.tsx'),
    (error: SourceError) =>
      /unsupported property float/.test(error.message) &&
      error.loc.line === 1 &&
      error.loc.column === 20,
  );
});

test('styles() compiles wherever a const can be declared', () => {
  const source = [
    'export const top = styles({ a: { opacity: 0.5 } });',
    'export function Card() {',
    '  const local = styles({ b: { opacity: 0.25 } });',
    '  if (local) {',
    '    const nested = styles({ c: { opacity: 1 } });',
    '    return nested.c;',
    '  }',
    '  return local.b;',
    '}',
  ].join('\n');
  const compiled = present(extractInlineStyles(source, 'card.tsx'), 'compiled styles');

  assert.ok(!compiled.code.includes('styles('));

  assert.deepEqual(
    Object.values(compiled.styles).map((props) => props.opacity),
    [0.5, 0.25, 1],
  );
});

test('a styles() call that does not initialize a const is located', () => {
  assert.throws(
    () => extractInlineStyles('let x;\nx = styles({ a: { opacity: 1 } });', '/a.tsx'),
    (error: SourceError) =>
      /styles\(\) must initialize a const/.test(error.message) &&
      error.loc.line === 2 &&
      error.loc.column === 5,
  );
});

/** The original line of the first `needle` in compiled code, through its source map. */
function originalLine(code: string, map: string, needle: string) {
  const offset = code.indexOf(needle);
  const before = code.slice(0, offset).split('\n');

  return originalPositionFor(new TraceMap(map), {
    line: before.length,
    column: before[before.length - 1].length,
  }).line;
}

const SHEET_SOURCE = [
  "import { styles } from 'kuito';",
  'const sheet = styles({',
  '  card: {',
  "    padding: '20px 24px',",
  '    opacity: 0.5,',
  '  },',
  '});',
  '',
  'export default function App() {',
  "  console.log('breakpoint here');",
  '  return sheet.card;',
  '}',
].join('\n');

test('styles() keeps a source map: code after a sheet maps to its own line', () => {
  const plugin = createTransformPlugin({ modules: new Map() });
  const transform = plugin.transform as (
    source: string,
    id: string,
  ) => { code: string; map: { mappings: string } } | null;
  const output = present(transform(SHEET_SOURCE, '/app/app.tsx'), 'transformed');

  assert.equal(originalLine(output.code, JSON.stringify(output.map), 'breakpoint here'), 10);
});

test('breakpoints in a file using styles() land on the right line in the bundle', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-styles-map-')));

  try {
    writeFileSync(join(dir, 'app.tsx'), SHEET_SOURCE);

    const compile = createSourceCompiler({ platform: 'ios', outputDir: join(dir, 'out') });
    const result = await compile(join(dir, 'app.tsx'));
    const map = await import('node:fs/promises').then(({ readFile }) =>
      readFile(result.path + '.map', 'utf8'),
    );

    assert.equal(originalLine(result.code, map, 'breakpoint here'), 10);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Classes as expressions, variants and the style prop, as an app uses them ---

async function runApp(source: string) {
  const { installKernel } = await import('./support/kuito-host.ts');
  const { hosting, nativeEvent } = await import('./support/host-wire.ts');
  const { runInNewContext } = await import('node:vm');
  const { mkdirSync } = await import('node:fs');
  const views = new Map<string, Record<string, unknown>>();
  const host = installKernel(
    hosting({
      createView(id: string) {
        views.set(id, {});
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id)[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );
  const scratch = join(process.cwd(), 'dist');

  mkdirSync(scratch, { recursive: true });

  const dir = mkdtempSync(join(scratch, 'style-props-'));

  try {
    writeFileSync(join(dir, 'app.tsx'), source);

    runInNewContext(
      (await createSourceCompiler({ platform: 'ios', outputDir: dir })(join(dir, 'app.tsx'))).code,
      host,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  return {
    props: (id: string) => present(views.get(id), id),
    press: async (id: string) => {
      nativeEvent(host.__kuito, id + '.press');
      await settle();
    },
  };
}

test('class takes an expression: a list of names, falsy ones skipped, following its signals', async () => {
  const app = await runApp(`
    import { Pressable, Text, signal, styles } from 'kuito';

    const sheet = styles({ card: { padding: 8 }, active: { backgroundColor: '#ff0000' } });

    export default function App() {
      const on = signal(false);

      return (
        <Pressable id="card" class={[sheet.card, on.value && sheet.active]} onPress={() => (on.value = !on.value)}>
          <Text>Toggle</Text>
        </Pressable>
      );
    }
  `);

  assert.equal(app.props('card').paddingTop, 8);
  assert.equal(app.props('card').backgroundColor ?? null, null);

  await app.press('card');

  assert.equal(app.props('card').backgroundColor, '#ff0000');

  await app.press('card');

  assert.equal(app.props('card').backgroundColor ?? null, null);
});

test('a styles() entry takes variants by name, each value a class of its own', () => {
  const compiled = present(
    extractInlineStyles(
      [
        'const button = styles({',
        '  card: {',
        '    padding: 8,',
        "    variants: { size: { small: { fontSize: 12 }, large: { fontSize: 20, '@media (min-width: 600px)': { opacity: 0.5 } } } },",
        '  },',
        '});',
      ].join('\n'),
      'button.tsx',
    ),
    'compiled styles',
  );
  const [card] = Object.keys(compiled.conditions.variants);
  const { small, large } = compiled.conditions.variants[card].size;

  assert.match(compiled.code, /const button = \{"card":"vx-[a-f0-9]{10}"\}/);
  assert.equal(compiled.styles[card].paddingTop, 8);
  assert.equal(compiled.styles[small].fontSize, 12);
  assert.equal(compiled.styles[large].fontSize, 20);

  assert.deepEqual(JSON.parse(JSON.stringify(compiled.conditions.when[large])), [
    { media: { minWidth: 600 }, props: { opacity: 0.5 } },
  ]);
});

test('class names variants as an object of data attributes, following its signals', async () => {
  const app = await runApp(`
    import { Pressable, Text, signal, styles } from 'kuito';

    const sheet = styles({
      card: {
        padding: 8,
        opacity: 1,
        variants: {
          size: { small: { padding: 4 }, large: { padding: 16 } },
          tone: { muted: { opacity: 0.5 } },
        },
      },
    });

    export default function App() {
      const big = signal(false);

      return (
        <Pressable
          id="card"
          class={[sheet.card, { size: big.value ? 'large' : 'small', tone: big.value && 'muted' }]}
          onPress={() => (big.value = !big.value)}
        >
          <Text>Grow</Text>
        </Pressable>
      );
    }
  `);

  assert.equal(app.props('card').paddingTop, 4);
  assert.equal(app.props('card').opacity, 1);

  await app.press('card');

  assert.equal(app.props('card').paddingTop, 16);
  assert.equal(app.props('card').opacity, 0.5);
});

test('each rejected styles() variant is an error', () => {
  const compile = (style: string) => () =>
    extractInlineStyles(`const s = styles({ card: ${style} });`, 'a.tsx');

  assert.throws(
    compile('{ variants: { primary: { backgroundColor: "#ff0000" } } }'),
    /variant primary\.backgroundColor takes an object of declarations: variants: \{ <name>: \{ <value>: \{ … \} \} \}/,
  );

  assert.throws(compile('{ variants: 1 }'), /variants takes an object of names/);

  assert.throws(
    compile('{ variants: { size: { large: { padding: 8 } }, tone: { warm: { paddingTop: 2 } } } }'),
    /Conflicting declarations: paddingTop is set by both size\.large and tone\.warm/,
  );
});

test('the style prop compiles its literals at build time and follows its expressions', async () => {
  const app = await runApp(`
    import { Pressable, Text, signal } from 'kuito';

    export default function App() {
      const dim = signal(false);

      return (
        <Pressable
          id="card"
          style={{ padding: '4px 8px', borderRadius: 12, opacity: dim.value ? 0.5 : 1 }}
          onPress={() => (dim.value = !dim.value)}
        >
          <Text>Dim</Text>
        </Pressable>
      );
    }
  `);

  assert.equal(app.props('card').paddingTop, 4);
  assert.equal(app.props('card').paddingLeft, 8);
  assert.equal(app.props('card').borderRadius, 12);
  assert.equal(app.props('card').opacity, 1);

  await app.press('card');

  assert.equal(app.props('card').opacity, 0.5);
});

test('a style expression for a shorthand is a build error naming the longhands', () => {
  assert.throws(
    () =>
      extractInlineStyles(
        'function A() { return <Box style={{ border: edge.value }} />; }',
        'a.tsx',
      ),
    /border.*literal.*borderWidth, borderColor/,
  );
});

test("a style's @platform block applies on its platform only", () => {
  const source =
    "const s = styles({ card: { padding: 4, '@platform ios': { padding: 8, opacity: 0.5 }, '@platform android': { opacity: 0.9 } } });";
  const ios = present(extractInlineStyles(source, 'a.tsx', { platform: 'ios' }), 'ios styles');
  const android = present(extractInlineStyles(source, 'a.tsx', { platform: 'android' }), 'android');

  assert.deepEqual(Object.values(ios.styles), [
    { paddingTop: 8, paddingRight: 8, paddingBottom: 8, paddingLeft: 8, opacity: 0.5 },
  ]);

  assert.deepEqual(Object.values(android.styles), [
    { paddingTop: 4, paddingRight: 4, paddingBottom: 4, paddingLeft: 4, opacity: 0.9 },
  ]);
});

test('each rejected @platform key in styles() is an error', () => {
  const compile = (style: string) => () =>
    extractInlineStyles(`const s = styles({ a: ${style} });`, 'a.tsx', { platform: 'ios' });

  assert.throws(compile("{ '@platform web': { opacity: 1 } }"), /@platform takes ios or android/);
  assert.throws(compile("{ '@platform ios': 1 }"), /@platform ios takes an object of declarations/);

  assert.throws(
    compile("{ '@platform ios': { '@platform ios': { opacity: 1 } } }"),
    /@platform inside @platform/,
  );

  assert.throws(
    () =>
      extractInlineStyles("const s = styles({ a: { '@platform ios': { opacity: 1 } } });", 'a.tsx'),
    /@platform needs the platform the bundle is for/,
  );
});

test("a style's @media block compiles to an alternate prop set", () => {
  const compiled = present(
    extractInlineStyles(
      "const s = styles({ row: { gap: 4, '@media (min-width: 600px)': { gap: 12 } } });\n",
      'a.tsx',
      { platform: 'ios' },
    ),
    'compiled styles',
  );
  const [name] = Object.keys(compiled.styles);

  assert.deepEqual(compiled.styles[name], { rowGap: 4, columnGap: 4 });

  assert.deepEqual(JSON.parse(JSON.stringify(compiled.conditions.when[name])), [
    { media: { minWidth: 600 }, props: { rowGap: 12, columnGap: 12 } },
  ]);

  assert.match(compiled.code, /installStyles\([^;]*"minWidth":600/);

  assert.throws(
    () =>
      extractInlineStyles(
        "const s = styles({ a: { '@media (hover: hover)': { gap: 1 } } });",
        'a.tsx',
      ),
    /Unsupported media feature hover/,
  );
});
