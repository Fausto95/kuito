import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { installKernel } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// The dev compiler stays alive between keystrokes: a rebuild reruns Kuito's
// transforms only for modules whose source changed, and output identical to
// the last build is the same revision.

async function project(action: (dir: string, out: string) => Promise<void>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-rebuild-')));

  try {
    writeFileSync(
      join(dir, 'app.tsx'),
      "import { Label } from './label';\nexport default function App() {\n  return <Label />;\n}\n",
    );

    writeFileSync(
      join(dir, 'label.tsx'),
      "export function Label() {\n  return <Text text='one' />;\n}\n",
    );

    await action(dir, join(dir, 'out'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const inside = (dir: string, ids: string[]) =>
  ids
    .filter((id) => id.startsWith(dir + '/'))
    .map((id) => id.slice(dir.length + 1))
    .sort();

test('an unchanged rebuild keeps its revision and hash, and writes no new patch', async () => {
  await project(async (dir, out) => {
    const compile = createSourceCompiler({ platform: 'ios', outputDir: out });
    const first = await compile(join(dir, 'app.tsx'));
    const again = await compile(join(dir, 'app.tsx'));

    assert.equal(again.revision, first.revision);
    assert.equal(again.hash, first.hash);

    assert.deepEqual(
      readdirSync(out).filter((file) => file.startsWith('patch-')),
      ['patch-1.js', 'patch-1.js.map'],
    );

    writeFileSync(
      join(dir, 'label.tsx'),
      "export function Label() {\n  return <Text text='two' />;\n}\n",
    );

    const edited = await compile(join(dir, 'app.tsx'));

    assert.equal(edited.revision, first.revision + 1);
    assert.notEqual(edited.hash, first.hash);
    assert.match(edited.code, /two/);
  });
});

test('a rebuild runs the transforms only for the modules whose source changed', async () => {
  await project(async (dir, out) => {
    const compile = createSourceCompiler({ platform: 'ios', outputDir: out });

    assert.deepEqual(inside(dir, (await compile(join(dir, 'app.tsx'))).transformed), [
      'app.tsx',
      'label.tsx',
    ]);

    writeFileSync(
      join(dir, 'label.tsx'),
      "export function Label() {\n  return <Text text='two' />;\n}\n",
    );

    const edited = await compile(join(dir, 'app.tsx'));

    assert.deepEqual(inside(dir, edited.transformed), ['label.tsx']);
    assert.match(edited.code, /two/);
  });
});

test('a rebuild after a rejected edit compiles from the fixed source', async () => {
  await project(async (dir, out) => {
    const compile = createSourceCompiler({ platform: 'ios', outputDir: out });

    await compile(join(dir, 'app.tsx'));
    writeFileSync(join(dir, 'label.tsx'), 'export function Label( {');
    await assert.rejects(compile(join(dir, 'app.tsx')));

    writeFileSync(
      join(dir, 'label.tsx'),
      "export function Label() {\n  return <Text text='three' />;\n}\n",
    );

    const fixed = await compile(join(dir, 'app.tsx'));

    assert.equal(fixed.revision, 2);
    assert.match(fixed.code, /three/);
  });
});

/**
 * The app in `dir` running on the kernel, re-run after each build as a Live
 * Patch: `runs` counts each component's runs, `sets` the props the host got.
 */
function liveApp(dir: string, out: string) {
  const compile = createSourceCompiler({ platform: 'ios', outputDir: out });
  const runs: Record<string, number> = {};
  const sets: string[] = [];
  const host = installKernel(
    hosting({
      runs,
      createView() {},
      setProp(id: string, name: string) {
        sets.push(`${id}.${name}`);
      },
      removeView() {},
    }),
  );

  return {
    runs,
    sets,
    async patch() {
      const { code } = await compile(join(dir, 'app.tsx'));

      runInContext(code, host);
    },
  };
}

const UI = JSON.stringify(resolve('src/ui/index.ts'));

const component = (name: string, body: string) =>
  `export function ${name}() {\n  runs.${name} = (runs.${name} ?? 0) + 1;\n${body}\n}\n`;

async function components(
  action: (dir: string, live: ReturnType<typeof liveApp>) => Promise<void>,
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-components-')));

  try {
    writeFileSync(
      join(dir, 'app.tsx'),
      `import { VStack } from ${UI};\nimport { Badge, Label } from './parts';\n` +
        component('App', '  return <VStack><Label /><Badge /></VStack>;').replace(
          'export',
          'export default',
        ),
    );

    writeFileSync(
      join(dir, 'parts.tsx'),
      `import { Text } from ${UI};\n` +
        "const tone = (score: number) => (score > 5 ? 'hot' : 'cold');\n" +
        component('Label', "  return <Text text='one' />;") +
        component('Badge', '  return <Text text={tone(7)} />;'),
    );

    const live = liveApp(dir, join(dir, 'out'));

    await live.patch();

    assert.deepEqual(live.runs, { App: 1, Label: 1, Badge: 1 });

    await action(dir, live);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('editing one component re-runs only that component', async () => {
  await components(async (dir, live) => {
    writeFileSync(
      join(dir, 'parts.tsx'),
      `import { Text } from ${UI};\n` +
        "const tone = (score: number) => (score > 5 ? 'hot' : 'cold');\n" +
        component('Label', "  return <Text text='two' />;") +
        component('Badge', '  return <Text text={tone(7)} />;'),
    );

    await live.patch();

    assert.deepEqual(live.runs, { App: 1, Label: 2, Badge: 1 });

    writeFileSync(
      join(dir, 'parts.tsx'),
      `import { Text } from ${UI};\n` +
        "const tone = (score: number) => (score > 5 ? 'warm' : 'cold');\n" +
        component('Label', "  return <Text text='two' />;") +
        component('Badge', '  return <Text text={tone(7)} />;'),
    );

    await live.patch();

    assert.deepEqual(live.runs, { App: 1, Label: 2, Badge: 2 }, 'a helper re-runs its readers');
  });
});

test('a whitespace or comment edit re-runs no component and sends no prop', async () => {
  await components(async (dir, live) => {
    live.sets.length = 0;

    writeFileSync(
      join(dir, 'parts.tsx'),
      `import {\n  Text,\n} from ${UI};\n` +
        '// Parts of the app.\n' +
        'const tone = (score: number) =>\n  score > 5 ? "hot" : "cold";\n\n' +
        component('Label', '  // The label.\n  return (\n    <Text text="one" />\n  );') +
        '\n' +
        component('Badge', '  return <Text text={ tone( 7 ) } />;'),
    );

    await live.patch();

    assert.deepEqual(live.runs, { App: 1, Label: 1, Badge: 1 });
    assert.deepEqual(live.sets, []);
  });
});

test('a build reports placement per bundled file; under strict a fallback fails it', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-placement-')));

  try {
    writeFileSync(
      join(dir, 'app.tsx'),
      [
        "import { Box, motion } from 'kuito';",
        'class Thing {}',
        'export default function App() {',
        '  const x = motion(0);',
        '  return <Box translateX={x} width={new Thing(x.value)} />;',
        '}',
        '',
      ].join('\n'),
    );

    const out = join(dir, 'out');
    const loose = await createSourceCompiler({ platform: 'ios', outputDir: out })(
      join(dir, 'app.tsx'),
    );
    const [report] = loose.placement;

    assert.equal(loose.placement.length, 1);
    assert.match(report.file, /app\.tsx$/);

    assert.deepEqual(
      report.entries.map(({ site, reason }) => [site, reason]),
      [
        ['Box translateX', undefined],
        ['Box width', 'constructs Thing'],
      ],
    );

    await assert.rejects(
      createSourceCompiler({ platform: 'ios', outputDir: out, strict: true })(join(dir, 'app.tsx')),
      (error: Error & { diagnostics?: { message: string; line?: number }[] }) => {
        assert.match(error.message, /^strict placement: 1 on the JS thread/);

        assert.deepEqual(
          error.diagnostics?.map(({ message, line }) => [message, line]),
          [['Box width runs on the JS thread: it constructs Thing', 5]],
        );

        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
