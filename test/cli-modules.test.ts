import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs, ROOT } from '../src/cli/config.ts';
import { createModule, validateModuleName } from '../src/cli/create-module.ts';
import { main } from '../src/cli/index.ts';
import { APP_CONFIG } from './support/app-config.ts';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { catalogOf, specFile } from '../src/dev/modules/catalog.ts';
import {
  configuredModules,
  includeModules,
  loadModules,
  shellModules,
  validateManifest,
  type NativeModuleSource,
} from '../src/cli/modules.ts';
import { androidManifest, iosProjectSpec } from '../src/cli/shells.ts';

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'kuito-modules-'));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

function write(file: string, contents: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

/** An app module described by its spec, with one source file per platform it declares. */
function specIn(parent: string, directory: string, source: string, platforms = ['ios', 'android']) {
  write(join(parent, directory, `${directory}.ts`), source);
  if (platforms.includes('ios')) write(join(parent, directory, 'ios', 'Module.swift'), '');
  if (platforms.includes('android')) write(join(parent, directory, 'android', 'Module.kt'), '');
}

const CHARGER = `import { defineModule, fn } from 'kuito';
import '../battery/battery';
export default defineModule('Charger', {
  rate: fn.sync<() => number>(),
  ios: { class: 'ChargerModule', frameworks: ['CoreHaptics'], infoPlist: { UIRequiresFullScreen: true } },
  android: { class: 'com.example.ChargerModule', permissions: ['android.permission.BATTERY_STATS'] },
});
`;

const BATTERY = `import { defineModule, fn } from 'kuito';
export default defineModule('Battery', {
  level: fn.sync<() => number>(),
  monitor: fn.main<(on: boolean) => Promise<void>>(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.BatteryModule' },
});
`;

const TORCH = `import { defineModule, fn } from 'kuito';
export default defineModule('Torch', {
  toggle: fn.main<(on: boolean) => Promise<void>>(),
  ios: { class: 'TorchModule' },
});
`;

const HAPTICS = `import { defineModule, fn } from 'kuito';
export default defineModule('Haptics', {
  tap: fn.sync<() => void>(),
  ios: { class: 'MyHaptics' },
});
`;

const battery = {
  name: 'Battery',
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.hello.modules.battery.BatteryModule' },
};

test('a spec’s native needs name the module, its classes and its dependencies', () => {
  const file = 'modules/camera/camera.ts';
  const manifest = validateManifest(
    {
      name: 'Camera',
      requires: ['Linking'],
      ios: {
        class: 'CameraModule',
        swiftPackages: [
          { url: 'https://github.com/example/Lens.git', from: '2.1.0', products: ['Lens'] },
        ],
        infoPlist: { NSCameraUsageDescription: 'Scan codes' },
      },
      android: {
        class: 'com.example.camera.CameraModule',
        dependencies: ['androidx.camera:camera-camera2:1.4.1'],
        permissions: ['android.permission.CAMERA'],
        features: [{ name: 'android.hardware.camera.any', required: false }],
        providers: [
          {
            name: 'com.example.camera.CaptureProvider',
            authorities: '${applicationId}.camera',
            exported: 'false',
            grantUriPermissions: 'true',
            resources: { 'android.support.FILE_PROVIDER_PATHS': '@xml/camera_paths' },
          },
        ],
        services: [
          {
            name: 'com.example.camera.UploadService',
            exported: 'false',
            foregroundServiceType: 'dataSync',
          },
        ],
      },
    },
    file,
  );

  assert.deepEqual(manifest, {
    name: 'Camera',
    requires: ['Linking'],
    ios: {
      class: 'CameraModule',
      launch: false,
      swiftPackages: [
        { url: 'https://github.com/example/Lens.git', from: '2.1.0', products: ['Lens'] },
      ],
      infoPlist: { NSCameraUsageDescription: 'Scan codes' },
      frameworks: [],
    },
    android: {
      class: 'com.example.camera.CameraModule',
      launch: false,
      dependencies: ['androidx.camera:camera-camera2:1.4.1'],
      permissions: ['android.permission.CAMERA'],
      features: [{ name: 'android.hardware.camera.any', required: false }],
      providers: [
        {
          attributes: {
            name: 'com.example.camera.CaptureProvider',
            authorities: '${applicationId}.camera',
            exported: 'false',
            grantUriPermissions: 'true',
          },
          resources: { 'android.support.FILE_PROVIDER_PATHS': '@xml/camera_paths' },
        },
      ],
      services: [
        {
          name: 'com.example.camera.UploadService',
          exported: 'false',
          foregroundServiceType: 'dataSync',
        },
      ],
      receivers: [],
    },
  });

  assert.deepEqual(validateManifest({ name: 'Haptics', ios: { class: 'H' } }, file), {
    name: 'Haptics',
    requires: [],
    ios: { class: 'H', launch: false, swiftPackages: [], infoPlist: {}, frameworks: [] },
    android: null,
  });
});

test('invalid native needs are an error naming the spec and the key', () => {
  const file = 'modules/battery/battery.ts';
  const invalid: [unknown, RegExp][] = [
    [[], /battery\.ts: must be an object/],
    [{ ...battery, name: 'battery' }, /battery\.ts: name must be PascalCase/],
    [{ ...battery, ios: { class: 'Battery Module' } }, /battery\.ts: ios\.class/],
    [
      { ...battery, android: { class: 'BatteryModule' } },
      /battery\.ts: android\.class must be a fully qualified Kotlin class/,
    ],
    [
      { ...battery, ios: { ...battery.ios, pods: { GoogleMLKit: '~> 7.0' } } },
      /ios\.pods is not a manifest key \(class, launch, swiftPackages, infoPlist, frameworks\)/,
    ],
    // A module is in a shell only when its bundle calls it, or a module it calls requires it.
    [{ ...battery, always: true }, /battery\.ts: always is not a manifest key/],
    [{ ...battery, ios: { ...battery.ios, launch: 'yes' } }, /ios\.launch must be true or false/],
    [
      { ...battery, android: { ...battery.android, dependencies: ['camera'] } },
      /android\.dependencies\[0\] must be a Gradle coordinate like group:artifact:version/,
    ],
    [
      { ...battery, android: { ...battery.android, features: ['android.hardware.camera'] } },
      /android\.features\[0\] must be an object/,
    ],
    [
      {
        ...battery,
        android: { ...battery.android, features: [{ name: 'camera', required: 'no' }] },
      },
      /android\.features\[0\]\.required must be true or false/,
    ],
    [{ ...battery, requires: 'Linking' }, /requires must be an array/],
    [{ ...battery, ios: { ...battery.ios, plist: {} } }, /ios\.plist is not a manifest key/],
    [{ ...battery, version: 2 }, /version is not a manifest key/],
    [{ name: 'Battery' }, /declares neither ios nor android/],
    [
      { ...battery, android: { ...battery.android, providers: [{ name: 'Provider' }] } },
      /android\.providers\[0\]\.name must be a fully qualified class/,
    ],
    [
      {
        ...battery,
        android: { ...battery.android, providers: [{ name: 'a.b.Provider' }] },
      },
      /android\.providers\[0\]\.authorities must be a non-empty string/,
    ],
    [
      {
        ...battery,
        android: {
          ...battery.android,
          providers: [{ name: 'a.b.P', authorities: 'a.b', 'android:exported': 'false' }],
        },
      },
      /android\.providers\[0\]\.android:exported must be an attribute name without android:/,
    ],
    [
      {
        ...battery,
        android: {
          ...battery.android,
          providers: [{ name: 'a.b.P', authorities: 'a.b', resources: { paths: 'xml/paths' } }],
        },
      },
      /android\.providers\[0\]\.resources\.paths must be a resource reference like @xml\/paths/,
    ],
    [
      { ...battery, android: { ...battery.android, services: [{ exported: 'false' }] } },
      /android\.services\[0\]\.name must be a non-empty string/,
    ],
    [
      {
        ...battery,
        android: { ...battery.android, services: [{ name: 'a.b.S', 'android:exported': 'false' }] },
      },
      /android\.services\[0\]\.android:exported must be an attribute name without android:/,
    ],
  ];

  for (const [value, message] of invalid)
    assert.throws(() => validateManifest(value, file), message, JSON.stringify(value));
});

test('every module directory under modules/ is read from its spec', async () => {
  const app = tempDir();

  specIn(join(app, 'modules'), 'battery', BATTERY);
  mkdirSync(join(app, 'modules/battery/android/res/xml'), { recursive: true });
  specIn(join(app, 'modules'), 'torch', TORCH, ['ios']);

  const own = (await loadModules(app)).filter(({ file }) => file.startsWith(app));

  assert.deepEqual(
    own.map(({ manifest, directory, file }) => [manifest.name, directory, file]),
    [
      ['Battery', join(app, 'modules/battery'), join(app, 'modules/battery/battery.ts')],
      ['Torch', join(app, 'modules/torch'), join(app, 'modules/torch/torch.ts')],
    ],
  );

  assert.deepEqual(
    own.map(({ androidResources }) => androidResources),
    [join(app, 'modules/battery/android/res'), undefined],
    'an android/res directory holds resources the spec’s needs may name',
  );
});

/** An installed package `name`, its package.json `fields`, in `app`'s node_modules. */
function installed(app: string, name: string, fields: Record<string, unknown>) {
  const directory = join(app, 'node_modules', name);

  write(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...fields }));

  return directory;
}

