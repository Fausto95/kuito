import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { loadCatalog } from '../src/dev/modules/catalog.ts';

const UI = join(ROOT, 'src/ui');
const NATIVE = join(ROOT, 'src/native');

/** An app in a temporary directory: file name → source. */
function app(files: Record<string, string>) {
  // Real path: module ids are, and macOS's tmpdir is a symlink.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-uses-')));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  }

  return root;
}

async function compile(root: string) {
  return createSourceCompiler({ platform: 'ios', outputDir: join(root, 'dist'), root })(
    join(root, 'app.tsx'),
  );
}

const names = (uses: { name: string }[]) => uses.map(({ name }) => name);

/** The functions `links` names, as `Module.function`, numbered by the app's catalog. */
async function namesOf(root: string, links: number[]) {
  const { members } = await loadCatalog(root);

  return links.map((id) => {
    const linked = members.find((member) => member.id === id);

    return linked ? `${linked.module.name}.${linked.member.name}` : `#${id}`;
  });
}

test('a bare app requires no native module and links no function', async () => {
  const root = app({
    'app.tsx': `import { VStack } from '${UI}';\nexport default function App() { return <VStack />; }`,
  });

  const { nativeModules, links } = await compile(root);

  assert.deepEqual(nativeModules, []);
  assert.deepEqual(links, []);
});

