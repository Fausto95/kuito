import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import type { Device } from '../src/cli/devices.ts';
import { buildAndroid, buildIOS } from '../src/cli/platforms.ts';
import { loadProject, type Project } from '../src/cli/project.ts';
import { androidManifest, androidProperties, iosProjectSpec } from '../src/cli/shells.ts';
import { resolveConfig, type AppConfig } from '../src/cli/kuito-config.ts';
import { androidAppIcon, iosAppIcon } from '../src/cli/app-icons.ts';
import { encodePng } from '../src/cli/png.ts';
import type { RunOptions } from './support/cli.ts';
import { font } from './support/sfnt.ts';
import { moduleAt } from './support/module-source.ts';

const FILE = '/app/kuito.config.ts';

const config = {
  name: 'Hello Kuito',
  ios: { bundleIdentifier: 'com.example.hello' },
  android: { applicationId: 'com.example.hello' },
  permissions: {},
};

const resolved: AppConfig = {
  name: 'Hello Kuito',
  version: '1.0.0',
  buildNumber: 1,
  icon: null,
  orientation: 'default',
  colorScheme: 'automatic',
  backgroundColor: null,
  statusBar: { style: 'auto', hidden: false },
  urlSchemes: [],
  linkDomains: [],
  ios: {
    bundleIdentifier: 'com.example.hello',
    icon: { light: null, dark: null, tinted: null },
    supportsTablet: true,
    requiresFullScreen: false,
    deploymentTarget: '16.0',
    teamId: null,
    associatedDomains: [],
    pushEnvironment: null,
    backgroundModes: [],
    infoPlist: {},
    entitlements: {},
  },
  android: {
    applicationId: 'com.example.hello',
    adaptiveIcon: { foreground: null, background: null, monochrome: null },
    softInputMode: 'resize',
    minSdk: 26,
    signing: { keystore: null, keyAlias: null },
    manifest: {
      application: {},
      activity: {},
      metaData: {},
      usesPermissions: [],
      usesFeatures: [],
      queries: { packages: [], intents: [] },
      intentFilters: [],
    },
    theme: {},
  },
  permissions: {},
  backgroundTasks: [],
  fonts: [],
  splash: null,
  updates: null,
  strict: false,
  migrations: [],
};

const withIcon: AppConfig = {
  ...resolved,
  icon: { path: '/app/assets/icon.png', origin: `${FILE}: icon ('./assets/icon.png')` },
};

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'kuito-shell-'));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

const projectIn = (root: string, app: AppConfig = resolved): Project => ({
  root,
  cache: join(root, '.kuito'),
  environment: 'production',
  config: app,
});

test('a config names the app and its platform ids; anything else is an error naming the file and key', () => {
  assert.deepEqual(resolveConfig(config, FILE, 'production'), resolved);

  const invalid: [unknown, RegExp][] = [
    [null, /kuito\.config\.ts: export default an object/],
    [{ ...config, name: '' }, /kuito\.config\.ts: name must be a non-empty string/],
    [
      { ...config, ios: { bundleIdentifier: 'hello' } },
      /kuito\.config\.ts: ios\.bundleIdentifier must be a reverse-DNS id like com\.example\.app/,
    ],
    [
      { ...config, android: { applicationId: 'com.example.my-app' } },
      /kuito\.config\.ts: android\.applicationId must be a reverse-DNS id/,
    ],
    [{ name: 'App', ios: config.ios }, /android\.applicationId/],
    [{ ...config, icons: './icon.png' }, /kuito\.config\.ts: icons is not a config key/],
    [{ ...config, ios: 'com.example.hello' }, /kuito\.config\.ts: ios must be an object/],
    [{ ...config, icon: './icon.jpg' }, /kuito\.config\.ts: icon must be a \.png file/],
    [
      { ...config, ios: { ...config.ios, icon: { dark: './dark.png' } } },
      /kuito\.config\.ts: ios\.icon\.dark needs a light icon: set icon or ios\.icon\.light/,
    ],
    [
      {
        ...config,
        android: { ...config.android, adaptiveIcon: { background: 'blue' } },
      },
      /kuito\.config\.ts: android\.adaptiveIcon\.background must be a color like #1E88E5 or a \.png file/,
    ],
    [
      { ...config, android: { ...config.android, adaptiveIcon: { background: '#ffffff' } } },
      /android\.adaptiveIcon needs a foreground: set icon or android\.adaptiveIcon\.foreground/,
    ],
    [{ ...config, idSuffix: '.dev' }, /kuito\.config\.ts: idSuffix is not a config key/],
  ];

  for (const [value, message] of invalid)
    assert.throws(() => resolveConfig(value, FILE, 'production'), message);
});

test('icons are .png paths relative to kuito.config.ts, remembered with the key that set them', () => {
  const app = resolveConfig(
    {
      ...config,
      icon: './assets/icon.png',
      ios: { ...config.ios, icon: { dark: 'assets/dark.png', tinted: '/abs/tinted.png' } },
      android: {
        ...config.android,
        adaptiveIcon: { foreground: './fg.png', background: '#1E88E5', monochrome: './mono.png' },
      },
    },
    FILE,
    'production',
  );

  assert.deepEqual(app.icon, withIcon.icon);

  assert.deepEqual(app.ios.icon, {
    light: null,
    dark: { path: '/app/assets/dark.png', origin: `${FILE}: ios.icon.dark ('assets/dark.png')` },
    tinted: { path: '/abs/tinted.png', origin: `${FILE}: ios.icon.tinted ('/abs/tinted.png')` },
  });

  assert.deepEqual(app.android.adaptiveIcon, {
    foreground: {
      path: '/app/fg.png',
      origin: `${FILE}: android.adaptiveIcon.foreground ('./fg.png')`,
    },
    background: '#1E88E5',
    monochrome: {
      path: '/app/mono.png',
      origin: `${FILE}: android.adaptiveIcon.monochrome ('./mono.png')`,
    },
  });
});

const staged = {
  ...config,
  icon: './assets/icon.png',
  environments: {
    staging: { name: 'Hello Staging', idSuffix: '.staging', icon: './assets/icon-staging.png' },
    development: { ios: { icon: { dark: './assets/dark.png' } } },
  },
};

test('a version and build number default to 1.0.0 and 1, and an environment can override them', () => {
  const app = {
    ...config,
    version: '2.4',
    buildNumber: 310,
    environments: { staging: { buildNumber: 311 } },
  };

  assert.deepEqual(
    [resolveConfig(app, FILE, 'production'), resolveConfig(app, FILE, 'staging')].map(
      ({ version, buildNumber }) => [version, buildNumber],
    ),
    [
      ['2.4', 310],
      ['2.4', 311],
    ],
  );

  const invalid: [object, RegExp][] = [
    [{ version: '1.2.3.4' }, /version must be up to three numbers like 1\.2\.0, not '1\.2\.3\.4'/],
    [{ version: 'v1.0' }, /version must be up to three numbers/],
    [{ version: 1.2 }, /version must be up to three numbers like 1\.2\.0, not '1\.2'/],
    [{ buildNumber: 0 }, /buildNumber must be a whole number from 1 to 2100000000/],
    [{ buildNumber: 1.5 }, /buildNumber must be a whole number/],
    [{ buildNumber: '3' }, /buildNumber must be a whole number/],
    [{ buildNumber: 2_100_000_001 }, /buildNumber must be a whole number from 1 to 2100000000/],
    [
      { environments: { qa: { buildNumber: -1 } } },
      /environments\.qa\.buildNumber must be a whole number/,
    ],
  ];

  for (const [extra, message] of invalid)
    assert.throws(() => resolveConfig({ ...config, ...extra }, FILE, 'production'), {
      message: new RegExp('kuito\\.config\\.ts: ' + message.source),
    });
});

test('the shells carry the version and build number', () => {
  const app = { ...resolved, version: '2.4.1', buildNumber: 57 };
  const spec = JSON.parse(iosProjectSpec(app, '/fw', [], '/hermes')) as {
    targets: { KuitoIOS: { info: { properties: Record<string, string> } } };
  };

  assert.equal(spec.targets.KuitoIOS.info.properties.CFBundleShortVersionString, '2.4.1');
  assert.equal(spec.targets.KuitoIOS.info.properties.CFBundleVersion, '57');

  const properties = androidProperties(projectIn('/app', app), []);

  assert.ok(properties.includes('-Pkuito.versionName=2.4.1'));
  assert.ok(properties.includes('-Pkuito.versionCode=57'));
});

test('an environment overrides keys of the base config, which is production', () => {
  assert.deepEqual(resolveConfig(staged, FILE, 'production'), withIcon);

  assert.deepEqual(resolveConfig(staged, FILE, 'staging'), {
    ...withIcon,
    name: 'Hello Staging',
    icon: {
      path: '/app/assets/icon-staging.png',
      origin: `${FILE}: environments.staging.icon ('./assets/icon-staging.png')`,
    },
    ios: { ...withIcon.ios, bundleIdentifier: 'com.example.hello.staging' },
    android: { ...withIcon.android, applicationId: 'com.example.hello.staging' },
  });

  const development = resolveConfig(staged, FILE, 'development');

  assert.equal(development.ios.bundleIdentifier, 'com.example.hello', 'nested overrides merge');

  assert.equal(
    development.ios.icon.dark?.origin,
    `${FILE}: environments.development.ios.icon.dark ('./assets/dark.png')`,
  );
});

test('development and production always exist; other environments must be declared', () => {
  assert.deepEqual(resolveConfig(config, FILE, 'development'), resolved);

  assert.throws(
    () => resolveConfig(staged, FILE, 'stagin'),
    /kuito\.config\.ts: no environment 'stagin'\. Declared: staging, development; development and production always exist/,
  );
});