const dependsOn = (app: string, dependencies: Record<string, string>) =>
  write(join(app, 'package.json'), JSON.stringify({ name: 'app', dependencies }));

test('a package the app depends on ships its modules from the directory its kuito.modules names', async () => {
  const app = tempDir();
  const battery = installed(app, 'kuito-battery', { kuito: { modules: 'modules' } });

  specIn(join(battery, 'modules'), 'battery', BATTERY);

  // Not a dependency of the app: never read, whatever it declares.
  specIn(
    join(installed(app, 'kuito-torch', { kuito: { modules: 'modules' } }), 'modules'),
    'torch',
    TORCH,
  );

  // A dependency without the key ships no modules.
  installed(app, 'left-pad', {});
  dependsOn(app, { 'kuito-battery': '^1.0.0', 'left-pad': '^1.0.0' });

  const names = (await loadModules(app)).map(({ manifest }) => manifest.name);
  const packaged = (await loadModules(app)).find(({ manifest }) => manifest.name === 'Battery');

  assert.ok(names.includes('Battery'));
  assert.ok(!names.includes('Torch'));
  assert.equal(packaged?.directory, join(realpathSync(battery), 'modules/battery'));
});

test('a package a workspace hoists above the app is found where Node finds it', async () => {
  const workspace = tempDir();
  const app = join(workspace, 'apps/reel');
  const battery = installed(workspace, 'kuito-battery', { kuito: { modules: 'modules' } });

  specIn(join(battery, 'modules'), 'battery', BATTERY);
  dependsOn(app, { 'kuito-battery': '^1.0.0' });

  assert.ok((await loadModules(app)).some(({ manifest }) => manifest.name === 'Battery'));
});

