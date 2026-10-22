import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import type { NativeModuleSource } from '../src/cli/modules.ts';
import { mergeEntries, renderManifest } from '../src/cli/native-entries.ts';
import { buildAndroid } from '../src/cli/platforms.ts';
import {
  androidManifest,
  androidProperties,
  androidThemes,
  iosProjectSpec,
} from '../src/cli/shells.ts';
import { resolveConfig, type AppConfig } from '../src/cli/kuito-config.ts';
import { moduleAt } from './support/module-source.ts';

const FILE = '/app/kuito.config.ts';

const base = {
  name: 'Hello Kuito',
  ios: { bundleIdentifier: 'com.example.hello' },
  android: { applicationId: 'com.example.hello' },
};

const resolve = (extra: Record<string, unknown>, environment = 'production') =>
  resolveConfig({ ...base, ...extra }, FILE, environment);

const ios = (extra: Record<string, unknown>) => ({ ios: { ...base.ios, ...extra } });
const android = (extra: Record<string, unknown>) => ({ android: { ...base.android, ...extra } });

type Spec = {
  targets: {
    KuitoIOS: {
      deploymentTarget?: string;
      settings: { base: Record<string, string> };
      info: { properties: Record<string, unknown> };
      entitlements?: { path: string; properties: Record<string, unknown> };
    };
  };
};

const spec = (app: AppConfig, modules: readonly NativeModuleSource[] = []) =>
  (JSON.parse(iosProjectSpec(app, '/fw', modules, '/hermes')) as Spec).targets.KuitoIOS;

const plist = (app: AppConfig) => spec(app).info.properties;

/** The `<activity>` element of the generated manifest overlay. */
const activity = (manifest: string) =>
  manifest.match(/<activity android:name="dev\.kuito\.runtime\.KuitoActivity"[^>]*>/)?.[0] ?? '';

/** The opening `<application>` tag of the generated manifest overlay. */
const application = (manifest: string) => manifest.match(/<application\b[^>]*>/)?.[0] ?? '';

// The merge layer: every source of shell entries feeds one merge.

test('entries from every source merge into one Info.plist; two sources may not disagree on a key', () => {
  const merged = mergeEntries([
    { source: 'a', kind: 'app', infoPlist: { A: 1, Shared: 'same' } },
    { source: 'b', kind: 'app', infoPlist: { B: true, Shared: 'same' } },
  ]);

  assert.deepEqual(merged.infoPlist, { A: 1, Shared: 'same', B: true });

  assert.throws(
    () =>
      mergeEntries([
        { source: 'kuito.config.ts: orientation', kind: 'app', infoPlist: { K: ['x'] } },
        { source: 'kuito.config.ts: ios.infoPlist', kind: 'raw', infoPlist: { K: ['y'] } },
      ]),
    /Info\.plist key K is set by both kuito\.config\.ts: orientation and kuito\.config\.ts: ios\.infoPlist/,
  );
});

test('list keys like UIBackgroundModes add up across sources instead of conflicting', () => {
  const merged = mergeEntries([
    { source: 'a', kind: 'module', infoPlist: { UIBackgroundModes: ['fetch', 'processing'] } },
    { source: 'b', kind: 'app', infoPlist: { UIBackgroundModes: ['audio', 'fetch'] } },
  ]);

  assert.deepEqual(merged.infoPlist.UIBackgroundModes, ['fetch', 'processing', 'audio']);
});

test('the app’s typed settings replace a module’s default; its raw entries may not', () => {
  const module = { source: 'camera/camera.ts', kind: 'module' as const };

  assert.deepEqual(
    mergeEntries([
      { ...module, infoPlist: { NSCameraUsageDescription: 'Scan codes' } },
      {
        source: 'kuito.config.ts: permissions',
        kind: 'app',
        infoPlist: { NSCameraUsageDescription: 'Scan tickets' },
      },
    ]).infoPlist,
    { NSCameraUsageDescription: 'Scan tickets' },
  );

  assert.throws(
    () =>
      mergeEntries([
        { ...module, infoPlist: { NSCameraUsageDescription: 'Scan codes' } },
        {
          source: 'kuito.config.ts: ios.infoPlist',
          kind: 'raw',
          infoPlist: { NSCameraUsageDescription: 'Scan tickets' },
        },
      ]),
    /NSCameraUsageDescription is set by both camera\/camera\.ts and kuito\.config\.ts: ios\.infoPlist/,
  );
});