test('every environment is validated, not only the one selected', () => {
  const invalid: [unknown, RegExp][] = [
    [
      { ...config, environments: { qa: { idSuffix: 'qa' } } },
      /kuito\.config\.ts: environments\.qa\.idSuffix must start with \. and add id segments, like \.staging/,
    ],
    [
      { ...config, environments: { qa: { icon: './qa.gif' } } },
      /kuito\.config\.ts: environments\.qa\.icon must be a \.png file/,
    ],
    [
      { ...config, environments: { qa: { environments: {} } } },
      /kuito\.config\.ts: environments\.qa\.environments is not a config key/,
    ],
    [
      { ...config, environments: { QA: {} } },
      /kuito\.config\.ts: environments\.QA: environment names are lowercase letters, digits and -/,
    ],
    [{ ...config, environments: [] }, /kuito\.config\.ts: environments must be an object/],
    [
      { ...config, environments: { qa: { ios: { bundleIdentifier: 'qa' } } } },
      /kuito\.config\.ts: environments\.qa\.ios\.bundleIdentifier must be a reverse-DNS id/,
    ],
  ];

  for (const [value, message] of invalid)
    assert.throws(() => resolveConfig(value, FILE, 'production'), message);
});

const splashed = {
  ...config,
  splash: {
    logo: './assets/logo.png',
    background: '#0B1020',
    logoWidth: 120,
    brand: './assets/brand.png',
    dark: { logo: './assets/logo-dark.png', background: '#000000' },
  },
};

const source = (path: string, key: string, written: string) => ({
  path,
  origin: `${FILE}: ${key} ('${written}')`,
});

const splash = {
  logo: source('/app/assets/logo.png', 'splash.logo', './assets/logo.png'),
  logoWidth: 120,
  background: '#0B1020',
  brand: source('/app/assets/brand.png', 'splash.brand', './assets/brand.png'),
  dark: {
    logo: source('/app/assets/logo-dark.png', 'splash.dark.logo', './assets/logo-dark.png'),
    background: '#000000',
    brand: null,
  },
  variants: {},
};

test('a splash is a logo over a background, with an optional brand and dark appearance', () => {
  assert.deepEqual(resolveConfig(splashed, FILE, 'production').splash, splash);

  assert.deepEqual(
    resolveConfig({ ...config, splash: { logo: './logo.png' } }, FILE, 'production').splash,
    {
      logo: source('/app/logo.png', 'splash.logo', './logo.png'),
      logoWidth: 100,
      background: '#FFFFFF',
      brand: null,
      dark: { logo: null, background: null, brand: null },
      variants: {},
    },
    'a white background and a 100-point logo by default',
  );
});

test('splash keys are checked, naming the file and the key', () => {
  const invalid: [unknown, RegExp][] = [
    [{ background: '#FFFFFF' }, /kuito\.config\.ts: splash\.logo must be a \.png file/],
    [{ logo: './logo.svg' }, /kuito\.config\.ts: splash\.logo must be a \.png file/],
    [
      { logo: './logo.png', background: 'navy' },
      /kuito\.config\.ts: splash\.background must be a color like #1E88E5/,
    ],
    [
      { logo: './logo.png', logoWidth: 0 },
      /kuito\.config\.ts: splash\.logoWidth must be a whole number from 1 to 288/,
    ],
    [
      { logo: './logo.png', logoWidth: 300 },
      /kuito\.config\.ts: splash\.logoWidth must be a whole number from 1 to 288/,
    ],
    [
      { logo: './logo.png', dark: { brand: './brand-dark.png' } },
      /kuito\.config\.ts: splash\.dark\.brand needs a light brand: set splash\.brand/,
    ],
    [
      { logo: './logo.png', dark: { tint: '#000000' } },
      /kuito\.config\.ts: splash\.dark\.tint is not a config key/,
    ],
    [
      { logo: './logo.png', variants: { 'New-Year': {} } },
      /kuito\.config\.ts: splash\.variants\.New-Year: variant names are lowercase letters, digits and _/,
    ],
    [
      { logo: './logo.png', variants: { holiday: { logo: './holiday.jpg' } } },
      /kuito\.config\.ts: splash\.variants\.holiday\.logo must be a \.png file/,
    ],
    [
      { logo: './logo.png', variants: { holiday: { variants: {} } } },
      /kuito\.config\.ts: splash\.variants\.holiday\.variants is not a config key/,
    ],
    ['./logo.png', /kuito\.config\.ts: splash must be an object/],
  ];

  for (const [value, message] of invalid)
    assert.throws(() => resolveConfig({ ...config, splash: value }, FILE, 'production'), message);

  assert.throws(
    () =>
      resolveConfig(
        { ...config, environments: { qa: { splash: { background: '#FFF' } } } },
        FILE,
        'production',
      ),
    /kuito\.config\.ts: environments\.qa\.splash\.background must be a color/,
  );
});

test('an environment overrides splash keys one by one; variants inherit the rest of the splash', () => {
  const app = {
    ...splashed,
    splash: { ...splashed.splash, variants: { holiday: { logo: './assets/holiday.png' } } },
    environments: {
      staging: {
        splash: {
          background: '#FFB300',
          variants: { holiday: { background: '#C62828' }, launch: { logoWidth: 200 } },
        },
      },
    },
  };
  const staging = resolveConfig(app, FILE, 'staging').splash;
  const { variants: _, ...look } = splash;
  const holiday = {
    ...look,
    logo: source('/app/assets/holiday.png', 'splash.variants.holiday.logo', './assets/holiday.png'),
  };

  assert.deepEqual(resolveConfig(app, FILE, 'production').splash, {
    ...splash,
    variants: { holiday },
  });

  assert.equal(staging?.background, '#FFB300');
  assert.equal(staging?.logo.origin, splash.logo.origin, 'the rest is inherited');
  assert.equal(staging?.variants.holiday.background, '#C62828');
  assert.equal(staging?.variants.holiday.logo.path, '/app/assets/holiday.png');

  assert.equal(
    staging?.variants.launch.background,
    '#FFB300',
    'a variant inherits the environment',
  );

  assert.equal(staging?.variants.launch.logoWidth, 200);
  assert.deepEqual(resolveConfig(config, FILE, 'production').splash, null, 'no splash');
});

test('a project reads kuito.config.ts for an environment; without one it is no app', async () => {
  const bare = tempDir();

  await assert.rejects(
    loadProject(bare, 'development'),
    /No kuito\.config\.ts in .*: run kuito in an app's directory, or make one with kuito create <Name>/,
  );

  const app = tempDir();

  writeFileSync(join(app, 'package.json'), '{ "type": "module" }');

  writeFileSync(
    join(app, 'kuito.config.ts'),
    `import type { KuitoConfig } from 'kuito/config';\n\nexport default ${JSON.stringify(staged)} satisfies KuitoConfig;\n`,
  );

  const project = await loadProject(app, 'staging');

  assert.equal(project.environment, 'staging');
  assert.equal(project.config.android.applicationId, 'com.example.hello.staging');
  assert.equal(project.config.icon?.path, join(app, 'assets/icon-staging.png'));
});

test('the iOS shell is the framework’s spec, included, with the app’s id, name and bundled JS', () => {
  const spec: unknown = JSON.parse(iosProjectSpec(resolved, '/fw', [], '/hermes'));

  assert.deepEqual(spec, {
    include: [{ path: '/fw/native/ios/project.yml', relativePaths: true }],
    settings: {
      base: {
        KUITO_NATIVE: '/fw/native/ios',
        KUITO_HERMES: '/hermes',
        KUITO_NATIVE_OPTIMIZATION: '-O2',
      },
    },
    packages: { HermesEngine: { path: '/hermes' } },
    targets: {
      KuitoIOS: {
        sources: [
          { path: 'Resources', buildPhase: 'resources' },
          { path: 'Modules', type: 'folder', buildPhase: 'resources' },
          { path: 'Generated' },
        ],
        dependencies: [{ package: 'HermesEngine', product: 'hermesvm' }],
        settings: { base: { PRODUCT_BUNDLE_IDENTIFIER: 'com.example.hello' } },
        info: {
          path: 'Info.plist',
          properties: {
            CFBundleDisplayName: 'Hello Kuito',
            CFBundleShortVersionString: '1.0.0',
            CFBundleVersion: '1',
            UILaunchScreen: {},
            NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
          },
        },
      },
    },
  });
});

test('only the development shell allows insecure loads: ATS on iOS, cleartext on Android', () => {
  const plist = (profile: 'debug' | 'release', app = resolved) =>
    (
      JSON.parse(iosProjectSpec(app, '/fw', [], '/hermes', false, profile)) as {
        targets: { KuitoIOS: { info: { properties: Record<string, unknown> } } };
      }
    ).targets.KuitoIOS.info.properties;

  assert.deepEqual(plist('debug').NSAppTransportSecurity, { NSAllowsArbitraryLoads: true });
  assert.equal(plist('release').NSAppTransportSecurity, undefined);

  assert.doesNotMatch(
    readFileSync(join(ROOT, 'native/ios/project.yml'), 'utf8'),
    /NSAppTransportSecurity/,
    'the generated spec decides per profile',
  );

  // The app's own policy keeps its keys; under them, a debug shell still loads anything.
  const ats = { NSExceptionDomains: { 'example.com': { NSIncludesSubdomains: true } } };
  const own: AppConfig = {
    ...resolved,
    ios: { ...resolved.ios, infoPlist: { NSAppTransportSecurity: ats } },
  };

  assert.deepEqual(plist('debug', own).NSAppTransportSecurity, {
    NSAllowsArbitraryLoads: true,
    ...ats,
  });

  assert.deepEqual(plist('release', own).NSAppTransportSecurity, ats);

  const strict: AppConfig = {
    ...resolved,
    ios: {
      ...resolved.ios,
      infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: false } },
    },
  };

  assert.deepEqual(
    plist('debug', strict).NSAppTransportSecurity,
    { NSAllowsArbitraryLoads: false },
    'what the app sets wins',
  );

  const manifest = readFileSync(
    join(ROOT, 'native/android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  const gradle = readFileSync(join(ROOT, 'native/android/app/build.gradle.kts'), 'utf8');

  assert.match(manifest, /android:usesCleartextTraffic="\$\{usesCleartextTraffic\}"/);
  assert.match(gradle, /debug \{[^}]*manifestPlaceholders\["usesCleartextTraffic"\] = "true"/);
  assert.match(gradle, /release \{[^}]*manifestPlaceholders\["usesCleartextTraffic"\] = "false"/);
});

/** The files under `directory`, recursively, whose names end with one of `extensions`. */
const sourcesIn = (directory: string, extensions: readonly string[]) =>
  existsSync(directory)
    ? readdirSync(directory, { recursive: true, encoding: 'utf8' })
        .filter((file) => extensions.some((extension) => file.endsWith(extension)))
        .map((file) => join(directory, file))
    : [];