test('a package’s kuito.modules that names no directory is an error naming its package.json', async () => {
  const app = tempDir();
  const battery = installed(app, 'kuito-battery', { kuito: { modules: 'native' } });

  dependsOn(app, { 'kuito-battery': '^1.0.0' });

  await assert.rejects(
    loadModules(app),
    new RegExp(
      `${join(realpathSync(battery), 'package.json').replaceAll('/', '\\/')}: kuito\\.modules names native, which is not a directory`,
    ),
  );

  installed(app, 'kuito-battery', { kuito: { modules: 3 } });

  await assert.rejects(loadModules(app), /kuito\.modules must name a directory of modules/);
});

test('a packaged spec requires another package’s by the package’s name', async () => {
  const app = tempDir();

  specIn(
    join(installed(app, 'kuito-battery', { kuito: { modules: 'modules' } }), 'modules'),
    'battery',
    BATTERY,
  );

  specIn(
    join(installed(app, 'kuito-charger', { kuito: { modules: 'modules' } }), 'modules'),
    'charger',
    CHARGER.replace(
      "import '../battery/battery';",
      "import 'kuito-battery/modules/battery/battery';",
    ),
  );

  dependsOn(app, { 'kuito-battery': '^1.0.0', 'kuito-charger': '^1.0.0' });

  const charger = (await loadModules(app)).find(({ manifest }) => manifest.name === 'Charger');

  assert.deepEqual(charger?.manifest.requires, ['Battery']);
});

test('a dependency’s broken package.json is its own business, and kuito.modules stays inside its package', async () => {
  const app = tempDir();

  write(join(app, 'node_modules/left-pad/package.json'), '{ not json');
  installed(app, 'kuito-battery', { kuito: { modules: '.' } });
  dependsOn(app, { 'left-pad': '^1.0.0' });

  assert.ok((await loadModules(app)).length > 0);

  dependsOn(app, { 'kuito-battery': '^1.0.0' });

  await assert.rejects(
    loadModules(app),
    /kuito\.modules names \., which is not a directory inside the package/,
  );
});