test('the shell’s own entries are claimed: nothing may set them, even to the same value', () => {
  const shell = {
    source: 'the Kuito shell (AndroidManifest.xml)',
    kind: 'shell' as const,
    manifest: { activity: { launchMode: 'singleTask' } },
  };

  assert.throws(
    () =>
      mergeEntries([
        shell,
        {
          source: 'kuito.config.ts: android.manifest',
          kind: 'raw',
          manifest: { activity: { launchMode: 'singleTask' } },
        },
      ]),
    /<activity> attribute android:launchMode is set by both the Kuito shell \(AndroidManifest\.xml\) and kuito\.config\.ts: android\.manifest/,
  );

  assert.deepEqual(
    mergeEntries([shell]).manifest.activity,
    {},
    'the shell’s manifest already has them',
  );
});

test('entitlements, manifest attributes, meta-data and theme items conflict the same way, each named', () => {
  const cases: [Record<string, unknown>, Record<string, unknown>, RegExp][] = [
    [{ entitlements: { E: true } }, { entitlements: { E: false } }, /entitlement E is set by both/],
    [
      { manifest: { application: { allowBackup: 'true' } } },
      { manifest: { application: { allowBackup: 'false' } } },
      /<application> attribute android:allowBackup is set by both/,
    ],
    [
      { manifest: { metaData: { 'com.example.key': 'a' } } },
      { manifest: { metaData: { 'com.example.key': 'b' } } },
      /meta-data com\.example\.key is set by both/,
    ],
    [
      { theme: { 'android:windowBackground': '#000000' } },
      { theme: { 'android:windowBackground': '#FFFFFF' } },
      /AppTheme item android:windowBackground is set by both/,
    ],
  ];

  for (const [first, second, message] of cases)
    assert.throws(
      () =>
        mergeEntries([
          { source: 'a', kind: 'app', ...first },
          { source: 'b', kind: 'raw', ...second },
        ]),
      message,
    );
});

test('manifest lists join: permissions and features once each, queries and intent filters together', () => {
  const merged = mergeEntries([
    {
      source: 'a',
      kind: 'app',
      manifest: {
        usesPermissions: [{ name: 'android.permission.READ_EXTERNAL_STORAGE', maxSdk: 32 }],
        queries: { packages: ['com.example.maps'], intents: [] },
      },
    },
    {
      source: 'b',
      kind: 'module',
      manifest: {
        usesPermissions: [
          { name: 'android.permission.READ_EXTERNAL_STORAGE' },
          { name: 'android.permission.VIBRATE' },
        ],
        usesFeatures: [{ name: 'android.hardware.camera', required: false }],
        queries: { packages: ['com.example.maps', 'com.example.pay'], intents: [] },
      },
    },
  ]);

  assert.deepEqual(merged.manifest.usesPermissions, [
    { name: 'android.permission.READ_EXTERNAL_STORAGE', maxSdk: 32 },
    { name: 'android.permission.VIBRATE' },
  ]);

  assert.deepEqual(merged.manifest.queries.packages, ['com.example.maps', 'com.example.pay']);

  assert.deepEqual(merged.manifest.usesFeatures, [
    { name: 'android.hardware.camera', required: false },
  ]);
});

