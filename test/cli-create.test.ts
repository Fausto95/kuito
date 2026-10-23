import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createApp, relocateImports, validateAppName } from '../src/cli/create.ts';
import { parseArgs, ROOT, ROUTE_STYLES, type RouteStyle } from '../src/cli/config.ts';
import { main } from '../src/cli/index.ts';
import { decodePng, hasTransparency } from '../src/cli/png.ts';
import { loadProject } from '../src/cli/project.ts';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { installUIKernel } from './support/ui-host.ts';
import { installKernel } from './support/kuito-host.ts';
import type { RunOptions } from './support/cli.ts';
import { handleOf, hosting, nativeEvent } from './support/host-wire.ts';
import { countingTests } from './support/test-counts.ts';
import { headlessApp } from './support/headless.ts';

const temp = () => mkdtempSync(join(tmpdir(), 'kuito-create-'));

/** What `kuito dev` runs in an app of each routing style: its app directory or its app.tsx. */
const entryOf = (routes: RouteStyle, directory: string) =>
  join(directory, routes === 'files' ? 'app' : 'app.tsx');

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

interface PackageJson {
  name: string;
  private: boolean;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
}

const isPackageJson = (value: unknown): value is PackageJson =>
  typeof value === 'object' && value !== null && 'name' in value && 'dependencies' in value;

function packageOf(directory: string): PackageJson {
  const value = readJson(join(directory, 'package.json'));

  assert.ok(isPackageJson(value), 'package.json has a name and dependencies');

  return value;
}

test('app names must be usable as a directory and an npm package', () => {
  for (const name of ['MyApp', 'my-app', 'notes_2']) assert.equal(validateAppName(name), name);

  for (const name of ['', '1app', 'my app', '../escape', 'a/b', '.hidden', 'x'.repeat(215)])
    assert.throws(() => validateAppName(name), /App name/, JSON.stringify(name));
});

/**
 * A PATH like a machine with neither Xcode nor the Android SDK has: Node and
 * the system's own tools, without the developer tools macOS stubs in
 * /usr/bin (xcrun, clang, swift, git) or adb. Both system directories are
 * linked in, without either on PATH: on Linux /bin is /usr/bin, compilers
 * included.
 */
function pathWithoutSdks(directory: string): string {
  const developerTools =
    /^(xcrun|xcodebuild|xcode-select|clang.*|cc|c\+\+|gcc|g\+\+|swift.*|ld|lldb|make|git|adb|java|javac)$/;

  mkdirSync(directory);
  symlinkSync(process.execPath, join(directory, 'node'));

  symlinkSync(
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    join(directory, 'npm'),
  );

  for (const system of ['/usr/bin', '/bin'])
    for (const tool of existsSync(system) ? readdirSync(system) : [])
      if (!developerTools.test(tool) && !existsSync(join(directory, tool)))
        symlinkSync(join(system, tool), join(directory, tool));

  return directory;
}