test('a packaged module of a name the app or another package takes is an error naming both', async () => {
  const app = tempDir();

  specIn(
    join(installed(app, 'kuito-battery', { kuito: { modules: 'modules' } }), 'modules'),
    'battery',
    BATTERY,
  );

  specIn(join(app, 'modules'), 'battery', BATTERY);
  dependsOn(app, { 'kuito-battery': '^1.0.0' });

  await assert.rejects(loadModules(app), (error: Error) => {
    assert.match(error.message, /^Battery is declared by both .+; rename one$/);
    assert.match(error.message, /\/node_modules\/kuito-battery\/modules\/battery\/battery\.ts/);
    assert.ok(error.message.includes(join(app, 'modules/battery/battery.ts')), error.message);

    return true;
  });
});

test('a module directory without its spec is an error naming the directory', async () => {
  const app = tempDir();

  write(join(app, 'modules/battery/ios/BatteryModule.swift'), '');

  await assert.rejects(
    loadModules(app),
    /modules\/battery has no spec: a module directory holds battery\.ts/,
  );
});

test('a spec whose platforms disagree with its sources is an error naming the spec', async () => {
  const cases: [(modules: string) => void, RegExp][] = [
    [
      (modules) => specIn(modules, 'battery', BATTERY, ['ios']),
      /battery\.ts: android\.class is declared, but battery\/android has no \.kt files/,
    ],
    [
      (modules) => {
        specIn(modules, 'torch', TORCH, ['ios']);
        write(join(modules, 'torch/android/TorchModule.kt'), '');
      },
      /torch\.ts: torch\/android has Kotlin sources, but no android\.class/,
    ],
  ];

  for (const [arrange, message] of cases) {
    const app = tempDir();

    arrange(join(app, 'modules'));
    await assert.rejects(loadModules(app), message);
  }
});

test('every built-in module has a spec, and no shell holds one its bundle does not call', async () => {
  const builtIn = await loadModules(tempDir());
  const names = builtIn.map(({ manifest }) => manifest.name);

  for (const module of builtIn)
    assert.equal(module.file, specFile(module.directory), `${module.manifest.name} has a spec`);

  for (const name of [
    'AppState',
    'Appearance',
    'BackgroundTasks',
    'Blur',
    'Brightness',
    'Clipboard',
    'ContextMenu',
    'DatePicker',
    'Drawing',
    'Device',
    'KeepAwake',
    'Localization',
    'Haptics',
    'Linking',
    'Location',
    'Network',
    'Permissions',
    'SecureStore',
    'SegmentedControl',
    'Select',
    'Share',
    'Slider',
    'Splash',
    'Storage',
    'Window',
  ])
    assert.ok(names.includes(name), name);

  // A module's permission ships only with the module, not in every app's manifest.
  const network = builtIn.find(({ manifest }) => manifest.name === 'Network');

  assert.deepEqual(network?.manifest.android?.permissions, [
    'android.permission.ACCESS_NETWORK_STATE',
  ]);

  assert.doesNotMatch(
    readFileSync(join(ROOT, 'native/android/app/src/main/AndroidManifest.xml'), 'utf8'),
    /ACCESS_NETWORK_STATE/,
  );

  // Location asks through Permissions natively, runs its background updates
  // as background task runs, and declares what it asks for.
  const location = builtIn.find(({ manifest }) => manifest.name === 'Location')?.manifest;

  assert.deepEqual(location?.requires, ['Permissions', 'BackgroundTasks']);
  assert.equal(typeof location?.ios?.infoPlist?.NSLocationWhenInUseUsageDescription, 'string');

  assert.deepEqual(location?.android?.permissions, [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
  ]);

  // The shell names no module: a shell whose bundle calls none holds none.
  assert.deepEqual(includeModules(builtIn, []), []);

  // What iOS and Android take only at launch: BGTaskScheduler's handlers and
  // the headless runtime's start, and the notification center's delegate.
  const launching = (platform: 'ios' | 'android') =>
    builtIn
      .filter(({ manifest }) => manifest[platform]?.launch)
      .map(({ manifest }) => manifest.name);

  assert.deepEqual(launching('ios'), ['BackgroundTasks', 'Location', 'Notifications']);
  assert.deepEqual(launching('android'), ['BackgroundTasks']);
});