test('an app component stays a hoisted declaration, so an import cycle can read it', async () => {
  const root = app({
    'app.tsx': `import { VStack } from '${UI}';
import { Row } from './row';
export default function App() { return <VStack><Row /></VStack>; }`,
    // row.tsx and table.tsx import each other; table reads Row as its module runs.
    'row.tsx': `import { Text } from '${UI}';
import { rows } from './table';
export function Row() { return <Text>{String(rows.length)}</Text>; }`,
    'table.tsx': `import { Row } from './row';
export const rows = [Row];`,
  });

  const { code } = await compile(root);

  assert.match(code, /function Row\(\)/);
  assert.doesNotMatch(code, /var Row = /);
  assert.match(code, /globalThis\.__kuito\.defineComponent\("[^"]*row\.tsx#Row",\s*Row,/);
});

test('an app that imports no native module requires none of the optional ones', async () => {
  const root = app({
    'app.tsx': `import { VStack, Text } from '${UI}';
export default function App() { return <VStack><Text>Hi</Text></VStack>; }`,
  });

  const { nativeModules } = await compile(root);

  for (const name of [
    'Haptics',
    'Clipboard',
    'Share',
    'Slider',
    'DatePicker',
    'Select',
    'SegmentedControl',
    'ContextMenu',
    'Blur',
    'Drawing',
    'Video',
  ])
    assert.ok(!names(nativeModules).includes(name), name);
});

test('importing one built-in module requires that module, where it is declared', async () => {
  const root = app({
    'app.tsx': `import { VStack, tap } from '${UI}';
import { haptics } from '${NATIVE}';
export default function App() { return <VStack gestures={[tap({ onEnd: () => void haptics.selection() })]} />; }`,
  });

  const { nativeModules, links } = await compile(root);
  const haptics = nativeModules.find(({ name }) => name === 'Haptics');

  assert.ok(haptics, 'Haptics is required');
  assert.equal(haptics.file, join(ROOT, 'native/modules/haptics/haptics.ts'));
  assert.ok(haptics.line > 0);
  assert.deepEqual(await namesOf(root, links), ['Haptics.selection'], 'and only selection');

  // Network, Device and KeepAwake each have a UI-thread function, whose tag
  // must not keep it alive, and Device and FileSystem read facts at startup
  // only for an app that uses them.
  for (const name of [
    'Clipboard',
    'Share',
    'Slider',
    'DatePicker',
    'Select',
    'SegmentedControl',
    'ContextMenu',
    'Blur',
    'Drawing',
    'Video',
    'Network',
    'Device',
    'KeepAwake',
    'FileSystem',
    'Appearance',
  ])
    assert.ok(!names(nativeModules).includes(name), `${name} is tree-shaken`);
});

test('an app directory requires the modules every chunk uses, not the last one’s', async () => {
  const output = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-uses-')));

  onTestFinished(() => rmSync(output, { recursive: true, force: true }));

  // Reel: its routes, the store and the UI library are chunks of their own,
  // and its haptics and clipboard calls sit in different ones.
  const { nativeModules } = await createSourceCompiler({ platform: 'ios', outputDir: output })(
    join(ROOT, 'demo/app'),
  );

  for (const name of ['Haptics', 'Clipboard', 'Audio'])
    assert.ok(names(nativeModules).includes(name), name);
});

test('an app module’s spec and its view count, under any import name', async () => {
  const root = app({
    'modules/battery/battery.ts': `import { defineModule, fn, view } from '${NATIVE}';
export default defineModule('Battery', {
  level: fn.sync<() => number>(),
  gauge: view<{ value: number | undefined }>(),
  ios: { class: 'BatteryModule' },
});`,
    'app.tsx': `import { VStack, Text } from '${UI}';
import Power from './modules/battery/battery';
const Gauge = Power.gauge;
export default function App() { return <VStack><Text>{Power.level()}</Text><Gauge value={1} /></VStack>; }`,
  });

  const { nativeModules, links } = await compile(root);

  assert.deepEqual(
    nativeModules.filter(({ name }) => name === 'Battery'),
    [{ name: 'Battery', file: join(root, 'modules/battery/battery.ts'), line: 3 }],
  );

  assert.deepEqual(await namesOf(root, links), ['Battery.level', 'Battery.gauge']);
});

test('a module from a package the app depends on links like its own', async () => {
  const root = app({
    'package.json': JSON.stringify({ name: 'app', dependencies: { 'kuito-battery': '^1.0.0' } }),
    'node_modules/kuito-battery/package.json': JSON.stringify({
      name: 'kuito-battery',
      version: '1.0.0',
      kuito: { modules: 'modules' },
    }),
    'node_modules/kuito-battery/modules/battery/battery.ts': `import { defineModule, fn } from '${NATIVE}';
export default defineModule('Battery', {
  level: fn.sync<() => number>(),
  ios: { class: 'BatteryModule' },
});`,
    'node_modules/kuito-battery/modules/battery/ios/BatteryModule.swift': '',
    'app.tsx': `import { Text } from '${UI}';
import Battery from 'kuito-battery/modules/battery/battery';
export default function App() { return <Text>{Battery.level()}</Text>; }`,
  });

  const { nativeModules, links } = await compile(root);

  assert.deepEqual(names(nativeModules), ['Battery']);
  assert.deepEqual(await namesOf(root, links), ['Battery.level']);
});

test('a packaged spec the app does not depend on is a build error naming the package', async () => {
  const root = app({
    'package.json': JSON.stringify({ name: 'app', dependencies: {} }),
    'node_modules/kuito-battery/package.json': JSON.stringify({
      name: 'kuito-battery',
      kuito: { modules: 'modules' },
    }),
    'node_modules/kuito-battery/modules/battery/battery.ts': `import { defineModule, fn } from '${NATIVE}';
export default defineModule('Battery', { level: fn.sync<() => number>(), ios: { class: 'BatteryModule' } });`,
    'node_modules/kuito-battery/modules/battery/ios/BatteryModule.swift': '',
    'app.tsx': `import { Text } from '${UI}';
import Battery from 'kuito-battery/modules/battery/battery';
export default function App() { return <Text>{Battery.level()}</Text>; }`,
  });

  await assert.rejects(
    compile(root),
    /a native module of kuito-battery, which the app's package\.json does not list in dependencies/,
  );
});

test('a module name the compiler cannot read is an error at its line', async () => {
  const root = app({
    'modules/battery/battery.ts': `import { defineModule, fn } from '${NATIVE}';
export default defineModule('Bat' + 'tery', {
  level: fn.sync<() => number>(),
  ios: { class: 'B' },
});`,
    'app.tsx': `import Battery from './modules/battery/battery';
export default function App() { Battery.level(); return null; }`,
  });

  await assert.rejects(
    compile(root),
    /modules\/battery\/battery\.ts:2: defineModule needs the module's name as a string literal/,
  );
});

const BATTERY_SPEC = `import { defineModule, fn } from 'kuito';
export type Mode = 'saver' | 'normal';
export default defineModule('Battery', {
  level: fn.sync<() => number>(),
  monitor: fn.main<(on: boolean) => Promise<void>>(),
  setMode: fn.background<(mode: Mode) => Promise<void>>(),
  ios: { class: 'BatteryModule' },
});
`;

test('a module spec compiles to stubs, and the bundle keeps only the functions it calls', async () => {
  const root = app({
    'modules/battery/battery.ts': BATTERY_SPEC,
    'app.tsx': `import { Text } from '${UI}';
import battery from './modules/battery/battery';
export default function App() { return <Text>{battery.level()}</Text>; }`,
  });

  const { code, links, linkHash, nativeModules } = await createSourceCompiler({
    platform: 'ios',
    outputDir: join(root, 'dist'),
    root,
  })(join(root, 'app.tsx'));

  assert.match(code, /__kuito\.link\(\d+, "Battery\.level", "js", \[\]\)/);
  assert.doesNotMatch(code, /Battery\.monitor|Battery\.setMode/, 'unused functions are dropped');
  assert.deepEqual(await namesOf(root, links), ['Battery.level']);
  assert.match(linkHash, /^[0-9a-f]{16}$/);

  assert.deepEqual(
    nativeModules.filter(({ name }) => name === 'Battery'),
    [{ name: 'Battery', file: join(root, 'modules/battery/battery.ts'), line: 4 }],
  );
});

test('a function imported by name links like one read from the default', async () => {
  const root = app({
    'modules/battery/battery.ts': BATTERY_SPEC,
    'app.tsx': `import { Text } from '${UI}';
import { setMode } from './modules/battery/battery';
export default function App() { return <Text onPress={() => void setMode('saver')}>Save</Text>; }`,
  });

  const { links } = await createSourceCompiler({
    platform: 'ios',
    outputDir: join(root, 'dist'),
    root,
  })(join(root, 'app.tsx'));

  assert.deepEqual(await namesOf(root, links), ['Battery.setMode']);
});

test('a spec that is not a static declaration fails the build at its line', async () => {
  const root = app({
    'modules/battery/battery.ts': BATTERY_SPEC.replace("'Battery'", 'name'),
    'app.tsx': `import battery from './modules/battery/battery';
export default function App() { return battery.level(); }`,
  });

  await assert.rejects(
    createSourceCompiler({ platform: 'ios', outputDir: join(root, 'dist'), root })(
      join(root, 'app.tsx'),
    ),
    /battery\.ts:3: defineModule needs the module's name as a string literal/,
  );
});

test('a namespace member called from a UI-thread candidate is captured as itself, not its namespace', async () => {
  const root = app({
    'modules/battery/battery.ts': BATTERY_SPEC,
    'app.tsx': `import { VStack, tap } from '${UI}';
import { haptics } from '${NATIVE}';
import battery from './modules/battery/battery';
export default function App() {
  return <VStack gestures={[tap({ onEnd: () => { void haptics.selection(); void battery.monitor(true); } })]} />;
}`,
  });

  const { code, links } = await createSourceCompiler({
    platform: 'ios',
    outputDir: join(root, 'dist'),
    root,
  })(join(root, 'app.tsx'));

  assert.deepEqual(
    await namesOf(root, links),
    ['Battery.monitor', 'Haptics.selection'],
    'only the functions called',
  );

  assert.doesNotMatch(code, /__exportAll\(\{\s*level:/, "the spec's namespace is not built");

  // The JS thread's code, without the UI runtime's script it carries.
  const js = code.replace(/__kuito\.loadUI\(.*/, '');

  assert.doesNotMatch(
    js,
    /native\.notification\(|native\.impact\(/,
    "haptics' other functions are dropped",
  );
});

test('styles that follow the color scheme link it; styles that do not, do not', async () => {
  const themed = app({
    'app.css': `.card { color: black; }
@media (prefers-color-scheme: dark) { .card { color: white; } }`,
    'app.tsx': `import { VStack } from '${UI}';
import styles from './app.css';
export default function App() { return <VStack class={styles.card} />; }`,
  });
  const plain = app({
    'app.css': `.card { color: black; }`,
    'app.tsx': `import { VStack } from '${UI}';
import styles from './app.css';
export default function App() { return <VStack class={styles.card} />; }`,
  });

  const linked = async (root: string) =>
    namesOf(
      root,
      (
        await createSourceCompiler({ platform: 'ios', outputDir: join(root, 'dist'), root })(
          join(root, 'app.tsx'),
        )
      ).links,
    );

  assert.deepEqual(await linked(themed), ['Appearance.colorScheme']);
  assert.deepEqual(await linked(plain), []);
});