for (const routes of ROUTE_STYLES)
  test(`a created app’s npm test passes on a machine without Xcode or the Android SDK (${routes} routes)`, async () => {
    // npm resolves the file: dependency from the real path; macOS's temp directory is a link.
    const parent = realpathSync(temp());
    const directory = join(parent, 'Plain');

    try {
      await createApp({ name: 'Plain', directory, framework: ROOT, routes });

      // A file: dependency installs as a link to this checkout: nothing is downloaded.
      // Without the npm_config_* of an `npm test` running this suite, which
      // point npm at this checkout instead.
      const own = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_')),
      );
      const install = spawnSync('npm', ['install', '--offline', '--no-audit', '--no-fund'], {
        cwd: directory,
        env: own,
        encoding: 'utf8',
      });

      assert.equal(install.status, 0, install.stderr);

      const env = { HOME: process.env.HOME ?? parent, PATH: pathWithoutSdks(join(parent, 'bin')) };
      const tools = spawnSync(
        '/bin/sh',
        ['-c', 'command -v xcrun adb clang swift; echo "[$ANDROID_HOME]"'],
        {
          env,
          encoding: 'utf8',
        },
      );

      assert.equal(tools.stdout, '[]\n', 'no SDK tool is reachable');

      const counting = countingTests(env);
      const run = spawnSync('npm', ['test'], {
        cwd: directory,
        env: counting.env,
        encoding: 'utf8',
      });

      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.deepEqual(counting.read(), { passed: 5, failed: 0 });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

test('an app created by Kuito from npm depends on that release, imported as kuito', async () => {
  const parent = temp();
  const framework = join(parent, 'node_modules/kuito');
  const directory = join(parent, 'MyApp');

  try {
    mkdirSync(framework, { recursive: true });

    writeFileSync(
      join(framework, 'package.json'),
      JSON.stringify({ name: '@kuito/kuito', version: '1.2.3' }),
    );

    await createApp({ name: 'MyApp', directory, framework });

    // npm publishes Kuito under a scope; the alias keeps the app's imports `kuito`.
    assert.equal(packageOf(directory).dependencies['kuito'], 'npm:@kuito/kuito@^1.2.3');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('create writes a runnable app that depends on this Kuito checkout', async () => {
  const parent = temp();
  const directory = join(parent, 'MyApp');

  try {
    const files = await createApp({ name: 'MyApp', directory, framework: ROOT });

    for (const file of [
      'package.json',
      'tsconfig.json',
      'README.md',
      '.gitignore',
      'app/_layout.tsx',
      'app/(home)/index.tsx',
      'app/(explore)/explore.tsx',
      'kuito.config.ts',
      'modules/README.md',
      'assets/icon.png',
      'assets/icon-staging.png',
      'assets/splash.png',
    ]) {
      assert.ok(files.includes(file), `reports ${file}`);
      assert.ok(existsSync(join(directory, file)), `writes ${file}`);
    }

    const pkg = packageOf(directory);

    assert.equal(pkg.name, 'myapp');
    assert.equal(pkg.private, true);
    assert.ok(!('version' in pkg), 'the version lives in kuito.config.ts alone');
    assert.equal(pkg.dependencies['kuito'], `file:${relative(directory, ROOT)}`);
    assert.equal(pkg.scripts.ios, 'kuito dev ios');
    assert.equal(pkg.scripts.android, 'kuito dev android');
    assert.equal(pkg.scripts.test, 'kuito test');
    assert.ok(files.includes('tests/home.test.tsx'), 'it ships a test');

    const readme = readFileSync(join(directory, 'README.md'), 'utf8');

    assert.match(readme, /^# MyApp$/m);
    assert.match(readme, /npm run ios/);

    const written = readFileSync(join(directory, 'kuito.config.ts'), 'utf8');

    assert.equal(
      written,
      readFileSync(join(ROOT, 'templates/app/kuito.config.ts'), 'utf8')
        .replaceAll('{{name}}', 'MyApp')
        .replaceAll('{{id}}', 'com.example.myapp'),
      'the template’s own kuito.config.ts, filled in',
    );

    assert.doesNotMatch(readme, /\{\{/, 'every placeholder is filled');

    const ignored = readFileSync(join(directory, '.gitignore'), 'utf8');

    assert.match(ignored, /^node_modules\/$/m);
    assert.match(ignored, /^\.kuito\/$/m, 'generated shells are never committed');

    const { config } = await loadProject(directory, 'production');

    assert.equal(config.name, 'MyApp');
    assert.equal(config.ios.bundleIdentifier, 'com.example.myapp');
    assert.equal(config.android.applicationId, 'com.example.myapp');
    assert.equal(config.icon?.path, join(directory, 'assets/icon.png'));
    assert.deepEqual(config.permissions, {});
    assert.equal(config.version, '1.0.0');
    assert.equal(config.buildNumber, 1);

    assert.equal(
      config.splash?.logo.path,
      join(directory, 'assets/splash.png'),
      'it ships a splash',
    );

    const staging = (await loadProject(directory, 'staging')).config;

    assert.equal(staging.name, 'MyApp Staging');
    assert.equal(staging.ios.bundleIdentifier, 'com.example.myapp.staging');
    assert.equal(staging.android.applicationId, 'com.example.myapp.staging');
    assert.equal(staging.icon?.path, join(directory, 'assets/icon-staging.png'));
    assert.notEqual(staging.splash?.background, config.splash?.background, 'a staging splash');

    for (const file of ['assets/icon.png', 'assets/icon-staging.png']) {
      const bytes = readFileSync(join(directory, file));

      assert.deepEqual(
        bytes,
        readFileSync(join(ROOT, 'templates/app', file)),
        `${file} is copied as is`,
      );

      const image = decodePng(bytes);

      assert.equal(image.width, 1024, `${file} is 1024 wide`);
      assert.equal(image.height, 1024, `${file} is square`);
      assert.ok(!hasTransparency(image), `${file} is opaque, as iOS needs`);
    }

    assert.match(
      readFileSync(join(directory, 'tsconfig.json'), 'utf8'),
      /"jsxFactory": "__kuitoJSX"/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('create refuses a directory that is not empty, and fills an empty one', async () => {
  const directory = temp();

  try {
    writeFileSync(join(directory, 'notes.txt'), 'mine');

    await assert.rejects(
      createApp({ name: 'MyApp', directory, framework: ROOT }),
      /not empty/,
      'never overwrites',
    );

    assert.equal(readFileSync(join(directory, 'notes.txt'), 'utf8'), 'mine');
    assert.ok(!existsSync(join(directory, 'package.json')));

    rmSync(join(directory, 'notes.txt'));
    await createApp({ name: 'MyApp', directory, framework: ROOT });
    assert.ok(existsSync(join(directory, 'package.json')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const routes of ROUTE_STYLES)
  test(`the starter app compiles against kuito and opens on native tabs (${routes} routes)`, async () => {
    const parent = temp();
    const directory = join(parent, 'Starter');
    const output = temp();

    try {
      await createApp({ name: 'Starter', directory, framework: ROOT, routes });
      // What `npm install` does with a file: dependency.
      mkdirSync(join(directory, 'node_modules'), { recursive: true });
      symlinkSync(ROOT, join(directory, 'node_modules/kuito'), 'dir');

      const { code } = await createSourceCompiler({ platform: 'ios', outputDir: output })(
        entryOf(routes, directory),
      );
      const views = new Map<string, { kind: string; props: Record<string, unknown> }>();
      const order: string[] = [];
      const kernel = installKernel(
        hosting({
          createView(id: string, kind: string) {
            views.set(id, { kind, props: {} });
            order.push(id);
          },
          setProp(id: string, name: string, value: unknown) {
            const view = views.get(id);

            if (view) view.props[name] = value;
          },
          removeView(id: string) {
            views.delete(id);
          },
          moveView() {},
        }),
      );

      runInNewContext(code, kernel);
      await new Promise((done) => setTimeout(done, 0));

      const tabs = order.flatMap((id) => {
        const view = views.get(id);

        return view?.kind === 'NavigationTab' ? [view.props.title] : [];
      });

      assert.deepEqual(tabs, ['Home', 'Explore']);
    } finally {
      rmSync(parent, { recursive: true, force: true });
      rmSync(output, { recursive: true, force: true });
    }
  });

/** Where npm put the checkout's own tools, oxlint and the tsgolint it type-checks with. */
const TOOLS = join(
  dirname(dirname(createRequire(import.meta.url).resolve('oxlint/package.json'))),
  '.bin',
);

test('the starter’s routes are typed: a wrong param is a type error', async () => {
  const parent = temp();
  const directory = join(parent, 'Typed');
  const output = temp();

  try {
    await createApp({ name: 'Typed', directory, framework: ROOT });
    mkdirSync(join(directory, 'node_modules'), { recursive: true });
    symlinkSync(ROOT, join(directory, 'node_modules/kuito'), 'dir');

    const shipped = readFileSync(join(directory, 'app/routes.generated.d.ts'), 'utf8');

    await createSourceCompiler({ platform: 'ios', outputDir: output })(join(directory, 'app'));

    assert.equal(
      readFileSync(join(directory, 'app/routes.generated.d.ts'), 'utf8'),
      shipped,
      'the starter ships the route types its files give',
    );

    writeFileSync(
      join(directory, 'app/_wrong.ts'),
      "import { navigate, routes } from 'kuito';\n\n" +
        'export const wrong = () => navigate(routes.topic({ topic: 42 }));\n',
    );

    const lint = spawnSync(
      join(TOOLS, 'oxlint'),
      ['--type-aware', '--type-check', '-A', 'all', 'app'],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, PATH: TOOLS + ':' + (process.env.PATH ?? '') },
      },
    );
    const errors = lint.stdout.split('\n').filter((line) => / error /.test(line));

    assert.deepEqual(
      errors,
      [
        "app/_wrong.ts:3:52: error typescript(TS2322): Type 'number' is not assignable to type 'string'.",
      ],
      lint.stdout + lint.stderr,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test('component routes are typed by the Routes app.tsx declares: a wrong param is a type error', async () => {
  const parent = temp();
  const directory = join(parent, 'Typed');

  try {
    await createApp({ name: 'Typed', directory, framework: ROOT, routes: 'components' });
    mkdirSync(join(directory, 'node_modules'), { recursive: true });
    symlinkSync(ROOT, join(directory, 'node_modules/kuito'), 'dir');

    writeFileSync(
      join(directory, 'screens/_wrong.ts'),
      "import { navigate, routes } from 'kuito';\n\n" +
        'export const wrong = () => navigate(routes.topic({ topic: 42 }));\n',
    );

    const lint = spawnSync(
      join(TOOLS, 'oxlint'),
      ['--type-aware', '--type-check', '-A', 'all', 'app.tsx', 'screens', 'components'],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, PATH: TOOLS + ':' + (process.env.PATH ?? '') },
      },
    );
    const errors = lint.stdout.split('\n').filter((line) => / error /.test(line));

    assert.deepEqual(errors, [
      "screens/_wrong.ts:3:52: error typescript(TS2322): Type 'number' is not assignable to type 'string'.",
    ]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('create --routes components writes the starter as one Router in app.tsx', async () => {
  const parent = temp();
  const directory = join(parent, 'Declared');

  try {
    const files = await createApp({
      name: 'Declared',
      directory,
      framework: ROOT,
      routes: 'components',
    });

    for (const file of [
      'app.tsx',
      'screens/home.tsx',
      'screens/explore.tsx',
      'screens/topic.tsx',
      'screens/about.tsx',
      'screens/sign-in.tsx',
      'components/card.tsx',
      'components/demos/motion.tsx',
      'tests/home.test.tsx',
      'kuito.config.ts',
    ])
      assert.ok(files.includes(file), `writes ${file}`);

    assert.ok(!existsSync(join(directory, 'app')), 'no app directory: that would be file routes');
    assert.ok(!files.some((file) => file.includes('_layout') || file.includes('routes.generated')));

    const read = (file: string) => readFileSync(join(directory, file), 'utf8');

    assert.match(read('app.tsx'), /<Router>/);
    assert.match(read('screens/home.tsx'), /from '\.\.\/components\/card'/);
    assert.match(read('screens/home.tsx'), /from '\.\.\/assets\/logo\.svg'/);
    assert.match(read('tests/home.test.tsx'), /from '\.\.\/screens\/home'/);
    assert.match(read('README.md'), /app\.tsx/);
    assert.doesNotMatch(read('README.md'), /_layout|\{\{/);
    assert.match(read('tsconfig.json'), /"screens"/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a moved file’s relative imports still name the files they named', () => {
  // Where each template path lands: the importer itself, and the components.
  const place = (path: string) =>
    path === 'app/(home)/index.tsx'
      ? 'screens/home.tsx'
      : path.replace('app/_components/', 'components/');
  const source = [
    "import { Box } from 'kuito';",
    "import logo from '../../assets/logo.svg';",
    "import { Card } from '../_components/card';",
    "export { colors } from '../_components/theme';",
    '',
  ].join('\n');

  assert.equal(
    relocateImports(source, 'app/(home)/index.tsx', place),
    [
      "import { Box } from 'kuito';",
      "import logo from '../assets/logo.svg';",
      "import { Card } from '../components/card';",
      "export { colors } from '../components/theme';",
      '',
    ].join('\n'),
  );
});

test('every Explore topic renders its demo', async () => {
  const parent = temp();
  const directory = join(parent, 'Topics');
  const output = temp();

  try {
    await createApp({ name: 'Topics', directory, framework: ROOT });
    mkdirSync(join(directory, 'node_modules'), { recursive: true });
    symlinkSync(ROOT, join(directory, 'node_modules/kuito'), 'dir');

    // Each topic screen side by side, as the stack would show them one at a time.
    const entry = join(directory, 'topics.tsx');

    writeFileSync(
      entry,
      `import { VStack } from 'kuito';
import Topic from './app/(explore)/explore/[topic]';
import { TOPICS } from './app/_components/topics';

export default function All() {
  return <VStack>{TOPICS.map((topic) => <Topic key={topic.id} topic={topic.id} dismiss={() => {}} />)}</VStack>;
}
`,
    );

    const { code } = await createSourceCompiler({ platform: 'ios', outputDir: output })(entry);
    const errors: string[] = [];
    const kinds = new Set<string>();
    const kernel = installKernel(
      hosting({
        createView(_id: string, kind: string) {
          kinds.add(kind);
        },
        setProp() {},
        removeView() {},
        moveView() {},
        __kuitoHostLog(level: string, message: string) {
          if (level === 'error') errors.push(message);
        },
      }),
    );

    runInNewContext(code, kernel);
    await new Promise((done) => setTimeout(done, 0));

    assert.deepEqual(errors, []);

    for (const kind of ['List', 'TextField', 'Toggle', 'Image', 'Spinner'])
      assert.ok(kinds.has(kind), `a demo shows a ${kind}`);
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test('create takes how the app routes: file routes or component routes', () => {
  assert.equal(parseArgs(['create', 'MyApp']).routes, null, 'asked, or file routes, when left out');
  assert.equal(parseArgs(['create', 'MyApp', '--routes', 'components']).routes, 'components');
  assert.equal(parseArgs(['create', 'MyApp', '--routes', 'files']).routes, 'files');

  assert.throws(
    () => parseArgs(['create', 'MyApp', '--routes', 'tree']),
    /Unknown routes 'tree': use files or components/,
  );

  assert.throws(
    () => parseArgs(['dev', '--routes', 'files']),
    /--routes only applies to kuito create/,
  );
});

test('create is a command that takes the app name', () => {
  const args = parseArgs(['create', 'MyApp', '--no-install']);

  assert.equal(args.command, 'create');
  assert.equal(args.name, 'MyApp');
  assert.equal(args.noInstall, true);
  assert.equal(parseArgs(['init', 'MyApp']).command, 'create');
  assert.throws(() => parseArgs(['create']), /kuito create <name>/);
  assert.throws(() => parseArgs(['dev', 'MyApp']), /Unknown argument/);
});

test('dev runs the ./app of the project it is started in: app.tsx, or an app directory', () => {
  const project = temp();

  try {
    assert.equal(parseArgs(['dev'], { cwd: project }).entry, join(project, 'app.tsx'));

    mkdirSync(join(project, 'app'));
    assert.equal(parseArgs(['dev', 'ios'], { cwd: project }).entry, join(project, 'app'));

    assert.equal(
      parseArgs(['dev', '--entry', 'other.tsx'], { cwd: project }).entry,
      join(project, 'other.tsx'),
    );
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('kuito dev outside an app fails, naming the missing kuito.config.ts', async () => {
  const directory = temp();

  try {
    writeFileSync(join(directory, 'app.tsx'), 'export default function App() {}\n');

    await assert.rejects(
      main(['dev', 'ios'], {
        cwd: directory,
        out: () => {},
        runner: {
          async run() {
            throw new Error('nothing runs outside an app');
          },
        },
      }),
      /No kuito\.config\.ts in /,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('kuito create installs dependencies and prints the next steps', async () => {
  const parent = temp();
  const calls: { bin: string; args: readonly string[]; opts: RunOptions }[] = [];
  const lines: string[] = [];

  try {
    await main(['create', 'MyApp'], {
      cwd: parent,
      out: (line) => lines.push(line),
      runner: {
        async run(bin, args = [], opts = {}) {
          calls.push({ bin, args, opts });
          return { stdout: '', stderr: '' };
        },
      },
    });

    assert.deepEqual(
      calls.map(({ bin, args, opts }) => [bin, args, opts.cwd]),
      [['npm', ['install'], join(parent, 'MyApp')]],
    );

    assert.ok(existsSync(join(parent, 'MyApp/app/_layout.tsx')));

    const printed = lines.join('\n');

    assert.match(printed, /cd MyApp/);
    assert.match(printed, /npm run ios/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('kuito create --routes components writes component routes, and outside a terminal defaults to file routes', async () => {
  const parent = temp();
  const quiet = { cwd: parent, out: () => {} };

  try {
    await main(['create', 'Declared', '--routes', 'components', '--no-install'], quiet);
    assert.ok(existsSync(join(parent, 'Declared/app.tsx')));
    assert.ok(!existsSync(join(parent, 'Declared/app')));

    // A test's stdin is no terminal: no picker, file routes.
    await main(['create', 'Plain', '--no-install'], quiet);
    assert.ok(existsSync(join(parent, 'Plain/app/_layout.tsx')));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

/** Generates the starter, then compiles and runs `source` written beside its app/ directory. */
async function runInStarter(source: string, { ui = false } = {}) {
  const parent = temp();
  const directory = join(parent, 'Starter');
  const output = temp();

  onTestFinished(() => {
    rmSync(parent, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  });

  await createApp({ name: 'Starter', directory, framework: ROOT });
  mkdirSync(join(directory, 'node_modules'), { recursive: true });
  symlinkSync(ROOT, join(directory, 'node_modules/kuito'), 'dir');
  writeFileSync(join(directory, 'entry.tsx'), source);

  const { code } = await createSourceCompiler({ platform: 'ios', outputDir: output })(
    join(directory, 'entry.tsx'),
  );
  const views = new Map<string, { kind: string; props: Record<string, unknown> }>();
  const uiThread = ui ? installUIKernel() : null;
  const kernel = installKernel(
    hosting({
      createView(id: string, kind: string) {
        views.set(id, { kind, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        const view = views.get(id);

        if (view) view.props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
      moveView() {},
      ...(uiThread && {
        ui: (operations: unknown[]) => uiThread.ui.receive(structuredClone(operations)),
        uiScript(code: string) {
          uiThread.load(code);
        },
        __kuitoHostMotionRead: (id: string) => uiThread.mirror.get(id),
      }),
    }),
  );
  const settle = () => new Promise((done) => setTimeout(done, 0));

  runInNewContext(code, kernel);
  await settle();

  const idOf = (kind: string) => {
    const found = [...views].find(([, view]) => view.kind === kind);

    assert.ok(found, `a ${kind} view`);

    return found[0];
  };

  return {
    kernel,
    views,
    uiThread,
    texts: () =>
      [...views.values()].flatMap((view) => (view.kind === 'Text' ? [view.props.text] : [])),
    async send(kind: string, event: string, payload?: object) {
      nativeEvent(
        kernel.__kuito,
        `${idOf(kind)}.${event}` + (payload ? '\u001f' + JSON.stringify(payload) : ''),
      );

      await settle();
    },
  };
}

test('the state demo greets whoever is typed, loudly when switched on', async () => {
  const demo = await runInStarter(
    `import { StateDemo } from './app/_components/demos/state';\nexport default StateDemo;\n`,
  );

  assert.ok(demo.texts().includes('Hello, stranger'));

  await demo.send('TextField', 'change', { text: 'Ada' });
  assert.ok(demo.texts().includes('Hello, Ada'));

  await demo.send('Toggle', 'change', { value: true });
  assert.ok(demo.texts().includes('HELLO, ADA!'));
});

test('the layout demo steps through justifyContent', async () => {
  const demo = await runInStarter(
    `import { LayoutDemo } from './app/_components/demos/layout';\nexport default LayoutDemo;\n`,
  );

  assert.ok(demo.texts().includes('justifyContent: flex-start'));

  await demo.send('Pressable', 'press');
  assert.ok(demo.texts().includes('justifyContent: center'));
});

test('the layout demo’s swatches fill its track, laid out for real', async () => {
  const parent = temp();
  const directory = join(parent, 'Swatches');

  try {
    await createApp({ name: 'Swatches', directory, framework: ROOT });
    mkdirSync(join(directory, 'node_modules'), { recursive: true });
    symlinkSync(ROOT, join(directory, 'node_modules/kuito'), 'dir');

    const entry = join(directory, 'layout.tsx');

    writeFileSync(
      entry,
      "import { LayoutDemo } from './app/_components/demos/layout';\nexport default LayoutDemo;\n",
    );

    const host = await headlessApp(entry);
    const swatches = [...host.renderer.views.values()].filter((view) => view.kind === 'Box');

    assert.equal(swatches.length, 3);

    // An HStack centers its children across it: a swatch sized by width alone is 0 tall.
    for (const swatch of swatches) {
      const { width, height } = host.renderer.engine.box(swatch.node);

      assert.deepEqual({ width, height }, { width: 56, height: 56 });
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the gestures demo swipes away and pinches to zoom with no JS handler or round trip', async () => {
  const demo = await runInStarter(
    `import { GesturesDemo } from './app/_components/demos/gestures';\nexport default GesturesDemo;\n`,
    { ui: true },
  );
  const ui = demo.uiThread;

  assert.ok(ui);

  const send = (id: string, payload: object) => {
    const gestures = demo.views.get(id)?.props.gestures as { tag: number }[];

    ui.ui.event(
      handleOf(demo.kernel.__kuito, id),
      'gesture',
      JSON.stringify({
        handlerTag: gestures[0].tag,
        numberOfPointers: 1,
        pointerType: 0,
        ...payload,
      }),
    );
  };
  const shown = (id: string, prop: string) => {
    const view = handleOf(demo.kernel.__kuito, id);
    const written = ui.props.filter(([at, name]) => at === view && name === prop);

    return written.length ? Number(written[written.length - 1][2]) : undefined;
  };
  const before = demo.kernel.__kuito.stats().total.uiMessages;

  send('swipe-card', { state: 4, oldState: 2 });
  send('swipe-card', { state: 4, translationX: -120 });
  assert.equal(shown('swipe-card', 'translateX'), -120);
  send('swipe-card', { state: 5, oldState: 4, velocityX: -1500 });
  for (let now = 0; now <= 3000; now += 1000 / 60) ui.ui.frame(now);
  assert.ok(Number(shown('swipe-card', 'translateX')) < -300, 'thrown away');

  send('zoom-photo', { state: 4, oldState: 2 });
  send('zoom-photo', { state: 4, scale: 1.5 });
  assert.equal(shown('zoom-photo', 'scale'), 1.5);
  send('zoom-photo', { state: 5, oldState: 4 });
  for (let now = 3000; now <= 6000; now += 1000 / 60) ui.ui.frame(now);
  assert.equal(shown('zoom-photo', 'scale'), 1);

  assert.deepEqual(ui.sent, []);
  assert.equal(demo.kernel.__kuito.stats().total.uiMessages, before);
});