test('an empty app’s shells hold no module, and no module’s permission, receiver or service', async () => {
  const root = tempDir();

  writeFileSync(
    join(root, 'app.tsx'),
    `import { VStack } from '${join(ROOT, 'src/ui')}';\nexport default function App() { return <VStack />; }`,
  );

  const { nativeModules, links, linkHash } = await createSourceCompiler({
    platform: 'ios',
    outputDir: join(root, 'dist'),
    root,
  })(join(root, 'app.tsx'));
  const { modules, link } = await shellModules(
    root,
    { uses: nativeModules, links, linkHash },
    configuredModules(APP_CONFIG),
  );

  assert.deepEqual(modules, []);
  assert.deepEqual(link.ids, []);

  // The framework's own manifest asks for INTERNET alone, for fetch; the generated one adds nothing.
  const manifest = androidManifest(APP_CONFIG, modules);

  assert.doesNotMatch(manifest, /<uses-permission|<receiver|<service|<provider/);
  assert.doesNotMatch(iosProjectSpec(APP_CONFIG, ROOT, modules, '/hermes'), /native\/modules\//);
});

test('a config whose native settings name a module’s class puts that module in the shell', () => {
  assert.deepEqual(configuredModules({ backgroundTasks: [], permissions: {} }), []);

  // Background tasks run in BackgroundTasks' job service; background location in Location's.
  assert.deepEqual(
    configuredModules({
      backgroundTasks: ['sync'],
      permissions: { locationAlways: 'Track your runs.' },
    }).map(({ name }) => name),
    ['BackgroundTasks', 'Location'],
  );
});

test('an app module may not take a built-in module’s name', async () => {
  const app = tempDir();

  specIn(join(app, 'modules'), 'haptics', HAPTICS, ['ios']);

  await assert.rejects(
    loadModules(app),
    /Haptics is declared by both \S*native\/modules\/haptics\/haptics\.ts and \S*modules\/haptics\/haptics\.ts; rename one/,
  );
});

const source = (name: string, extra: Record<string, unknown> = {}) => {
  const manifest = validateManifest({ name, ios: { class: `${name}Module` }, ...extra }, name);

  const file = `/m/${name}/${name}.ts`;
  const [spec] = catalogOf([
    { file, source: `export default defineModule('${name}', {});` },
  ]).modules;

  return { manifest, directory: `/m/${name}`, file, spec };
};

test('a shell includes the modules the app requires and what they require, nothing else', () => {
  const available = [
    source('Linking'),
    source('Haptics'),
    source('Video'),
    source('Camera', { requires: ['Haptics'] }),
  ];
  const names = (modules: NativeModuleSource[]) => modules.map(({ manifest }) => manifest.name);

  assert.deepEqual(names(includeModules(available, [])), [], 'nothing imported');

  assert.deepEqual(
    names(includeModules(available, [{ name: 'Camera', file: '/app/scan.tsx', line: 3 }])),
    ['Camera', 'Haptics'],
  );

  assert.deepEqual(names(includeModules(available, 'all')), [
    'Camera',
    'Haptics',
    'Linking',
    'Video',
  ]);

  assert.throws(
    () => includeModules(available, [{ name: 'Battery', file: '/app/home.tsx', line: 7 }]),
    /\/app\/home\.tsx:7: no native module named Battery\. Available: Camera, Haptics, Linking, Video/,
  );

  assert.throws(
    () => includeModules([source('Camera', { requires: ['Lens'] })], []),
    /\/m\/Camera\/Camera\.ts: requires Lens, which no module provides/,
  );
});

test('Android permissions of included modules join the app’s in the generated manifest', () => {
  const manifest = androidManifest({ ...APP_CONFIG, permissions: {} }, [
    source('Camera', {
      android: { class: 'a.b.Camera', permissions: ['android.permission.CAMERA'] },
    }),
    source('Vibrate', {
      android: {
        class: 'a.b.Vibrate',
        permissions: ['android.permission.VIBRATE', 'android.permission.CAMERA'],
      },
    }),
  ]);

  assert.deepEqual(
    [...manifest.matchAll(/<uses-permission android:name="([^"]+)" \/>/g)].map((match) => match[1]),
    ['android.permission.CAMERA', 'android.permission.VIBRATE'],
  );
});

test('Android features of included modules join the generated manifest, required unless they say not', () => {
  const manifest = androidManifest({ ...APP_CONFIG, permissions: {} }, [
    source('Camera', {
      android: {
        class: 'a.b.Camera',
        features: [
          { name: 'android.hardware.camera.any', required: false },
          { name: 'android.hardware.camera.autofocus', required: false },
        ],
      },
    }),
    source('Nfc', {
      android: { class: 'a.b.Nfc', features: [{ name: 'android.hardware.nfc' }] },
    }),
  ]);

  assert.deepEqual(
    [
      ...manifest.matchAll(/<uses-feature android:name="([^"]+)" android:required="(\w+)" \/>/g),
    ].map((match) => `${match[1]} ${match[2]}`),
    [
      'android.hardware.camera.any false',
      'android.hardware.camera.autofocus false',
      'android.hardware.nfc true',
    ],
  );
});