test('the manifest overlay replaces the shell’s attributes with tools:replace and escapes values', () => {
  const xml = renderManifest(
    mergeEntries([
      {
        source: 'a',
        kind: 'raw',
        manifest: {
          application: { allowBackup: 'false' },
          activity: { screenOrientation: 'portrait', windowSoftInputMode: 'adjustPan' },
          metaData: { 'com.example.title': 'Tom & "Jerry"' },
          intentFilters: [
            {
              actions: ['android.intent.action.VIEW'],
              categories: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
              data: [{ scheme: 'https', host: 'example.com', pathPrefix: '/show' }],
              autoVerify: true,
            },
          ],
        },
      },
    ]).manifest,
  );

  assert.match(xml, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  assert.match(application(xml), /android:allowBackup="false"/);
  assert.match(application(xml), /tools:replace="android:allowBackup"/);
  assert.match(activity(xml), /android:screenOrientation="portrait"/);

  assert.match(
    activity(xml),
    /tools:replace="android:screenOrientation,android:windowSoftInputMode"/,
  );

  assert.match(
    xml,
    /<meta-data android:name="com\.example\.title" android:value="Tom &amp; &quot;Jerry&quot;" \/>/,
  );

  assert.match(xml, /<intent-filter android:autoVerify="true">/);

  assert.match(
    xml,
    /<data android:scheme="https" android:host="example\.com" android:pathPrefix="\/show" \/>/,
  );
});

// kuito.config.ts: typed settings and the escape hatch.

test('typed settings default to the shells’ own behavior', () => {
  const app = resolve({});

  assert.equal(app.orientation, 'default');
  assert.equal(app.colorScheme, 'automatic');
  assert.equal(app.backgroundColor, null);
  assert.deepEqual(app.statusBar, { style: 'auto', hidden: false });
  assert.deepEqual(app.urlSchemes, []);
  assert.deepEqual(app.linkDomains, []);
  assert.equal(app.ios.supportsTablet, true);
  assert.equal(app.ios.deploymentTarget, '16.0');
  assert.equal(app.ios.teamId, null);
  assert.equal(app.android.softInputMode, 'resize');
  assert.equal(app.android.minSdk, 26);
  assert.equal(app.strict, false);
  assert.equal(resolve({ strict: true }).strict, true);
});

test('the team an iPhone build signs with is the app’s, written into its project', () => {
  const signed = resolve(ios({ teamId: 'A1B2C3D4E5' }));

  assert.equal(signed.ios.teamId, 'A1B2C3D4E5');
  assert.equal(spec(signed).settings.base.DEVELOPMENT_TEAM, 'A1B2C3D4E5');
  assert.equal(spec(signed).settings.base.CODE_SIGN_STYLE, 'Automatic');
  assert.ok(!('DEVELOPMENT_TEAM' in spec(resolve({})).settings.base), 'no team, none written');
});

test('the upload key a store build signs with is named in the config, never its passwords', () => {
  assert.deepEqual(resolve({}).android.signing, { keystore: null, keyAlias: null });

  const signed = resolve(
    android({ signing: { keystore: './keys/upload.jks', keyAlias: 'upload' } }),
  );

  assert.deepEqual(signed.android.signing, { keystore: './keys/upload.jks', keyAlias: 'upload' });

  assert.throws(
    () => resolve(android({ signing: { keystore: './upload.jks', password: 'secret' } })),
    /android\.signing\.password is not a config key/,
  );

  assert.throws(
    () => resolve(android({ signing: { keystore: 42 } })),
    /android\.signing\.keystore must be a path to a keystore, relative to kuito\.config\.ts/,
  );
});

test('a typed setting takes only its documented values; anything else names the key', () => {
  const invalid: [Record<string, unknown>, RegExp][] = [
    [{ orientation: 'sideways' }, /orientation must be one of default, portrait, landscape/],
    [{ colorScheme: 'night' }, /colorScheme must be one of automatic, light, dark/],
    [{ backgroundColor: 'black' }, /backgroundColor must be a color like #1E88E5/],
    [{ statusBar: { style: 'white' } }, /statusBar\.style must be one of auto, light, dark/],
    [{ statusBar: { hidden: 'yes' } }, /statusBar\.hidden must be true or false/],
    [{ statusBar: { color: '#000000' } }, /statusBar\.color is not a config key/],
    [{ urlSchemes: 'myapp' }, /urlSchemes must be an array/],
    [{ urlSchemes: ['My App'] }, /urlSchemes\[0\] must be a URL scheme like myapp/],
    [
      { linkDomains: ['https://example.com'] },
      /linkDomains\[0\] must be a domain like example\.com: no scheme or path/,
    ],
    [ios({ supportsTablet: 1 }), /ios\.supportsTablet must be true or false/],
    [ios({ deploymentTarget: '15.0' }), /ios\.deploymentTarget must be 16\.0 or later, like 17\.0/],
    [ios({ deploymentTarget: 'latest' }), /ios\.deploymentTarget must be 16\.0 or later/],
    [
      ios({ teamId: 'my team' }),
      /ios\.teamId must be a 10-character Apple Developer Team ID like A1B2C3D4E5/,
    ],
    [
      ios({ associatedDomains: ['example.com'] }),
      /ios\.associatedDomains\[0\] must be like applinks:example\.com/,
    ],
    [
      ios({ backgroundModes: ['music'] }),
      /ios\.backgroundModes\[0\] must be one of audio, location/,
    ],
    [
      ios({ pushEnvironment: 'sandbox' }),
      /ios\.pushEnvironment must be one of development, production/,
    ],
    [android({ softInputMode: 'adjustPan' }), /android\.softInputMode must be one of resize, pan/],
    [android({ minSdk: 21 }), /android\.minSdk must be a whole number from 26 to 35/],
    [{ strict: 'yes' }, /strict must be true or false/],
  ];

  for (const [extra, message] of invalid)
    assert.throws(() => resolve(extra), {
      message: new RegExp('kuito\\.config\\.ts: ' + message.source),
    });
});

test('Info.plist and entitlement values are plist data: no null, functions or non-finite numbers', () => {
  const app = resolve(
    ios({
      infoPlist: { LSApplicationQueriesSchemes: ['maps'], ITSAppUsesNonExemptEncryption: false },
      entitlements: { 'aps-environment': 'development' },
    }),
  );

  assert.deepEqual(app.ios.infoPlist, {
    LSApplicationQueriesSchemes: ['maps'],
    ITSAppUsesNonExemptEncryption: false,
  });

  assert.deepEqual(app.ios.entitlements, { 'aps-environment': 'development' });

  const invalid: [Record<string, unknown>, RegExp][] = [
    [ios({ infoPlist: [] }), /ios\.infoPlist must be an object/],
    [
      ios({ infoPlist: { A: null } }),
      /ios\.infoPlist\.A must be a string, number, boolean, array or object/,
    ],
    [ios({ infoPlist: { A: [1, Number.NaN] } }), /ios\.infoPlist\.A\[1\] must be a string, number/],
    [
      ios({ entitlements: { E: { F: () => 1 } } }),
      /ios\.entitlements\.E\.F must be a string, number/,
    ],
  ];

  for (const [extra, message] of invalid) assert.throws(() => resolve(extra), message);
});

test('android.manifest takes data, never XML: attribute names, values and entries are checked', () => {
  const app = resolve(
    android({
      manifest: {
        application: { allowBackup: false, largeHeap: true },
        activity: { screenOrientation: 'fullUser' },
        metaData: { 'com.google.android.geo.API_KEY': 'abc', 'com.example.count': 3 },
        usesPermissions: ['android.permission.VIBRATE'],
        usesFeatures: [{ name: 'android.hardware.camera', required: false }],
        queries: {
          packages: ['com.example.maps'],
          intents: [{ action: 'android.intent.action.SEND', data: { mimeType: 'text/plain' } }],
        },
        intentFilters: [
          {
            actions: ['android.intent.action.VIEW'],
            categories: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
            data: [{ scheme: 'https', host: 'example.com' }],
            autoVerify: true,
          },
        ],
      },
      theme: { 'android:navigationBarColor': '#000000', colorAccent: '#FF0000' },
    }),
  );

  assert.deepEqual(app.android.manifest, {
    application: { allowBackup: 'false', largeHeap: 'true' },
    activity: { screenOrientation: 'fullUser' },
    metaData: { 'com.google.android.geo.API_KEY': 'abc', 'com.example.count': '3' },
    usesPermissions: ['android.permission.VIBRATE'],
    usesFeatures: [{ name: 'android.hardware.camera', required: false }],
    queries: {
      packages: ['com.example.maps'],
      intents: [{ action: 'android.intent.action.SEND', data: { mimeType: 'text/plain' } }],
    },
    intentFilters: [
      {
        actions: ['android.intent.action.VIEW'],
        categories: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
        data: [{ scheme: 'https', host: 'example.com' }],
        autoVerify: true,
      },
    ],
  });

  assert.deepEqual(app.android.theme, {
    'android:navigationBarColor': '#000000',
    colorAccent: '#FF0000',
  });

  const manifest = (value: unknown) => android({ manifest: value });
  const invalid: [Record<string, unknown>, RegExp][] = [
    [manifest({ services: [] }), /android\.manifest\.services is not a config key/],
    [
      manifest({ application: { 'android:allowBackup': false } }),
      /android\.manifest\.application\.android:allowBackup must be an attribute name like allowBackup, without android:/,
    ],
    [
      manifest({ activity: { theme: '<style/>' } }),
      /android\.manifest\.activity\.theme must be a value, not XML/,
    ],
    [
      manifest({ metaData: { key: null } }),
      /android\.manifest\.metaData\.key must be a string, number or boolean/,
    ],
    [
      manifest({ usesPermissions: ['CAMERA PLEASE'] }),
      /android\.manifest\.usesPermissions\[0\] must be a permission like android\.permission\.VIBRATE/,
    ],
    [
      manifest({ usesFeatures: [{ name: 'gps', needed: true }] }),
      /android\.manifest\.usesFeatures\[0\]\.needed is not a key \(name, required\)/,
    ],
    [
      manifest({ intentFilters: [{ actions: [] }] }),
      /android\.manifest\.intentFilters\[0\]\.actions must name at least one action/,
    ],
    [
      manifest({
        intentFilters: [{ actions: ['android.intent.action.VIEW'], data: [{ hostname: 'x' }] }],
      }),
      /android\.manifest\.intentFilters\[0\]\.data\[0\]\.hostname is not a key \(scheme, host, port, path, pathPrefix, pathPattern, mimeType\)/,
    ],
    [
      android({ theme: { 'bad name': 'x' } }),
      /android\.theme\.bad name must be an item name like android:windowBackground or colorAccent/,
    ],
    [android({ theme: { colorAccent: 1 } }), /android\.theme\.colorAccent must be a string/],
  ];

  for (const [extra, message] of invalid)
    assert.throws(() => resolve(extra), {
      message: new RegExp('kuito\\.config\\.ts: ' + message.source),
    });
});

test('an environment overrides any setting; Info.plist, entitlement, manifest and theme maps merge key by key', () => {
  const config = {
    orientation: 'portrait',
    urlSchemes: ['hello'],
    ...ios({ infoPlist: { A: 1, B: 2 } }),
    ...android({
      manifest: { metaData: { a: 'base', b: 'base' } },
      theme: { colorAccent: '#000000' },
    }),
    environments: {
      staging: {
        orientation: 'default',
        urlSchemes: ['hello-staging'],
        statusBar: { hidden: true },
        ios: { infoPlist: { B: 3 } },
        android: { manifest: { metaData: { b: 'staging' } }, theme: { colorPrimary: '#FFFFFF' } },
      },
    },
  };
  const staging = resolve(config, 'staging');

  assert.equal(staging.orientation, 'default');
  assert.deepEqual(staging.urlSchemes, ['hello-staging'], 'a list is replaced');
  assert.deepEqual(staging.statusBar, { style: 'auto', hidden: true });
  assert.deepEqual(staging.ios.infoPlist, { A: 1, B: 3 });
  assert.deepEqual(staging.android.manifest.metaData, { a: 'base', b: 'staging' });
  assert.deepEqual(staging.android.theme, { colorAccent: '#000000', colorPrimary: '#FFFFFF' });
  assert.equal(resolve(config).orientation, 'portrait');
});

// The generated shells.

test('orientation locks both shells: supported orientations on iOS, screenOrientation on Android', () => {
  const portrait = resolve({ orientation: 'portrait' });

  assert.deepEqual(plist(portrait).UISupportedInterfaceOrientations, [
    'UIInterfaceOrientationPortrait',
  ]);

  assert.deepEqual(plist(portrait)['UISupportedInterfaceOrientations~ipad'], [
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationPortraitUpsideDown',
  ]);

  assert.match(activity(androidManifest(portrait, [])), /android:screenOrientation="portrait"/);

  const landscape = resolve({ orientation: 'landscape' });

  assert.deepEqual(plist(landscape).UISupportedInterfaceOrientations, [
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
  ]);

  assert.match(
    activity(androidManifest(landscape, [])),
    /android:screenOrientation="sensorLandscape"/,
  );

  const unlocked = resolve({});

  assert.equal(plist(unlocked).UISupportedInterfaceOrientations, undefined);
  assert.doesNotMatch(androidManifest(unlocked, []), /screenOrientation/);
});

test('colorScheme forces light or dark: UIUserInterfaceStyle on iOS, the theme and night mode on Android', () => {
  const dark = resolve({ colorScheme: 'dark' });

  assert.equal(plist(dark).UIUserInterfaceStyle, 'Dark');

  assert.match(
    androidManifest(dark, []),
    /<meta-data android:name="dev\.kuito\.colorScheme" android:value="dark" \/>/,
  );

  const darkThemes = androidThemes(dark, []);

  for (const file of ['values/themes.xml', 'values-night/themes.xml'])
    assert.match(
      darkThemes[file],
      /<style name="AppTheme" parent="@android:style\/Theme\.Material\.NoActionBar">/,
    );

  const automatic = androidThemes(resolve({}), []);

  assert.match(
    automatic['values/themes.xml'],
    /parent="@android:style\/Theme\.Material\.Light\.NoActionBar"/,
  );

  assert.match(
    automatic['values-night/themes.xml'],
    /parent="@android:style\/Theme\.Material\.NoActionBar"/,
  );

  assert.equal(plist(resolve({})).UIUserInterfaceStyle, undefined);
  assert.equal(plist(resolve({ colorScheme: 'light' })).UIUserInterfaceStyle, 'Light');
});

test('backgroundColor paints the root window on both platforms', () => {
  const app = resolve({ backgroundColor: '#102030' });

  assert.equal(plist(app).KuitoBackgroundColor, '#102030');

  assert.match(
    androidManifest(app, []),
    /<meta-data android:name="dev\.kuito\.backgroundColor" android:value="#102030" \/>/,
  );

  assert.match(
    androidThemes(app, [])['values/themes.xml'],
    /<item name="android:windowBackground">#102030<\/item>/,
  );
});

test('statusBar sets the initial style and visibility: Info.plist on iOS, theme items on Android', () => {
  const automatic = androidThemes(resolve({}), []);

  assert.match(
    automatic['values/themes.xml'],
    /<item name="android:windowLightStatusBar">true<\/item>/,
  );

  assert.match(
    automatic['values-night/themes.xml'],
    /<item name="android:windowLightStatusBar">false<\/item>/,
  );

  const light = resolve({ statusBar: { style: 'light', hidden: true } });

  assert.equal(plist(light).UIStatusBarStyle, 'UIStatusBarStyleLightContent');
  assert.equal(plist(light).UIStatusBarHidden, true);

  for (const contents of Object.values(androidThemes(light, []))) {
    assert.match(contents, /<item name="android:windowLightStatusBar">false<\/item>/);
    assert.match(contents, /<item name="android:windowFullscreen">true<\/item>/);
  }

  assert.equal(
    plist(resolve({ statusBar: { style: 'dark' } })).UIStatusBarStyle,
    'UIStatusBarStyleDarkContent',
  );
});

test('urlSchemes open the app: CFBundleURLTypes on iOS, a VIEW intent filter on Android', () => {
  const app = resolve({ urlSchemes: ['hello', 'hello-dev'] });

  assert.deepEqual(plist(app).CFBundleURLTypes, [
    { CFBundleURLName: 'com.example.hello', CFBundleURLSchemes: ['hello', 'hello-dev'] },
  ]);

  const manifest = androidManifest(app, []);
  const filter = manifest.match(/<intent-filter>[\s\S]*?<\/intent-filter>/)?.[0] ?? '';

  assert.match(filter, /<action android:name="android\.intent\.action\.VIEW" \/>/);
  assert.match(filter, /<category android:name="android\.intent\.category\.BROWSABLE" \/>/);
  assert.match(filter, /<data android:scheme="hello" \/>/);
  assert.match(filter, /<data android:scheme="hello-dev" \/>/);
});

test('linkDomains open the app from https links: universal links on iOS, verified app links on Android', () => {
  const app = resolve({
    linkDomains: ['example.com', 'www.example.com'],
    ios: {
      bundleIdentifier: 'com.example.hello',
      associatedDomains: ['webcredentials:example.com'],
    },
  });

  assert.deepEqual(spec(app).entitlements?.properties['com.apple.developer.associated-domains'], [
    'webcredentials:example.com',
    'applinks:example.com',
    'applinks:www.example.com',
  ]);

  const filter =
    androidManifest(app, []).match(
      /<intent-filter android:autoVerify="true">[\s\S]*?<\/intent-filter>/,
    )?.[0] ?? '';

  assert.match(filter, /<action android:name="android\.intent\.action\.VIEW" \/>/);
  assert.match(filter, /<category android:name="android\.intent\.category\.BROWSABLE" \/>/);
  assert.match(filter, /<data android:scheme="https" android:host="example\.com" \/>/);
  assert.match(filter, /<data android:scheme="https" android:host="www\.example\.com" \/>/);
});

test('the framework’s native projects declare no URL scheme; kuito.config.ts owns it', () => {
  const project = readFileSync(join(ROOT, 'native/ios/project.yml'), 'utf8');
  const manifest = readFileSync(
    join(ROOT, 'native/android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );

  assert.doesNotMatch(project, /CFBundleURLTypes/);
  assert.doesNotMatch(manifest, /android:scheme="kuito"/);
  assert.match(manifest, /android:theme="@style\/AppTheme"/, 'the theme the CLI generates');
});

test('iOS-only settings: tablets, full screen, deployment target, associated domains and background modes', () => {
  const app = resolve(
    ios({
      supportsTablet: false,
      requiresFullScreen: true,
      deploymentTarget: '17.0',
      associatedDomains: ['applinks:example.com'],
      backgroundModes: ['audio', 'remote-notification'],
    }),
  );
  const target = spec(app);

  assert.equal(target.settings.base.TARGETED_DEVICE_FAMILY, '1');
  assert.equal(target.info.properties.UIRequiresFullScreen, true);
  assert.deepEqual(target.info.properties.UIBackgroundModes, ['audio', 'remote-notification']);
  assert.equal(target.deploymentTarget, '17.0');
  assert.equal(target.settings.base.IPHONEOS_DEPLOYMENT_TARGET, '17.0');

  assert.deepEqual(target.entitlements, {
    path: 'KuitoIOS.entitlements',
    properties: { 'com.apple.developer.associated-domains': ['applinks:example.com'] },
  });

  const plain = spec(resolve({}));

  assert.equal(plain.entitlements, undefined, 'no entitlements file without entitlements');
  assert.equal(plain.settings.base.TARGETED_DEVICE_FAMILY, undefined, 'the framework’s 1,2');
});

test('ios.pushEnvironment is the aps-environment entitlement remote push needs', () => {
  assert.deepEqual(spec(resolve(ios({ pushEnvironment: 'development' }))).entitlements, {
    path: 'KuitoIOS.entitlements',
    properties: { 'aps-environment': 'development' },
  });


  assert.equal(
    spec(resolve(ios({ pushEnvironment: 'production' }))).entitlements?.properties[
      'aps-environment'
    ],
    'production',
  );
});

test('Android-only settings: the soft input mode and the minimum SDK', () => {
  const app = resolve(android({ softInputMode: 'pan', minSdk: 28 }));

  assert.match(activity(androidManifest(app, [])), /android:windowSoftInputMode="adjustPan"/);

  const project = { root: '/app', cache: '/app/.kuito', environment: 'production', config: app };

  assert.ok(androidProperties(project, []).includes('-Pkuito.minSdk=28'));

  assert.doesNotMatch(
    androidManifest(resolve({}), []),
    /windowSoftInputMode/,
    'the shell’s adjustResize',
  );
});

test('raw Info.plist, entitlement, manifest and theme entries reach the shells', () => {
  const app = resolve({
    ...ios({
      infoPlist: { LSApplicationQueriesSchemes: ['maps'] },
      entitlements: { 'aps-environment': 'development' },
    }),
    ...android({
      manifest: {
        application: { allowBackup: false },
        metaData: { 'com.example.key': 'abc' },
        usesFeatures: [{ name: 'android.hardware.camera', required: false }],
        queries: { packages: ['com.example.maps'] },
      },
      theme: { 'android:navigationBarColor': '#000000' },
    }),
  });

  assert.deepEqual(spec(app).info.properties.LSApplicationQueriesSchemes, ['maps']);
  assert.deepEqual(spec(app).entitlements?.properties, { 'aps-environment': 'development' });

  const manifest = androidManifest(app, []);

  assert.match(application(manifest), /android:allowBackup="false"/);
  assert.match(manifest, /<meta-data android:name="com\.example\.key" android:value="abc" \/>/);

  assert.match(
    manifest,
    /<uses-feature android:name="android\.hardware\.camera" android:required="false" \/>/,
  );

  assert.match(
    manifest,
    /<queries>\s*<package android:name="com\.example\.maps" \/>\s*<\/queries>/,
  );

  assert.match(
    androidThemes(app, [])['values/themes.xml'],
    /<item name="android:navigationBarColor">#000000<\/item>/,
  );
});

test('a raw entry may not set what a typed setting, a module or the shell sets; the error names both', () => {
  const camera = moduleAt('/app/modules/Camera', {
    name: 'Camera',
    ios: { class: 'CameraModule', infoPlist: { NSCameraUsageDescription: 'Scan codes' } },
  });

  const cases: [Record<string, unknown>, RegExp, (readonly NativeModuleSource[])?][] = [
    [
      { orientation: 'portrait', ...ios({ infoPlist: { UISupportedInterfaceOrientations: [] } }) },
      /Info\.plist key UISupportedInterfaceOrientations is set by both kuito\.config\.ts: orientation and kuito\.config\.ts: ios\.infoPlist/,
    ],
    [
      ios({ infoPlist: { CFBundleDisplayName: 'Other' } }),
      /CFBundleDisplayName is set by both kuito\.config\.ts: name and kuito\.config\.ts: ios\.infoPlist/,
    ],
    [
      ios({ infoPlist: { NSCameraUsageDescription: 'Other' } }),
      /NSCameraUsageDescription is set by both \/app\/modules\/Camera\/Camera\.ts and kuito\.config\.ts: ios\.infoPlist/,
      [camera],
    ],
    [
      ios({ infoPlist: { UIApplicationSceneManifest: {} } }),
      /UIApplicationSceneManifest is set by both the Kuito shell/,
    ],
    [
      {
        orientation: 'landscape',
        ...android({ manifest: { activity: { screenOrientation: 'user' } } }),
      },
      /<activity> attribute android:screenOrientation is set by both kuito\.config\.ts: orientation and kuito\.config\.ts: android\.manifest/,
    ],
    [
      android({ manifest: { activity: { launchMode: 'standard' } } }),
      /<activity> attribute android:launchMode is set by both the Kuito shell/,
    ],
    [
      {
        backgroundColor: '#000000',
        ...android({ theme: { 'android:windowBackground': '#FFFFFF' } }),
      },
      /AppTheme item android:windowBackground is set by both kuito\.config\.ts: backgroundColor and kuito\.config\.ts: android\.theme/,
    ],
  ];

  for (const [extra, message, modules = []] of cases) {
    const app = resolve(extra);

    assert.throws(() => {
      iosProjectSpec(app, '/fw', modules, '/hermes');
      androidManifest(app, modules);
      androidThemes(app, modules);
    }, message);
  }
});

test('Android builds write the generated theme where kuito.settingsRes points', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kuito-settings-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  const config = resolve({ colorScheme: 'dark' });
  const project = { root, cache: join(root, '.kuito'), environment: 'production', config };
  const runner = { run: async () => ({ stdout: '', stderr: '' }) };

  await buildAndroid(runner, { project, modules: [] }).catch(() => {});

  const settings = join(project.cache, 'android/settings');

  for (const [file, contents] of Object.entries(androidThemes(config, []))) {
    assert.ok(existsSync(join(settings, file)), file);
    assert.equal(readFileSync(join(settings, file), 'utf8'), contents);
  }

  assert.ok(androidProperties(project, []).includes(`-Pkuito.settingsRes=${settings}`));
});

test('the shells read every setting the CLI writes for them to apply', () => {
  const swift = readFileSync(join(ROOT, 'native/ios/App/KuitoAppSettings.swift'), 'utf8');
  const kotlin = readFileSync(
    join(ROOT, 'native/android/app/src/main/java/dev/kuito/runtime/KuitoAppSettings.kt'),
    'utf8',
  );

  for (const key of ['KuitoBackgroundColor', 'UIStatusBarStyle', 'UIStatusBarHidden'])
    assert.ok(swift.includes(`"${key}"`), key);

  for (const key of ['dev.kuito.colorScheme', 'dev.kuito.backgroundColor'])
    assert.ok(kotlin.includes(`"${key}"`), key);
});
