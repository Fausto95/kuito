import { test, vi } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { present } from './support/present.ts';
import { installKernel, type HostView } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

// Both platforms run Hermes V1, which compiles `async` functions itself:
// app bundles keep them instead of lowering them to generators.

// Every parse of a module, by file, to hold the compiler to one per module.
const parses = vi.hoisted(() => new Map<string, number>());

vi.mock('oxc-parser', async (original) => {
  const oxc: typeof import('oxc-parser') = await original();

  return {
    ...oxc,
    parseSync: (
      file: string,
      ...rest: Parameters<typeof oxc.parseSync> extends [string, ...infer R] ? R : never
    ) => {
      parses.set(file, (parses.get(file) ?? 0) + 1);

      return oxc.parseSync(file, ...rest);
    },
  };
});

async function compile(fixture: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-target-'));

  try {
    return await createSourceCompiler({ platform: 'ios', outputDir: temp })(resolve(fixture));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

test('app bundles keep async functions', async () => {
  const { code } = await compile('test/fixtures/greeting-app.tsx');
  // Strings may name what they describe ("is async"); only syntax matters.
  const syntax = code.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

  assert.match(syntax, /\basync\b/);
  assert.match(syntax, /\bawait\b/);
});

test('async code runs in order', async () => {
  const { code } = await compile('test/fixtures/greeting-app.tsx');
  const views = new Map<string, HostView>();
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );

  runInNewContext(code, host);

  const deadline = Date.now() + 1000;

  while (present(views.get('message'), 'message').props.text !== 'Hello, Ada') {
    assert.ok(Date.now() < deadline, 'the awaited greeting renders');
    await new Promise((settled) => setImmediate(settled));
  }
});

test('each module is parsed once per build, however many passes read it', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-parse-')));

  try {
    writeFileSync(
      join(dir, 'app.tsx'),
      [
        "import { motion, signal, styles } from 'kuito';",
        "import { battery } from './battery';",
        'const sheet = styles({ card: { opacity: 0.5 } });',
        'export default function App() {',
        '  const count = signal(0);',
        '  const offset = motion(0);',
        '  return (',
        '    <Box class={sheet.card} opacity={1 - offset.value} onPress={() => count.value++}>',
        '      <Text>{count.value + battery()}</Text>',
        '    </Box>',
        '  );',
        '}',
      ].join('\n'),
    );

    writeFileSync(
      join(dir, 'battery.ts'),
      "import { nativeModule } from 'kuito';\n" +
        "export const battery = () => nativeModule('Battery').level;\n",
    );

    const compile = createSourceCompiler({ platform: 'ios', outputDir: join(dir, 'out') });
    const ours = () =>
      Object.fromEntries([...parses].filter(([file]) => file.startsWith(dir + '/')));

    parses.clear();
    await compile(join(dir, 'app.tsx'));

    assert.deepEqual(ours(), { [join(dir, 'app.tsx')]: 1, [join(dir, 'battery.ts')]: 1 });

    parses.clear();
    await compile(join(dir, 'app.tsx'));

    assert.deepEqual(ours(), {}, 'an unchanged module is not parsed again');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('route files are parsed once per build, their declarations read included', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-parse-routes-')));
  const app = join(dir, 'app');

  try {
    mkdirSync(app);
    writeFileSync(join(app, '_layout.tsx'), 'export const linking = true;\n');

    writeFileSync(
      join(app, 'index.tsx'),
      "export const name = 'home';\n" +
        'export default function Home() {\n  return <Text>Home</Text>;\n}\n',
    );

    writeFileSync(
      join(app, 'show.tsx'),
      'export type Params = { id: number };\n' +
        'export default function Show() {\n  return <Text>Show</Text>;\n}\n',
    );

    const compile = createSourceCompiler({ platform: 'ios', outputDir: join(dir, 'out') });

    parses.clear();
    await compile(app);

    assert.deepEqual(
      Object.fromEntries([...parses].filter(([file]) => file.startsWith(app + '/'))),
      { [join(app, '_layout.tsx')]: 1, [join(app, 'index.tsx')]: 1, [join(app, 'show.tsx')]: 1 },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