test('Android providers of included modules join the generated manifest, with their resources', () => {
  const manifest = androidManifest({ ...APP_CONFIG, permissions: {} }, [
    source('Camera', {
      android: {
        class: 'a.b.Camera',
        providers: [
          {
            name: 'a.b.CaptureProvider',
            authorities: '${applicationId}.camera',
            exported: 'false',
            grantUriPermissions: 'true',
            resources: { 'android.support.FILE_PROVIDER_PATHS': '@xml/camera_paths' },
          },
        ],
      },
    }),
  ]);

  assert.match(
    manifest,
    new RegExp(
      [
        '        <provider android:name="a\\.b\\.CaptureProvider" android:authorities="\\$\\{applicationId\\}\\.camera" android:exported="false" android:grantUriPermissions="true">',
        '            <meta-data android:name="android\\.support\\.FILE_PROVIDER_PATHS" android:resource="@xml/camera_paths" />',
        '        </provider>',
      ].join('\n'),
    ),
  );
});

test('Android services of included modules join the generated manifest', () => {
  const manifest = androidManifest({ ...APP_CONFIG, permissions: {} }, [
    source('Uploads', {
      android: {
        class: 'a.b.Uploads',
        services: [
          { name: 'a.b.UploadService', exported: 'false', foregroundServiceType: 'dataSync' },
        ],
      },
    }),
  ]);

  assert.match(
    manifest,
    /        <service android:name="a\.b\.UploadService" android:exported="false" android:foregroundServiceType="dataSync" \/>/,
  );
});

test('Android receivers of included modules join the generated manifest, with their actions', () => {
  const manifest = androidManifest({ ...APP_CONFIG, permissions: {} }, [
    source('Reminders', {
      android: {
        class: 'a.b.Reminders',
        receivers: [
          { name: 'a.b.AlarmReceiver', exported: 'false' },
          {
            name: 'a.b.BootReceiver',
            exported: 'false',
            enabled: 'false',
            actions: ['android.intent.action.BOOT_COMPLETED'],
          },
        ],
      },
    }),
  ]);

  assert.match(
    manifest,
    /        <receiver android:name="a\.b\.AlarmReceiver" android:exported="false" \/>/,
  );

  assert.ok(
    manifest.includes(
      [
        '        <receiver android:name="a.b.BootReceiver" android:exported="false" android:enabled="false">',
        '            <intent-filter>',
        '                <action android:name="android.intent.action.BOOT_COMPLETED" />',
        '            </intent-filter>',
        '        </receiver>',
      ].join('\n'),
    ),
    manifest,
  );
});

test('invalid Android receivers are an error naming the spec and the key', () => {
  const file = 'modules/battery/battery.ts';
  const android = { class: 'a.b.Battery' };
  const invalid: [unknown, RegExp][] = [
    [{ exported: 'false' }, /android\.receivers\[0\]\.name must be a non-empty string/],
    [
      { name: 'a.b.R', actions: 'android.intent.action.BOOT_COMPLETED' },
      /android\.receivers\[0\]\.actions must be an array/,
    ],
    [
      { name: 'a.b.R', actions: ['boot completed'] },
      /android\.receivers\[0\]\.actions\[0\] must be an action like android\.intent\.action\.BOOT_COMPLETED/,
    ],
    [
      { name: 'a.b.R', 'android:exported': 'false' },
      /android\.receivers\[0\]\.android:exported must be an attribute name without android:/,
    ],
  ];

  for (const [receiver, message] of invalid)
    assert.throws(
      () =>
        validateManifest({ name: 'Battery', android: { ...android, receivers: [receiver] } }, file),
      message,
      JSON.stringify(receiver),
    );
});