/** The types the files define, named like their files, as the shells name them. */
const typesOf = (files: readonly string[]) =>
  files
    .map((file) => basename(file).replace(/\..*$/, ''))
    .filter((name) => name.startsWith('Kuito'));

test('the release iOS shell compiles out the dev server, the devtools and the LogBox', () => {
  const spec = readFileSync(join(ROOT, 'native/ios/project.yml'), 'utf8');
  const target = spec.slice(spec.indexOf('\ntargets:'));
  const excluded = (config: string) =>
    new RegExp(`\\n {8}${config}:\\n(?: {10}.*\\n)*? {10}EXCLUDED_SOURCE_FILE_NAMES: '([^']*)'`)
      .exec(target)?.[1]
      .split(' ') ?? [];

  assert.deepEqual(
    excluded('Release').sort(),
    ['*/native/ios/App/Debug/*', '*/native/ios/App/Devtools/*', '*/native/ios/App/LogBox/*'],
    'Release compiles none of the dev shell, and nothing of an app’s own folders',
  );

  assert.deepEqual(
    excluded('Debug'),
    ['*/native/ios/App/Release/*'],
    'and Debug none of the release one',
  );

  const app = join(ROOT, 'native/ios/App');
  const swift = ['.swift', '.m', '.mm', '.h'];
  const development = ['Debug', 'Devtools', 'LogBox'].flatMap((dir) =>
    sourcesIn(join(app, dir), swift),
  );
  // The inspector's header declares the bridge's optional debugger; its code is KUITO_INSPECTOR only.
  const devTypes = typesOf(development).filter(
    (name) => name !== 'KuitoInspector' && name !== 'KuitoViewController',
  );
  const release = [
    ...sourcesIn(app, swift).filter((file) => !/\/App\/(Debug|Devtools|LogBox)\//.test(file)),
    ...sourcesIn(join(ROOT, 'native/ios/Renderer'), swift),
    ...sourcesIn(join(ROOT, 'native/ios/Modules'), swift),
  ];

  assert.ok(existsSync(join(app, 'Debug/KuitoViewController.swift')));
  assert.ok(existsSync(join(app, 'Release/KuitoViewController.swift')));
  assert.ok(devTypes.includes('KuitoLogBox') && devTypes.includes('KuitoDevtools'));

  for (const file of release) {
    const text = readFileSync(file, 'utf8');

    for (const type of devTypes)
      assert.doesNotMatch(text, new RegExp(`\\b${type}\\b`), `${file} names ${type}`);

    assert.doesNotMatch(text, /KUITO_DEV_URL/, `${file} reads the dev server's address`);
    assert.doesNotMatch(text, /KUITO_DEV_TOKEN/, `${file} reads the phone link's token`);
  }
});

test('the iOS dev shell sends the phone link token on both of its sockets', () => {
  const devtools = join(ROOT, 'native/ios/App/Devtools');
  const inspector = readFileSync(join(devtools, 'KuitoInspector.mm'), 'utf8');
  const socket = readFileSync(join(devtools, 'KuitoDevSocket.swift'), 'utf8');

  // One reader of the token: the inspector builds every dev request, its own and the dev link's.
  assert.match(inspector, /environment\[@"KUITO_DEV_TOKEN"\]/);
  assert.match(inspector, /forHTTPHeaderField:@"Authorization"/);
  assert.match(inspector, /webSocketTaskWithRequest:\[KuitoInspector devRequestTo:_url\]/);
  assert.match(socket, /webSocketTask\(with: KuitoInspector\.devRequest\(to: url\)\)/);
});

test('the Android dev shell takes its dev link from its private files and sends the token', () => {
  const debug = join(ROOT, 'native/android/app/src/debug/java/dev/kuito/runtime');
  const activity = readFileSync(join(debug, 'KuitoActivity.kt'), 'utf8');
  const link = readFileSync(join(debug, 'devtools/KuitoDevLink.kt'), 'utf8');

  // The activity is exported: any app can start it with extras, so it reads none.
  assert.doesNotMatch(activity, /getStringExtra|kuito_dev_url/);
  assert.match(link, /"kuito-dev-link\.json"/);
  assert.match(link, /header\("Authorization", "Bearer \$/);

  for (const file of ['devtools/KuitoDevSocket.kt', 'devtools/KuitoInspector.kt'])
    assert.match(readFileSync(join(debug, file), 'utf8'), /KuitoDevLink\.request\(/, file);
});

test('a dev shell on a phone dials no default server, and says when the token is wrong', () => {
  const ios = join(ROOT, 'native/ios/App');
  const controller = readFileSync(join(ios, 'Debug/KuitoViewController.swift'), 'utf8');
  const inspector = readFileSync(join(ios, 'Devtools/KuitoInspector.mm'), 'utf8');
  const socket = readFileSync(join(ios, 'Devtools/KuitoDevSocket.swift'), 'utf8');
  const android = join(ROOT, 'native/android/app/src/debug/java/dev/kuito/runtime/devtools');

  // A phone's 127.0.0.1 is the phone: only a simulator shares the Mac's loopback.
  assert.match(
    controller,
    /#if targetEnvironment\(simulator\)[\s\S]*ws:\/\/127\.0\.0\.1:8765[\s\S]*#endif/,
  );

  // Read once, then gone from the environment.
  assert.match(inspector, /unsetenv\("KUITO_DEV_TOKEN"\)/);

  for (const [file, text] of [
    ['KuitoDevSocket.swift', socket],
    ['KuitoDevSocket.kt', readFileSync(join(android, 'KuitoDevSocket.kt'), 'utf8')],
  ])
    assert.match(text, /401[\s\S]{0,240}token/, `${file} names a refused token`);
});

test('the release Android shell compiles out the dev server, the devtools and the LogBox', () => {
  const src = join(ROOT, 'native/android/app/src');
  const kotlin = ['.kt'];
  const development = sourcesIn(join(src, 'debug/java'), kotlin);
  const devTypes = typesOf(development).filter((name) => name !== 'KuitoActivity');
  const release = [
    ...sourcesIn(join(src, 'main/java'), kotlin),
    ...sourcesIn(join(src, 'release/java'), kotlin),
  ];

  assert.ok(existsSync(join(src, 'debug/java/dev/kuito/runtime/KuitoActivity.kt')));
  assert.ok(existsSync(join(src, 'release/java/dev/kuito/runtime/KuitoActivity.kt')));
  assert.ok(devTypes.includes('KuitoLogBox') && devTypes.includes('KuitoDevtools'));
  assert.ok(devTypes.includes('KuitoInspector') && devTypes.includes('KuitoDevSocket'));

  for (const file of release) {
    const text = readFileSync(file, 'utf8');

    assert.doesNotMatch(text, /import dev\.kuito\.runtime\.(devtools|logbox)\./, file);

    for (const type of devTypes)
      assert.doesNotMatch(text, new RegExp(`\\b${type}\\b`), `${file} names ${type}`);

    assert.doesNotMatch(text, /kuito_dev_url/, `${file} reads the dev server's address`);
  }
});

test('an app that imports images adds their catalog and resources to the shells', () => {
  const sources = (images: boolean) =>
    (
      JSON.parse(iosProjectSpec(resolved, '/fw', [], '/hermes', images)) as {
        targets: { KuitoIOS: { sources: { path: string }[] } };
      }
    ).targets.KuitoIOS.sources.map(({ path }) => path);

  assert.ok(sources(true).includes('Assets.xcassets'));
  assert.ok(!sources(false).includes('Assets.xcassets'));

  assert.ok(
    androidProperties(projectIn('/app'), [], true).includes(
      '-Pkuito.imagesRes=/app/.kuito/android/images',
    ),
  );

  assert.ok(!androidProperties(projectIn('/app'), []).some((each) => each.includes('imagesRes')));
});

test('an app with an icon adds its generated asset catalog to the iOS shell', () => {
  const spec: unknown = JSON.parse(iosProjectSpec(withIcon, '/fw', [], '/hermes'));

  assert.deepEqual(spec, {
    include: [{ path: '/fw/native/ios/project.yml', relativePaths: true }],
    settings: {
      base: {
        KUITO_NATIVE: '/fw/native/ios',
        KUITO_HERMES: '/hermes',
        KUITO_NATIVE_OPTIMIZATION: '-O2',
      },
    },
    packages: { HermesEngine: { path: '/hermes' } },
    targets: {
      KuitoIOS: {
        sources: [
          { path: 'Resources', buildPhase: 'resources' },
          { path: 'Modules', type: 'folder', buildPhase: 'resources' },
          { path: 'AppIcon.xcassets' },
          { path: 'Generated' },
        ],
        dependencies: [{ package: 'HermesEngine', product: 'hermesvm' }],
        settings: {
          base: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.example.hello',
            ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
          },
        },
        info: {
          path: 'Info.plist',
          properties: {
            CFBundleDisplayName: 'Hello Kuito',
            CFBundleShortVersionString: '1.0.0',
            CFBundleVersion: '1',
            UILaunchScreen: {},
            NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
          },
        },
      },
    },
  });
});

const cameraModule = moduleAt('/app/modules/Camera', {
  name: 'Camera',
  ios: {
    class: 'CameraModule',
    swiftPackages: [
      { url: 'https://github.com/example/Lens.git', from: '2.1.0', products: ['Lens', 'LensUI'] },
    ],
    infoPlist: { NSCameraUsageDescription: 'Scan codes' },
    frameworks: ['AVFoundation'],
  },
  android: {
    class: 'com.example.camera.CameraModule',
    dependencies: ['androidx.camera:camera-camera2:1.4.1'],
    permissions: ['android.permission.CAMERA'],
  },
});

const haptics = moduleAt('/fw/native/modules/Haptics', {
  name: 'Haptics',
  ios: { class: 'KuitoHapticsModule' },
  android: { class: 'dev.kuito.runtime.modules.haptics.KuitoHapticsModule' },
});

test('included modules add their sources, packages, frameworks and Info.plist keys to the iOS shell', () => {
  const spec = JSON.parse(iosProjectSpec(resolved, '/fw', [cameraModule, haptics], '/hermes'));
  const target = spec.targets.KuitoIOS;

  assert.deepEqual(target.sources, [
    { path: 'Resources', buildPhase: 'resources' },
    { path: 'Modules', type: 'folder', buildPhase: 'resources' },
    { path: 'Generated' },
    { path: '/app/modules/Camera/ios' },
    { path: '/fw/native/modules/Haptics/ios' },
  ]);

  assert.deepEqual(spec.packages, {
    HermesEngine: { path: '/hermes' },
    Lens: { url: 'https://github.com/example/Lens.git', from: '2.1.0' },
  });

  assert.deepEqual(target.dependencies, [
    { package: 'HermesEngine', product: 'hermesvm' },
    { package: 'Lens', product: 'Lens' },
    { package: 'Lens', product: 'LensUI' },
    { sdk: 'AVFoundation.framework' },
  ]);

  assert.deepEqual(target.info.properties, {
    CFBundleDisplayName: 'Hello Kuito',
    CFBundleShortVersionString: '1.0.0',
    CFBundleVersion: '1',
    UILaunchScreen: {},
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
    NSCameraUsageDescription: 'Scan codes',
  });
});

test('two modules that set one Info.plist key differently is an error naming both', () => {
  const scanner = moduleAt('/app/modules/Scanner', {
    name: 'Scanner',
    ios: { class: 'ScannerModule', infoPlist: { NSCameraUsageDescription: 'Scan receipts' } },
  });

  assert.throws(
    () => iosProjectSpec(resolved, '/fw', [cameraModule, scanner], '/hermes'),
    /NSCameraUsageDescription is set by both \/app\/modules\/Camera\/Camera\.ts and \/app\/modules\/Scanner\/Scanner\.ts/,
  );
});

test('an app with a splash launches with its generated storyboard on iOS', () => {
  const app = resolveConfig(splashed, FILE, 'production');
  const spec = JSON.parse(iosProjectSpec(app, '/fw', [], '/hermes')) as {
    targets: { KuitoIOS: { sources: unknown[]; info: { properties: Record<string, unknown> } } };
  };
  const { sources, info } = spec.targets.KuitoIOS;

  assert.deepEqual(sources, [
    { path: 'Resources', buildPhase: 'resources' },
    { path: 'Modules', type: 'folder', buildPhase: 'resources' },
    { path: 'Generated' },
    { path: 'Splash' },
  ]);

  assert.equal(info.properties.UILaunchStoryboardName, 'Splash');
  assert.equal(info.properties.UILaunchScreen, undefined, 'one launch screen, not two');

  assert.doesNotMatch(
    readFileSync(join(ROOT, 'native/ios/project.yml'), 'utf8'),
    /UILaunch/,
    'the generated spec owns the launch screen',
  );
});

test('the framework’s iOS spec resolves its own paths from KUITO_NATIVE and leaves JS to the app', () => {
  const spec = readFileSync(join(ROOT, 'native/ios/project.yml'), 'utf8');

  assert.match(spec, /KUITO_NATIVE: '\$\(PROJECT_DIR\)'/);

  assert.match(
    spec,
    /HEADER_SEARCH_PATHS: '\$\(inherited\) \$\(KUITO_NATIVE\)\/\.\.\/shared \$\(KUITO_HERMES\)\/include'/,
  );

  // What the prebuilt Hermes headers were compiled with (src/cli/hermes-ios.ts):
  // the debug Hermes has its debugger and Debug links it; Release links the
  // release Hermes, which has none, as Android's CMake does.
  assert.match(spec, /CLANG_CXX_LANGUAGE_STANDARD: c\+\+20/);

  const project = spec.slice(0, spec.indexOf('\ntargets:'));

  assert.match(
    project,
    /\n {2}configs:\n {4}Debug:\n {6}GCC_PREPROCESSOR_DEFINITIONS: '\$\(inherited\) HERMES_ENABLE_DEBUGGER=1'/,
  );

  assert.equal(project.match(/HERMES_ENABLE_DEBUGGER/g)?.length, 1, 'only in Debug');

  assert.match(
    spec,
    /SWIFT_OBJC_BRIDGING_HEADER: \$\(KUITO_NATIVE\)\/App\/Kuito-Bridging-Header\.h/,
  );

  assert.match(spec, /excludes:\s*\n\s*- Resources/);
});

// The shared C++ every layout pass and touch runs: layout, gestures, the UI
// runtime and the view table. The rest stays at the build's level.
const FRAME_PATH = ['layout', 'gestures', 'UIRuntime.cpp', 'ViewTable.cpp'];
const COLD = ['KuitoRuntime.cpp', 'Standard.cpp', 'Inspector.cpp', 'Socket.cpp', 'Http.cpp'];

test('the frame path’s shared C++ compiles at -O2 in Debug and Release on iOS', () => {
  const optimization = (nativeDebug?: boolean) =>
    (
      JSON.parse(iosProjectSpec(resolved, '/fw', [], '/hermes', false, 'debug', nativeDebug)) as {
        settings: { base: Record<string, unknown> };
      }
    ).settings.base.KUITO_NATIVE_OPTIMIZATION;

  assert.equal(optimization(), '-O2');
  assert.equal(optimization(true), '', 'KUITO_NATIVE_DEBUG leaves it at the build’s level');

  const spec = readFileSync(join(ROOT, 'native/ios/project.yml'), 'utf8');
  const flags = (path: string) =>
    new RegExp(`- path: \\.\\./shared/${path.replace('.', '\\.')}\\n {8}compilerFlags: (.*)`).exec(
      spec,
    )?.[1];

  for (const path of FRAME_PATH)
    assert.equal(flags(path), "'$(KUITO_NATIVE_OPTIMIZATION)'", `${path} at the CLI's level`);

  for (const path of COLD) assert.equal(flags(path), undefined, `${path} at the build's level`);

  assert.match(
    spec.slice(0, spec.indexOf('\ntargets:')),
    /\n {4}KUITO_NATIVE_OPTIMIZATION: -O2\n/,
    'a project made from the spec alone builds them at -O2 too',
  );

  const target = spec.slice(spec.indexOf('\ntargets:'));

  assert.match(
    target,
    /\n {8}Release:\n(?: {10}.*\n)*? {10}GCC_OPTIMIZATION_LEVEL: 2\n/,
    'Release compiles the app at -O2, as Android does',
  );
});

test(
  'KUITO_NATIVE_DEBUG=1 builds the frame path’s C++ at the build’s own level',
  { tags: ['macos'] },
  async () => {
    const optimization = async (environment: Record<string, string>) => {
      const project = projectIn(tempDir());

      await iosBuild({ project, environment });

      return JSON.parse(readFileSync(join(project.cache, 'ios/project.json'), 'utf8')).settings.base
        .KUITO_NATIVE_OPTIMIZATION;
    };

    assert.equal(await optimization({}), '-O2');
    assert.equal(await optimization({ KUITO_NATIVE_DEBUG: '1' }), '');

    const android = async (environment: Record<string, string>) => {
      const { args } = await androidBuild({ project: projectIn(tempDir()), environment });

      assert.ok(args.includes('--no-daemon'), 'Gradle ran');

      return args;
    };

    assert.ok(!(await android({})).some((arg) => arg.includes('nativeDebug')));
    assert.ok((await android({ KUITO_NATIVE_DEBUG: '1' })).includes('-Pkuito.nativeDebug=true'));
  },
);

test('the frame path’s shared C++ compiles at -O2 in every Android build type', () => {
  const cmake = readFileSync(join(ROOT, 'native/android/app/src/main/cpp/CMakeLists.txt'), 'utf8');
  const shared = join(ROOT, 'native/shared');
  const expected = FRAME_PATH.flatMap((path) =>
    path.endsWith('.cpp')
      ? [path]
      : readdirSync(join(shared, path))
          .filter((file) => file.endsWith('.cpp'))
          .map((file) => `${path}/${file}`),
  ).sort();
  const listed = /set\(KUITO_FRAME_PATH_SOURCES\n([^)]*)\)/
    .exec(cmake)?.[1]
    .split('\n')
    .map((line) => line.trim().replace('../../../../../shared/', ''))
    .filter(Boolean)
    .sort();

  assert.deepEqual(listed, expected, 'every frame-path source, as on iOS');

  for (const path of COLD) assert.ok(!listed?.includes(path), `${path} at the build's level`);

  assert.match(
    cmake,
    /if\(NOT KUITO_NATIVE_DEBUG\)\n {2}set_source_files_properties\(\$\{KUITO_FRAME_PATH_SOURCES\} PROPERTIES COMPILE_OPTIONS -O2\)\nendif\(\)/,
    'no build type condition: Debug too',
  );

  // The Hermes header guard is the build type's alone.
  assert.match(
    cmake,
    /if\(CMAKE_BUILD_TYPE STREQUAL "Debug"\)\n {2}target_compile_definitions\(kuito_mobile PRIVATE KUITO_INSPECTOR=1 HERMES_ENABLE_DEBUGGER=1\)\n/,
  );

  const gradle = readFileSync(join(ROOT, 'native/android/app/build.gradle.kts'), 'utf8');

  assert.match(gradle, /gradleProperty\("kuito\.nativeDebug"\)[\s\S]*-DKUITO_NATIVE_DEBUG=ON/);

  assert.ok(
    androidProperties(projectIn('/app'), [], false, true).includes('-Pkuito.nativeDebug=true'),
  );

  assert.ok(!androidProperties(projectIn('/app'), []).some((each) => each.includes('nativeDebug')));
});

test('Kotlin keeps its per-project state in the app, not in the installed framework', () => {
  assert.ok(
    androidProperties(projectIn('/app'), []).includes(
      '-Pkotlin.project.persistent.dir=/app/.kuito/android/.kotlin',
    ),
  );
});

test('the Android shell is the framework’s project, configured by Gradle properties', () => {
  assert.deepEqual(androidProperties(projectIn('/app'), []), [
    '-Pkuito.applicationId=com.example.hello',
    '-Pkuito.appName=Hello Kuito',
    '-Pkuito.assets=/app/.kuito/android/assets',
    '-Pkuito.buildDir=/app/.kuito/android/build',
    '-Pkuito.sources=/app/.kuito/android/generated',
    '-Pkuito.dependencies=',
    '-Pkuito.manifest=/app/.kuito/android/AndroidManifest.xml',
    '-Pkuito.versionName=1.0.0',
    '-Pkuito.versionCode=1',
    '-Pkuito.settingsRes=/app/.kuito/android/settings',
    '-Pkotlin.project.persistent.dir=/app/.kuito/android/.kotlin',
  ]);

  assert.ok(
    androidProperties(projectIn('/app', withIcon), []).includes(
      '-Pkuito.res=/app/.kuito/android/res',
    ),
    'an app with an icon adds its generated resources',
  );

  const properties = androidProperties(projectIn('/app'), [cameraModule, haptics]);

  assert.ok(
    properties.includes(
      `-Pkuito.sources=${[
        '/app/.kuito/android/generated',
        '/app/modules/Camera/android',
        '/fw/native/modules/Haptics/android',
      ].join(delimiter)}`,
    ),
  );

  assert.ok(properties.includes('-Pkuito.dependencies=androidx.camera:camera-camera2:1.4.1'));
});

test('a module’s Android resources join the shell’s, so its manifest entries can name them', () => {
  const picker = {
    ...moduleAt('/fw/native/modules/ImagePicker', {
      name: 'ImagePicker',
      android: { class: 'a.b.ImagePickerModule' },
    }),
    androidResources: '/fw/native/modules/ImagePicker/android/res',
  };

  assert.ok(
    androidProperties(projectIn('/app'), [picker, haptics]).includes(
      '-Pkuito.moduleRes=/fw/native/modules/ImagePicker/android/res',
    ),
  );

  assert.ok(
    !androidProperties(projectIn('/app'), [haptics]).some((each) => each.includes('moduleRes')),
    'no module resources, no property',
  );
});

test('an app with a splash starts its Android activity in the generated splash theme', () => {
  const app = resolveConfig(splashed, FILE, 'production');

  assert.ok(
    androidProperties(projectIn('/app', app), []).includes(
      '-Pkuito.splashRes=/app/.kuito/android/splash',
    ),
  );

  assert.ok(
    !androidProperties(projectIn('/app'), []).some((property) => property.includes('splashRes')),
    'no splash, no splash resources',
  );

  assert.match(
    androidManifest(app, []),
    /<activity android:name="dev\.kuito\.runtime\.KuitoActivity" android:theme="@style\/Theme\.Kuito\.Splash"/,
  );

  assert.doesNotMatch(androidManifest(resolved, []), /Theme\.Kuito\.Splash/);
});

/** The Hermes package, already in place: these builds never download it. */
const hermes = async () => '/hermes';

function recorder() {
  const calls: { bin: string; args: readonly string[]; opts: RunOptions }[] = [];

  return {
    calls,
    async run(bin: string, args: readonly string[] = [], opts: RunOptions = {}) {
      calls.push({ bin, args, opts });

      return { stdout: '', stderr: '' };
    },
  };
}

test(
  'iOS builds the generated shell in the app’s .kuito/ios, never in the framework',
  { tags: ['macos'] },
  async () => {
    const project = projectIn(tempDir());
    const runner = recorder();
    const ios = join(project.cache, 'ios');
    // What an older CLI generated, which the project would still compile.
    const stale = join(ios, 'Generated/KuitoModules.swift');

    mkdirSync(dirname(stale), { recursive: true });
    writeFileSync(stale, 'enum KuitoModules {}');

    await buildIOS(runner, { project, device: null, modules: [haptics], hermes }).catch(() => {});

    assert.ok(!existsSync(stale), 'a generated file this build did not write is gone');

    assert.ok(existsSync(join(ios, 'project.json')));

    assert.equal(
      JSON.parse(readFileSync(join(ios, 'project.json'), 'utf8')).settings.base.KUITO_HERMES,
      '/hermes',
    );

    // A shell with no linked functions still has the table, empty.
    assert.match(
      readFileSync(join(ios, 'Generated/KuitoLink.swift'), 'utf8'),
      /enum KuitoLink \{[\s\S]*default: return nil/,
    );

    assert.ok(existsSync(join(ios, 'Resources')), 'the bundled JS directory exists');

    const xcodegen = runner.calls.find((call) => call.bin === 'xcodegen');

    assert.deepEqual(xcodegen?.args, ['generate', '--spec', 'project.json']);
    assert.equal(xcodegen?.opts.cwd, ios);
    assert.ok(!runner.calls.some((call) => call.bin === 'pod'), 'no CocoaPods');

    const xcodebuild = runner.calls.find((call) => call.bin === 'xcodebuild');

    assert.ok(xcodebuild?.args.includes(join(ios, 'KuitoIOS.xcodeproj')));
    assert.ok(xcodebuild?.args.includes(join(project.cache, 'build/ios')));
  },
);

const team = (app: AppConfig): AppConfig => ({ ...app, ios: { ...app.ios, teamId: 'A1B2C3D4E5' } });

const device = (id: string, emulator: boolean): Device => ({
  platform: 'ios',
  id,
  name: id,
  status: 'connected',
  active: true,
  label: id,
  detail: 'iOS 27.0',
  emulator,
});

const phone = device('PHONE', false);
const simulator = device('SIM', true);

/** The xcodebuild calls of a build that ran nothing, and how it failed. */
async function iosBuild(
  options: Partial<Parameters<typeof buildIOS>[1]> & { project: Project },
): Promise<{
  args: readonly string[];
  calls: (readonly string[])[];
  error: unknown;
  hermes: string[];
}> {
  const runner = recorder();
  const variants: string[] = [];
  const error = await buildIOS(runner, {
    device: null,
    modules: [],
    environment: {},
    hermes: async (profile) => {
      variants.push(profile);
      return '/hermes';
    },
    ...options,
  }).catch((thrown: unknown) => thrown);
  const calls = runner.calls.filter((call) => call.bin === 'xcodebuild').map((call) => call.args);

  return { args: calls[0] ?? [], calls, error, hermes: variants };
}

const option = (args: readonly string[], name: string) => args[args.indexOf(name) + 1];

test(
  'a release iOS build without a device archives and exports an .ipa for App Store Connect',
  { tags: ['macos'] },
  async () => {
    const project = projectIn(tempDir(), team(resolved));
    const store = await iosBuild({ project, profile: 'release' });
    const [archive = [], exported = []] = store.calls;
    const archivePath = join(project.cache, 'build/ios/KuitoIOS.xcarchive');

    assert.ok(archive.includes('archive'), 'archives');
    assert.equal(option(archive, '-configuration'), 'Release');
    assert.equal(option(archive, '-destination'), 'generic/platform=iOS');
    assert.equal(option(archive, '-archivePath'), archivePath);
    assert.ok(archive.includes('-allowProvisioningUpdates'), 'automatic signing may fetch');
    assert.ok(!archive.includes('CODE_SIGN_IDENTITY=-'), 'a store build runs no ad hoc signature');
    assert.deepEqual(store.hermes, ['release']);

    assert.ok(exported.includes('-exportArchive'), 'exports the archive');
    assert.equal(option(exported, '-archivePath'), archivePath);
    assert.equal(option(exported, '-exportPath'), join(project.cache, 'build/ios/export'));
    assert.ok(exported.includes('-allowProvisioningUpdates'));

    const options = readFileSync(option(exported, '-exportOptionsPlist') ?? '', 'utf8');

    assert.match(options, /<key>method<\/key>\s*<string>app-store-connect<\/string>/);
    assert.match(options, /<key>teamID<\/key>\s*<string>A1B2C3D4E5<\/string>/);
    assert.match(options, /<key>signingStyle<\/key>\s*<string>automatic<\/string>/);

    assert.match(
      options,
      /<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/,
      'the version and build number stay kuito.config.ts’s',
    );

    assert.match(String(store.error), /export\/KuitoIOS\.ipa/);
  },
);

test(
  'a release iOS build for a phone builds the app to install, signed with the app’s team',
  { tags: ['macos'] },
  async () => {
    const project = projectIn(tempDir(), team(resolved));
    const onPhone = await iosBuild({ project, profile: 'release', device: phone });

    assert.equal(onPhone.calls.length, 1, 'no archive');
    assert.equal(option(onPhone.args, '-configuration'), 'Release');
    assert.equal(option(onPhone.args, '-sdk'), 'iphoneos');
    assert.equal(option(onPhone.args, '-destination'), 'id=PHONE');
    assert.ok(onPhone.args.includes('build'));
    assert.ok(onPhone.args.includes('-allowProvisioningUpdates'), 'automatic signing may fetch');
    assert.ok(!onPhone.args.includes('CODE_SIGN_IDENTITY=-'), 'a phone runs no ad hoc signature');
    assert.match(String(onPhone.error), /Release-iphoneos\/KuitoIOS\.app/);
  },
);

test(
  'an App Store Connect API key in the environment signs the archive and its export',
  { tags: ['macos'] },
  async () => {
    const root = tempDir();
    const key = join(root, 'AuthKey_ABC123.p8');

    writeFileSync(key, 'not a real key');

    const project = projectIn(root, team(resolved));
    const environment = {
      KUITO_APP_STORE_CONNECT_KEY_PATH: key,
      KUITO_APP_STORE_CONNECT_KEY_ID: 'ABC123',
      KUITO_APP_STORE_CONNECT_ISSUER_ID: '00000000-0000-0000-0000-000000000000',
    };
    const store = await iosBuild({ project, profile: 'release', environment });

    assert.equal(store.calls.length, 2);

    for (const args of store.calls) {
      assert.equal(option(args, '-authenticationKeyPath'), key);
      assert.equal(option(args, '-authenticationKeyID'), 'ABC123');

      assert.equal(
        option(args, '-authenticationKeyIssuerID'),
        '00000000-0000-0000-0000-000000000000',
      );
    }

    // Relative to the app, as the keystore is, wherever xcodebuild runs.
    const relativeKey = await iosBuild({
      project,
      profile: 'release',
      environment: { ...environment, KUITO_APP_STORE_CONNECT_KEY_PATH: './AuthKey_ABC123.p8' },
    });

    assert.equal(relativeKey.calls.length, 2, String(relativeKey.error));

    for (const args of relativeKey.calls) assert.equal(option(args, '-authenticationKeyPath'), key);

    const partial = await iosBuild({
      project,
      profile: 'release',
      environment: { KUITO_APP_STORE_CONNECT_KEY_ID: 'ABC123' },
    });

    assert.match(String(partial.error), /KUITO_APP_STORE_CONNECT_KEY_PATH/);
    assert.match(String(partial.error), /KUITO_APP_STORE_CONNECT_ISSUER_ID/);
    assert.deepEqual(partial.calls, [], 'fails before xcodebuild');

    const missing = await iosBuild({
      project,
      profile: 'release',
      environment: { ...environment, KUITO_APP_STORE_CONNECT_KEY_PATH: join(root, 'gone.p8') },
    });

    assert.match(String(missing.error), /gone\.p8/);
    assert.deepEqual(missing.calls, []);
  },
);

test(
  'an iPhone build without a team fails before xcodebuild, naming the key',
  { tags: ['macos'] },
  async () => {
    const project = projectIn(tempDir());
    const build = await iosBuild({ project, profile: 'release' });

    assert.match(String(build.error), /ios\.teamId/);
    assert.match(String(build.error), /kuito\.config\.ts/);
    assert.deepEqual(build.args, []);
  },
);

test(
  'a simulator build stays ad hoc signed in either profile; the profile picks the configuration',
  { tags: ['macos'] },
  async () => {
    const project = projectIn(tempDir());
    const release = await iosBuild({ project, profile: 'release', device: simulator });

    assert.equal(option(release.args, '-configuration'), 'Release');
    assert.equal(option(release.args, '-sdk'), 'iphonesimulator');
    assert.equal(option(release.args, '-destination'), 'platform=iOS Simulator,id=SIM');
    assert.ok(release.args.includes('CODE_SIGN_IDENTITY=-'));
    assert.match(String(release.error), /Release-iphonesimulator\/KuitoIOS\.app/);

    // A device that does not say it is a phone is not built as one.
    const unmarked = await iosBuild({ project, device: { ...simulator, emulator: undefined } });

    assert.equal(option(unmarked.args, '-sdk'), 'iphonesimulator');

    const debug = await iosBuild({ project });

    assert.equal(option(debug.args, '-configuration'), 'Debug');
    assert.equal(option(debug.args, '-sdk'), 'iphonesimulator');
    assert.equal(option(debug.args, '-destination'), 'generic/platform=iOS Simulator');
    assert.deepEqual(debug.hermes, ['debug']);
    assert.match(String(debug.error), /Debug-iphonesimulator\/KuitoIOS\.app/);
  },
);

/** The Gradle call of an Android build that ran nothing, and how it failed. */
async function androidBuild(
  options: Partial<Parameters<typeof buildAndroid>[1]> & { project: Project },
) {
  const runner = recorder();
  const error = await buildAndroid(runner, { modules: [], environment: {}, ...options }).catch(
    (thrown: unknown) => thrown,
  );
  const gradle = runner.calls.find((call) => call.args.includes('--no-daemon'));

  return { args: gradle?.args ?? [], env: gradle?.opts.env ?? {}, error };
}

const PASSWORDS = {
  KUITO_ANDROID_KEYSTORE_PASSWORD: 'store secret',
  KUITO_ANDROID_KEY_PASSWORD: 'key secret',
};

/** A project whose config names an upload keystore that exists. */
function signedProject() {
  const root = tempDir();

  writeFileSync(join(root, 'upload.jks'), 'not a real keystore');

  return projectIn(root, {
    ...resolved,
    android: { ...resolved.android, signing: { keystore: './upload.jks', keyAlias: 'upload' } },
  });
}

test('a release Android build for a device assembles the release variant: R8, debug keystore', async () => {
  const release = await androidBuild({
    project: projectIn(tempDir()),
    profile: 'release',
    device: { ...phone, platform: 'android' },
  });

  assert.ok(release.args.includes(':app:assembleRelease'), 'assembleRelease');
  assert.ok(!release.args.some((arg) => arg.startsWith('-Pkuito.signing.')), 'no upload key');
  assert.match(String(release.error), /apk\/release\/app-release\.apk/);

  const gradleFile = readFileSync(join(ROOT, 'native/android/app/build.gradle.kts'), 'utf8');
  const buildTypes = gradleFile.slice(gradleFile.indexOf('release {'));

  assert.match(buildTypes, /isMinifyEnabled = true/);

  assert.match(
    buildTypes,
    /signingConfigs\.findByName\("upload"\) \?: signingConfigs\.getByName\("debug"\)/,
  );
});

test('R8 keeps the Java classes fbjni and Hermes reach from native code by name', () => {
  // A release build that drops them crashes at launch, in HybridData's class initializer.
  const rules = readFileSync(join(ROOT, 'native/android/app/proguard-rules.pro'), 'utf8');

  assert.match(rules, /^-keep class com\.facebook\.jni\.\*\* \{ \*; \}$/m);
  assert.match(rules, /^-keep class com\.facebook\.hermes\.\*\* \{ \*; \}$/m);
});

test('the Android shell generates BuildConfig, which modules read', () => {
  const gradle = readFileSync(join(ROOT, 'native/android/app/build.gradle.kts'), 'utf8');

  assert.match(gradle, /buildConfig = true/);

  assert.match(
    readFileSync(join(ROOT, 'native/modules/webview/android/KuitoWebViewModule.kt'), 'utf8'),
    /BuildConfig\.DEBUG/,
    'the WebView module, for one',
  );
});

test('a release Android build without a device bundles an .aab signed with the upload key', async () => {
  const project = signedProject();
  const store = await androidBuild({ project, profile: 'release', environment: PASSWORDS });

  assert.ok(store.args.includes(':app:bundleRelease'), 'bundleRelease');
  assert.ok(store.args.includes(`-Pkuito.signing.keystore=${join(project.root, 'upload.jks')}`));
  assert.ok(store.args.includes('-Pkuito.signing.keyAlias=upload'));

  assert.ok(
    !store.args.some((arg) => arg.includes('secret')),
    'passwords reach Gradle through its environment, never its command line',
  );

  assert.equal(store.env.KUITO_ANDROID_KEYSTORE_PASSWORD, 'store secret');
  assert.match(String(store.error), /bundle\/release\/app-release\.aab/);

  // Gradle reads the passwords from the environment the CLI checked.
  const gradleFile = readFileSync(join(ROOT, 'native/android/app/build.gradle.kts'), 'utf8');

  for (const name of [
    'kuito.signing.keystore',
    'kuito.signing.keyAlias',
    'KUITO_ANDROID_KEYSTORE_PASSWORD',
    'KUITO_ANDROID_KEY_PASSWORD',
  ])
    assert.ok(gradleFile.includes(`"${name}"`), name);
});

test('the environment names the upload key in CI, over the config', async () => {
  const project = signedProject();
  const ci = join(project.root, 'ci.jks');

  writeFileSync(ci, 'not a real keystore');

  const store = await androidBuild({
    project,
    profile: 'release',
    environment: { ...PASSWORDS, KUITO_ANDROID_KEYSTORE: ci, KUITO_ANDROID_KEY_ALIAS: 'ci' },
  });

  assert.ok(store.args.includes(`-Pkuito.signing.keystore=${ci}`));
  assert.ok(store.args.includes('-Pkuito.signing.keyAlias=ci'));
});

test('a store build without its upload key or passwords fails before Gradle, naming what to set', async () => {
  const unsigned = await androidBuild({ project: projectIn(tempDir()), profile: 'release' });

  assert.match(String(unsigned.error), /android\.signing\.keystore/);
  assert.match(String(unsigned.error), /KUITO_ANDROID_KEYSTORE\b/);
  assert.deepEqual(unsigned.args, []);

  const project = signedProject();
  const noPasswords = await androidBuild({ project, profile: 'release' });

  assert.match(String(noPasswords.error), /KUITO_ANDROID_KEYSTORE_PASSWORD/);
  assert.match(String(noPasswords.error), /KUITO_ANDROID_KEY_PASSWORD/);
  assert.deepEqual(noPasswords.args, []);

  const gone = await androidBuild({
    project: projectIn(project.root, {
      ...resolved,
      android: { ...resolved.android, signing: { keystore: './gone.jks', keyAlias: 'upload' } },
    }),
    profile: 'release',
    environment: PASSWORDS,
  });

  assert.match(String(gone.error), /gone\.jks/);
  assert.deepEqual(gone.args, []);
});

test('a configured upload key signs a release build for a device too', async () => {
  const release = await androidBuild({
    project: signedProject(),
    profile: 'release',
    device: { ...phone, platform: 'android' },
    environment: PASSWORDS,
  });

  assert.ok(release.args.includes(':app:assembleRelease'));
  assert.ok(release.args.includes('-Pkuito.signing.keyAlias=upload'));
});

test('Android builds the framework project with the app’s properties into .kuito/android', async () => {
  const project = projectIn(tempDir());
  const runner = recorder();
  const android = join(project.cache, 'android');
  const stale = join(android, 'generated/dev/kuito/runtime/modules/KuitoModules.kt');

  mkdirSync(dirname(stale), { recursive: true });
  writeFileSync(stale, 'object KuitoModules');

  await buildAndroid(runner, { project, modules: [haptics] }).catch(() => {});

  assert.ok(!existsSync(stale), 'a generated source this build did not write is gone');

  assert.ok(existsSync(join(android, 'AndroidManifest.xml')));

  assert.match(
    readFileSync(join(android, 'generated/dev/kuito/link/KuitoLink.kt'), 'utf8'),
    /object KuitoLink \{[\s\S]*else -> null/,
  );

  const gradle = runner.calls.find((call) => call.args.includes(':app:assembleDebug'));

  assert.ok(gradle);
  assert.ok(gradle.args.includes(join(ROOT, 'native/android')), 'the framework project');
  assert.ok(gradle.args.includes('-Pkuito.applicationId=com.example.hello'));

  assert.equal(
    readFileSync(join(project.cache, 'android/AndroidManifest.xml'), 'utf8'),
    androidManifest(resolved, []),
    'the app’s permissions, written where kuito.manifest points',
  );

  const cache = gradle.args.indexOf('--project-cache-dir');

  assert.equal(gradle.args[cache + 1], join(project.cache, 'android/.gradle'));
});

test('the framework’s Android project reads every shell property it is given', () => {
  const app = readFileSync(join(ROOT, 'native/android/app/build.gradle.kts'), 'utf8');
  const root = readFileSync(join(ROOT, 'native/android/build.gradle.kts'), 'utf8');
  const manifest = readFileSync(
    join(ROOT, 'native/android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );

  for (const property of [
    'kuito.applicationId',
    'kuito.appName',
    'kuito.assets',
    'kuito.sources',
    'kuito.dependencies',
    'kuito.manifest',
    'kuito.res',
    'kuito.splashRes',
    'kuito.versionName',
    'kuito.versionCode',
    'kuito.settingsRes',
    'kuito.minSdk',
  ])
    assert.ok(app.includes(`"${property}"`), property);

  assert.ok(root.includes('"kuito.buildDir"'));
  assert.match(manifest, /android:label="\$\{appName\}"/);
  assert.match(manifest, /android:icon="\$\{appIcon\}"/);
  assert.match(manifest, /android:roundIcon="\$\{appIcon\}"/);
});

const camera = 'Scan tickets at the door.';
const permissions = { camera, location: 'Find shows near you.', notifications: true as const };
const withPermissions: AppConfig = { ...resolved, permissions };
const resolvePermissions = (value: unknown) =>
  resolveConfig({ ...config, permissions: value }, FILE, 'production');

test('a config declares the permissions the app uses, each with its reason', () => {
  assert.deepEqual(resolvePermissions(permissions), withPermissions);

  const { permissions: _, ...withoutKey } = config;

  assert.deepEqual(
    resolveConfig(withoutKey, FILE, 'production').permissions,
    {},
    'no key: no permissions',
  );

  const invalid: [unknown, RegExp][] = [
    [[], /permissions must be an object/],
    [{ cameras: camera }, /permissions\.cameras is not a permission; use camera, microphone/],
    [{ camera: '' }, /permissions\.camera must be a non-empty string: the reason iOS shows/],
    [{ microphone: true }, /permissions\.microphone must be a non-empty string/],
    [{ notifications: 'Alerts' }, /permissions\.notifications must be true/],
  ];

  for (const [value, message] of invalid)
    assert.throws(() => resolvePermissions(value), {
      message: new RegExp('kuito\\.config\\.ts: ' + message.source),
    });
});

test('an environment adds or rewords permissions one by one', () => {
  const app = {
    ...config,
    permissions: { camera },
    environments: { staging: { permissions: { microphone: 'Record test calls.' } } },
  };

  assert.deepEqual(resolveConfig(app, FILE, 'staging').permissions, {
    camera,
    microphone: 'Record test calls.',
  });

  assert.deepEqual(resolveConfig(app, FILE, 'production').permissions, { camera });

  assert.throws(
    () =>
      resolveConfig(
        { ...config, environments: { staging: { permissions: { camera: '' } } } },
        FILE,
        'production',
      ),
    /kuito\.config\.ts: environments\.staging\.permissions\.camera must be a non-empty string/,
  );
});

test('the iOS shell carries a usage string for each declared permission, and no others', () => {
  const spec = JSON.parse(iosProjectSpec(withPermissions, '/fw', [], '/hermes')) as {
    targets: { KuitoIOS: { info: { properties: Record<string, unknown> } } };
  };

  assert.deepEqual(spec.targets.KuitoIOS.info.properties, {
    CFBundleDisplayName: 'Hello Kuito',
    CFBundleShortVersionString: '1.0.0',
    CFBundleVersion: '1',
    UILaunchScreen: {},
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
    NSCameraUsageDescription: camera,
    NSLocationWhenInUseUsageDescription: 'Find shows near you.',
  });
});

test('the Android shell declares the runtime permissions of each declared permission, and no others', () => {
  const declared = (manifest: string) =>
    [...manifest.matchAll(/<uses-permission android:name="android\.permission\.(\w+)"/g)].map(
      (match) => match[1],
    );

  assert.deepEqual(declared(androidManifest(withPermissions, [])), [
    'CAMERA',
    'ACCESS_FINE_LOCATION',
    'ACCESS_COARSE_LOCATION',
    'POST_NOTIFICATIONS',
  ]);

  assert.deepEqual(declared(androidManifest(resolved, [])), []);

  assert.match(
    androidManifest({ ...resolved, permissions: { photos: 'Pick a poster.' } }, []),
    /android:name="android\.permission\.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"/,
  );
});

test('locationAlways carries the Always reason on iOS and background access on Android', () => {
  const always = 'Track your runs with the screen off.';
  const location = 'Find shows near you.';
  const withAlways: AppConfig = { ...resolved, permissions: { location, locationAlways: always } };
  const properties = (
    JSON.parse(iosProjectSpec(withAlways, '/fw', [], '/hermes')) as {
      targets: { KuitoIOS: { info: { properties: Record<string, unknown> } } };
    }
  ).targets.KuitoIOS.info.properties;

  assert.deepEqual(resolvePermissions({ location, locationAlways: always }), withAlways);
  assert.equal(properties.NSLocationAlwaysAndWhenInUseUsageDescription, always);
  assert.equal(properties.NSLocationWhenInUseUsageDescription, location);

  assert.match(
    androidManifest(withAlways, []),
    /<uses-permission android:name="android\.permission\.ACCESS_BACKGROUND_LOCATION" \/>/,
  );

  // iOS asks for "when in use" before it offers "always".
  assert.throws(() => resolvePermissions({ locationAlways: always }), {
    message: /permissions\.locationAlways needs permissions\.location too/,
  });
});

test('biometrics carries the Face ID reason on iOS and USE_BIOMETRIC on Android', () => {
  const unlock = 'Unlock your saved login.';
  const withBiometrics: AppConfig = { ...resolved, permissions: { biometrics: unlock } };
  const spec = JSON.parse(iosProjectSpec(withBiometrics, '/fw', [], '/hermes')) as {
    targets: { KuitoIOS: { info: { properties: Record<string, string> } } };
  };

  assert.deepEqual(resolvePermissions({ biometrics: unlock }), withBiometrics);
  assert.equal(spec.targets.KuitoIOS.info.properties.NSFaceIDUsageDescription, unlock);

  assert.match(
    androidManifest(withBiometrics, []),
    /<uses-permission android:name="android\.permission\.USE_BIOMETRIC" \/>/,
  );

  assert.throws(() => resolvePermissions({ biometrics: true }), {
    message: /permissions\.biometrics must be a non-empty string/,
  });
});

test('the Android activity keeps its runtime through rotation, resizing and font scale', () => {
  const manifest = readFileSync(
    join(ROOT, 'native/android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  const handled = manifest.match(/android:configChanges="([^"]*)"/)?.[1].split('|') ?? [];

  for (const change of [
    'uiMode',
    'locale',
    'layoutDirection',
    'orientation',
    'screenSize',
    'smallestScreenSize',
    'screenLayout',
    'fontScale',
  ])
    assert.ok(handled.includes(change), `${change} would recreate the activity and restart Hermes`);
});

test('demo/ is Reel, an app configured like any other, with every permission its demos ask for', async () => {
  const production = await loadProject(join(ROOT, 'demo'), 'production');
  const staging = await loadProject(join(ROOT, 'demo'), 'staging');

  assert.equal(production.config.name, 'Reel');
  assert.equal(production.config.ios.bundleIdentifier, 'dev.kuito.shell');
  assert.deepEqual(production.config.urlSchemes, ['kuito'], 'the scheme docs/linking.md opens');

  assert.deepEqual(
    Object.keys(production.config.permissions).sort(),
    ['biometrics', 'camera', 'location', 'locationAlways', 'microphone', 'notifications', 'photos'],
    'the demos run in this shell through --entry',
  );

  assert.equal(staging.config.name, 'Reel Staging');
  assert.equal(staging.config.android.applicationId, 'dev.kuito.shell.staging');

  for (const { config } of [production, staging]) {
    const icons = [iosAppIcon, androidAppIcon].map((generate) =>
      generate(config, (source) => readFileSync(source.path)),
    );

    assert.ok(
      icons.every((output) => output && output.warnings.length === 0),
      `${config.name}: a valid, opaque icon`,
    );
  }
});

test('the framework’s native projects declare no permission; apps do', () => {
  const spec = readFileSync(join(ROOT, 'native/ios/project.yml'), 'utf8');
  const manifest = readFileSync(
    join(ROOT, 'native/android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );

  assert.doesNotMatch(spec, /UsageDescription/, 'usage strings come from kuito.config.ts');

  assert.doesNotMatch(
    manifest,
    /CAMERA|RECORD_AUDIO|LOCATION|READ_MEDIA|POST_NOTIFICATIONS|USE_BIOMETRIC/,
  );
});

const resolveTasks = (value: unknown) =>
  resolveConfig({ ...config, backgroundTasks: value }, FILE, 'production');

test('a config declares the background tasks the OS may launch, by name', () => {
  assert.deepEqual(resolveTasks(['sync', 'feed.refresh']), {
    ...resolved,
    backgroundTasks: ['sync', 'feed.refresh'],
  });

  const invalid: [unknown, RegExp][] = [
    ['sync', /backgroundTasks must be an array of task names/],
    [[42], /backgroundTasks must be an array of task names/],
    [
      ['has space'],
      /backgroundTasks: 'has space' is not a task name; use letters, digits, \., _ and -/,
    ],
    [['a,b'], /backgroundTasks: 'a,b' is not a task name/],
    [['sync', 'sync'], /backgroundTasks names 'sync' twice/],
  ];

  for (const [value, message] of invalid)
    assert.throws(() => resolveTasks(value), {
      message: new RegExp('kuito\\.config\\.ts: ' + message.source),
    });
});

test('an environment replaces the list of background tasks', () => {
  const app = {
    ...config,
    backgroundTasks: ['sync'],
    environments: { staging: { backgroundTasks: ['sync', 'debug-dump'] } },
  };

  assert.deepEqual(resolveConfig(app, FILE, 'production').backgroundTasks, ['sync']);
  assert.deepEqual(resolveConfig(app, FILE, 'staging').backgroundTasks, ['sync', 'debug-dump']);

  assert.throws(
    () =>
      resolveConfig(
        { ...config, environments: { staging: { backgroundTasks: [''] } } },
        FILE,
        'production',
      ),
    /environments\.staging\.backgroundTasks: '' is not a task name/,
  );
});

test('the iOS shell permits each background task and the modes BGTaskScheduler needs', () => {
  const properties = (app: AppConfig) =>
    (
      JSON.parse(iosProjectSpec(app, '/fw', [], '/hermes')) as {
        targets: { KuitoIOS: { info: { properties: Record<string, unknown> } } };
      }
    ).targets.KuitoIOS.info.properties;

  const declared = properties({ ...resolved, backgroundTasks: ['sync', 'cleanup'] });

  assert.deepEqual(declared.BGTaskSchedulerPermittedIdentifiers, ['sync', 'cleanup']);
  assert.deepEqual(declared.UIBackgroundModes, ['fetch', 'processing']);

  assert.equal(properties(resolved).BGTaskSchedulerPermittedIdentifiers, undefined);
  assert.equal(properties(resolved).UIBackgroundModes, undefined);
});

test('the Android shell declares the job service, the task names and boot persistence', () => {
  const manifest = androidManifest({ ...resolved, backgroundTasks: ['sync', 'cleanup'] }, []);

  assert.match(
    manifest,
    /<service android:name="dev\.kuito\.runtime\.modules\.backgroundtasks\.KuitoBackgroundTaskService"\s+android:permission="android\.permission\.BIND_JOB_SERVICE" android:exported="false" \/>/,
  );

  assert.match(
    manifest,
    /<meta-data android:name="dev\.kuito\.backgroundTasks" android:value="sync,cleanup" \/>/,
  );

  assert.match(manifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/);
  assert.doesNotMatch(androidManifest(resolved, []), /service|meta-data|RECEIVE_BOOT_COMPLETED/);
});

test('locationAlways turns on background updates: iOS’s location mode, Android’s foreground service', () => {
  const always: AppConfig = {
    ...resolved,
    permissions: { location: 'Find shows near you.', locationAlways: 'Track your runs.' },
  };
  const modes = (app: AppConfig) =>
    (
      JSON.parse(iosProjectSpec(app, '/fw', [], '/hermes')) as {
        targets: { KuitoIOS: { info: { properties: Record<string, unknown> } } };
      }
    ).targets.KuitoIOS.info.properties.UIBackgroundModes;
  const manifest = androidManifest(always, []);

  assert.deepEqual(modes(always), ['location']);

  assert.deepEqual(modes({ ...always, backgroundTasks: ['sync'] }), [
    'fetch',
    'processing',
    'location',
  ]);

  assert.match(
    manifest,
    /<service android:name="dev\.kuito\.runtime\.modules\.location\.KuitoLocationService"\s+android:foregroundServiceType="location" android:exported="false" \/>/,
  );

  for (const permission of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION'])
    assert.match(manifest, new RegExp(`android\\.permission\\.${permission}"`));

  const foreground: AppConfig = { ...resolved, permissions: { location: 'Find shows near you.' } };

  assert.equal(modes(foreground), undefined);
  assert.doesNotMatch(androidManifest(foreground, []), /service|FOREGROUND_SERVICE/);
});

/** An app whose config names a 1024×1024 icon with a transparent corner. */
function appWithIcon() {
  const root = tempDir();
  const pixels = new Uint8Array(1024 * 1024 * 4).fill(255);

  pixels[3] = 0;
  mkdirSync(join(root, 'assets'));

  writeFileSync(
    join(root, 'assets/icon.png'),
    encodePng({ width: 1024, height: 1024, data: pixels }),
  );

  const app = resolveConfig(
    { ...config, icon: './assets/icon.png' },
    join(root, 'kuito.config.ts'),
    'production',
  );

  return projectIn(root, app);
}

test(
  'a build generates the app icon into its shell and reports what it had to fix',
  { tags: ['macos'] },
  async () => {
    const project = appWithIcon();
    const warnings: string[] = [];
    const onWarning = (message: string) => warnings.push(message);

    await buildIOS(recorder(), { project, modules: [], device: null, onWarning, hermes }).catch(
      () => {},
    );

    await buildAndroid(recorder(), { project, modules: [], onWarning }).catch(() => {});

    assert.ok(existsSync(join(project.cache, 'ios/AppIcon.xcassets/AppIcon.appiconset/icon.png')));
    assert.ok(existsSync(join(project.cache, 'android/res/mipmap-anydpi-v26/ic_launcher.xml')));
    assert.equal(warnings.length, 1, 'only iOS needs an opaque icon');
    assert.match(warnings[0], /icon \('\.\/assets\/icon\.png'\) has transparency/);
  },
);

const withFonts: AppConfig = {
  ...resolved,
  fonts: [
    {
      path: '/app/assets/fonts/Pacifico.ttf',
      origin: `${FILE}: fonts[0] ('./assets/fonts/Pacifico.ttf')`,
      family: null,
      weight: null,
      style: null,
    },
    {
      path: '/app/assets/fonts/Lato-Bold.otf',
      origin: `${FILE}: fonts[1] ('./assets/fonts/Lato-Bold.otf')`,
      family: 'Lato',
      weight: 700,
      style: null,
    },
  ],
};

test('an app with fonts adds them to the iOS shell as a folder and lists each in UIAppFonts', () => {
  const target = (
    JSON.parse(iosProjectSpec(withFonts, '/fw', [], '/hermes')) as {
      targets: { KuitoIOS: { sources: unknown[]; info: { properties: Record<string, unknown> } } };
    }
  ).targets.KuitoIOS;

  assert.deepEqual(target.sources, [
    { path: 'Resources', buildPhase: 'resources' },
    { path: 'Modules', type: 'folder', buildPhase: 'resources' },
    { path: 'Generated' },
    { path: 'fonts', type: 'folder', buildPhase: 'resources' },
  ]);

  assert.deepEqual(target.info.properties.UIAppFonts, [
    'fonts/Pacifico.ttf',
    'fonts/Lato-Bold.otf',
  ]);

  const plain = JSON.parse(iosProjectSpec(resolved, '/fw', [], '/hermes')) as typeof target & {
    targets: { KuitoIOS: { info: { properties: Record<string, unknown> } } };
  };

  assert.equal('UIAppFonts' in plain.targets.KuitoIOS.info.properties, false);
});

test(
  'a build writes the bundled fonts into the iOS bundle and Android’s assets',
  { tags: ['macos'] },
  async () => {
    const root = tempDir();

    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets/Pacifico.ttf'), font({ family: 'Pacifico' }));

    const project = projectIn(
      root,
      resolveConfig(
        { ...config, fonts: ['./assets/Pacifico.ttf'] },
        join(root, 'kuito.config.ts'),
        'production',
      ),
    );

    await buildIOS(recorder(), { project, modules: [], device: null, hermes }).catch(() => {});
    await buildAndroid(recorder(), { project, modules: [] }).catch(() => {});

    for (const dir of ['ios/fonts', 'android/assets/fonts']) {
      assert.ok(existsSync(join(project.cache, dir, 'Pacifico.ttf')), dir);

      assert.deepEqual(JSON.parse(readFileSync(join(project.cache, dir, 'fonts.json'), 'utf8')), [
        { family: 'Pacifico', weight: 400, style: 'normal', file: 'Pacifico.ttf' },
      ]);
    }
  },
);

test('a config declares the database migrations, each a statement or a list of them', () => {
  const migrate = (migrations: unknown) =>
    resolveConfig({ ...config, migrations }, FILE, 'production').migrations;

  assert.deepEqual(
    migrate([
      'CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT NOT NULL)',
      ['ALTER TABLE tracks ADD COLUMN plays INTEGER', 'CREATE INDEX plays ON tracks (plays)'],
    ]),
    [
      ['CREATE TABLE tracks (id INTEGER PRIMARY KEY, title TEXT NOT NULL)'],
      ['ALTER TABLE tracks ADD COLUMN plays INTEGER', 'CREATE INDEX plays ON tracks (plays)'],
    ],
  );

  const invalid: [unknown, RegExp][] = [
    ['CREATE TABLE t (a)', /migrations must be an array/],
    [[42], /migrations\[0\] must be an SQL statement or a list of them/],
    [[['']], /migrations\[0\] must be an SQL statement or a list of them/],
    [[[]], /migrations\[0\] must be an SQL statement or a list of them/],
  ];

  for (const [value, message] of invalid)
    assert.throws(() => migrate(value), {
      message: new RegExp('kuito\\.config\\.ts: ' + message.source),
    });
});

test('an environment cannot change the migrations: every build shares one database', () => {
  assert.throws(
    () =>
      resolveConfig(
        { ...config, environments: { staging: { migrations: [] } } },
        FILE,
        'production',
      ),
    /environments\.staging\.migrations is not a config key/,
  );
});

test(
  'a build writes the migrations into the iOS bundle and Android’s assets',
  { tags: ['macos'] },
  async () => {
    const project = projectIn(tempDir(), {
      ...resolved,
      migrations: [['CREATE TABLE tracks (id INTEGER PRIMARY KEY)']],
    });

    await buildIOS(recorder(), { project, modules: [], device: null, hermes }).catch(() => {});
    await buildAndroid(recorder(), { project, modules: [] }).catch(() => {});

    for (const file of ['ios/Resources', 'android/assets'])
      assert.deepEqual(
        JSON.parse(readFileSync(join(project.cache, file, 'kuito-migrations.json'), 'utf8')),
        [['CREATE TABLE tracks (id INTEGER PRIMARY KEY)']],
        file,
      );
  },
);

test('a build generates the splash screen into each shell', { tags: ['macos'] }, async () => {
  const project = appWithIcon();
  const logo = new Uint8Array(480 * 240 * 4).fill(255);

  writeFileSync(
    join(project.root, 'assets/logo.png'),
    encodePng({ width: 480, height: 240, data: logo }),
  );

  const app = resolveConfig(
    { ...config, splash: { logo: './assets/logo.png', logoWidth: 120 } },
    join(project.root, 'kuito.config.ts'),
    'production',
  );
  const splashing = { ...project, config: app };

  await buildIOS(recorder(), { project: splashing, modules: [], device: null, hermes }).catch(
    () => {},
  );

  await buildAndroid(recorder(), { project: splashing, modules: [] }).catch(() => {});

  assert.ok(existsSync(join(project.cache, 'ios/Splash/Splash.storyboard')));
  assert.ok(existsSync(join(project.cache, 'android/splash/drawable/kuito_splash.xml')));
});