test('Audio declares its media playback service and the permissions it runs with', async () => {
  const builtIn = await loadModules(tempDir());
  const manifest = androidManifest(
    { ...APP_CONFIG, permissions: {} },
    builtIn.filter(({ manifest }) => manifest.name === 'Audio'),
  );

  for (const permission of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK'])
    assert.match(
      manifest,
      new RegExp(`<uses-permission android:name="android\\.permission\\.${permission}" />`),
    );

  assert.match(
    manifest,
    /<service android:name="dev\.kuito\.runtime\.modules\.audio\.KuitoAudioService" android:exported="false" android:foregroundServiceType="mediaPlayback" \/>/,
  );
});

test('Notifications posts its alarms through a receiver and restores them after a reboot', async () => {
  const builtIn = await loadModules(tempDir());
  const manifest = androidManifest(
    { ...APP_CONFIG, permissions: {} },
    builtIn.filter(({ manifest }) => manifest.name === 'Notifications'),
  );
  const receivers = 'dev\\.kuito\\.runtime\\.modules\\.notifications';

  // Exact alarms where Android grants them (12 and 13 at install, 14 once the user allows).
  for (const permission of ['RECEIVE_BOOT_COMPLETED', 'SCHEDULE_EXACT_ALARM'])
    assert.match(
      manifest,
      new RegExp(`<uses-permission android:name="android\\.permission\\.${permission}" />`),
    );

  assert.match(
    manifest,
    new RegExp(
      `<receiver android:name="${receivers}\\.KuitoNotificationAlarmReceiver" android:exported="false" />`,
    ),
  );

  // Off until something is scheduled, so a reboot doesn't start an app with nothing to restore.
  assert.match(
    manifest,
    new RegExp(
      `<receiver android:name="${receivers}\\.KuitoNotificationRestoreReceiver" android:exported="false" android:enabled="false">\\s*` +
        '<intent-filter>\\s*<action android:name="android\\.intent\\.action\\.BOOT_COMPLETED" />',
    ),
  );
});

const appConfig = {
  name: 'Hello',
  ios: { bundleIdentifier: 'com.example.hello' },
  android: { applicationId: 'com.example.hello' },
};

test('module names are PascalCase identifiers', () => {
  for (const name of ['Battery', 'QRScanner', 'Mp3']) assert.equal(validateModuleName(name), name);

  for (const name of ['', 'battery', '3D', 'My-Module', 'My Module', '../Escape'])
    assert.throws(() => validateModuleName(name), /Module name/, JSON.stringify(name));
});

test('module create scaffolds a spec and both platforms, which loading accepts', async () => {
  const root = tempDir();
  const files = await createModule({ name: 'Battery', root, config: appConfig });

  assert.deepEqual(files, [
    'modules/battery/android/BatteryModule.kt',
    'modules/battery/battery.ts',
    'modules/battery/ios/BatteryModule.swift',
  ]);

  const found = (await loadModules(root)).find(({ manifest }) => manifest.name === 'Battery');

  assert.equal(found?.file, join(root, 'modules/battery/battery.ts'));
  assert.equal(found?.spec.spec.name, 'Battery');
  assert.equal(found?.manifest.ios?.class, 'BatteryModule');
  assert.equal(found?.manifest.android?.class, 'com.example.hello.modules.battery.BatteryModule');

  const kotlin = readFileSync(join(root, 'modules/battery/android/BatteryModule.kt'), 'utf8');

  assert.match(kotlin, /^package com\.example\.hello\.modules\.battery$/m);

  assert.match(
    kotlin,
    /class BatteryModule\(private val context: KuitoModuleContext\) : BatterySpec/,
  );

  const swift = readFileSync(join(root, 'modules/battery/ios/BatteryModule.swift'), 'utf8');

  assert.match(swift, /final class BatteryModule: BatterySpec/);

  const spec = readFileSync(join(root, 'modules/battery/battery.ts'), 'utf8');

  assert.match(spec, /export default defineModule\('Battery', \{/);
  assert.doesNotMatch(spec + swift + kotlin, /Example|\{\{/, 'every placeholder is filled');

  await assert.rejects(
    createModule({ name: 'Battery', root, config: appConfig }),
    /modules\/battery already exists/,
  );

  await assert.rejects(
    createModule({ name: 'Haptics', root, config: appConfig }),
    /Haptics is a built-in module; choose another name/,
  );
});

test('module create is a command that takes the module name', () => {
  const args = parseArgs(['module', 'create', 'Battery']);

  assert.equal(args.command, 'module');
  assert.equal(args.name, 'Battery');
  assert.throws(() => parseArgs(['module', 'create']), /kuito module create <Name>/);
  assert.throws(() => parseArgs(['module']), /kuito module create <Name>/);
  assert.throws(() => parseArgs(['module', 'delete', 'Battery']), /kuito module create <Name>/);
});

test('kuito module create writes into the project it runs in and says how to use it', async () => {
  const root = tempDir();
  const lines: string[] = [];

  write(join(root, 'kuito.config.ts'), `export default ${JSON.stringify(appConfig)};\n`);
  write(join(root, 'package.json'), '{ "type": "module" }');

  await main(['module', 'create', 'TorchLight'], { cwd: root, out: (line) => lines.push(line) });

  assert.match(
    readFileSync(join(root, 'modules/torch-light/android/TorchLightModule.kt'), 'utf8'),
    /^package com\.example\.hello\.modules\.torchlight$/m,
  );

  assert.match(lines.join('\n'), /import TorchLight from '\.\/modules\/torch-light\/torch-light';/);
});

test('a scaffolded module compiles, and the app that imports it requires it', async () => {
  const root = realpathSync(tempDir());

  await createModule({ name: 'Battery', root, config: appConfig });
  // What `npm install` does with the app's file: dependency.
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  symlinkSync(ROOT, join(root, 'node_modules/kuito'), 'dir');

  write(
    join(root, 'app.tsx'),
    `import { Text } from 'kuito';
import Battery from './modules/battery/battery';
export default function App() { return <Text>{Battery.platform()}</Text>; }`,
  );

  const { nativeModules } = await createSourceCompiler({
    platform: 'ios',
    outputDir: join(root, 'dist'),
    root,
  })(join(root, 'app.tsx'));

  assert.ok(
    nativeModules.some(
      ({ name, file }) => name === 'Battery' && file === join(root, 'modules/battery/battery.ts'),
    ),
  );
});

test('a module with a spec is described by it: its native needs, and the specs it imports as requires', async () => {
  const app = tempDir();

  specIn(join(app, 'modules'), 'battery', BATTERY);
  specIn(join(app, 'modules'), 'charger', CHARGER);

  const charger = (await loadModules(app)).find(({ manifest }) => manifest.name === 'Charger');

  assert.equal(charger?.file, join(app, 'modules/charger/charger.ts'));
  assert.equal(charger?.spec?.spec.name, 'Charger');
  assert.deepEqual(charger?.manifest.requires, ['Battery']);
  assert.deepEqual(charger?.manifest.ios?.frameworks, ['CoreHaptics']);
  assert.deepEqual(charger?.manifest.ios?.infoPlist, { UIRequiresFullScreen: true });
  assert.deepEqual(charger?.manifest.android?.permissions, ['android.permission.BATTERY_STATS']);
});

test("a spec's native needs are checked like a manifest's, naming the spec", async () => {
  const app = tempDir();

  specIn(join(app, 'modules'), 'battery', BATTERY.replace("'BatteryModule'", "'Battery-Module'"));

  await assert.rejects(loadModules(app), /battery\.ts: ios\.class must be a Swift class name/);

  const other = tempDir();

  specIn(join(other, 'modules'), 'battery', BATTERY, ['android']);

  await assert.rejects(
    loadModules(other),
    /battery\.ts: ios\.class is declared, but battery\/ios has no \.swift files/,
  );
});

test('a shell links the functions its bundle calls, numbered by the catalog it compiled with', async () => {
  const app = tempDir();

  specIn(join(app, 'modules'), 'battery', BATTERY);
  specIn(join(app, 'modules'), 'charger', CHARGER);

  const all = await shellModules(app, 'all');
  const ids = (name: string) =>
    all.link.catalog.members.flatMap(({ id, module, member }) =>
      `${module.name}.${member.name}` === name ? [id] : [],
    );
  const [level] = ids('Battery.level');
  const uses = [{ name: 'Charger', file: join(app, 'modules/charger/charger.ts'), line: 4 }];
  const shell = await shellModules(app, { uses, links: [level], linkHash: all.link.catalog.hash });

  assert.deepEqual(shell.link.ids, [level]);

  assert.deepEqual(
    shell.modules.filter(({ file }) => file.startsWith(app)).map(({ manifest }) => manifest.name),
    ['Battery', 'Charger'],
    'Charger, and Battery, which it requires',
  );

  await assert.rejects(
    shellModules(app, { uses, links: [level], linkHash: 'stale' }),
    /A native module spec changed while the app compiled, so its function ids moved: build again/,
  );
});
