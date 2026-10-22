import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { androidAppIcon, iosAppIcon, writeAppIcon } from '../src/cli/app-icons.ts';
import { decodePng, encodePng, type Image } from '../src/cli/png.ts';
import { resolveConfig, type AppConfig } from '../src/cli/kuito-config.ts';

const FILE = '/app/kuito.config.ts';

const base = {
  name: 'Icons',
  ios: { bundleIdentifier: 'com.example.icons' },
  android: { applicationId: 'com.example.icons' },
};

const configWith = (extra: object): AppConfig =>
  resolveConfig({ ...base, ...extra }, FILE, 'production');

function solid(width: number, height: number, rgba: number[]): Image {
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);

  return { width, height, data };
}

/** A square icon of one color, with a differently colored top-left pixel. */
function icon(size: number, rgba: number[], corner = rgba) {
  const image = solid(size, size, rgba);

  image.data.set(corner, 0);

  return encodePng(image);
}

const pixel = (image: Image, x: number, y: number) => [
  ...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
];

/** Reads sources from `files`, keyed by path under /app. */
const reader = (files: Record<string, Uint8Array>) => (source: { path: string }) => {
  const bytes = files[source.path.replace('/app/', '')];

  assert.ok(bytes, `test file ${source.path}`);

  return bytes;
};

const png = (output: { files: Record<string, Uint8Array | string> }, file: string) => {
  const bytes = output.files[file];

  assert.ok(bytes instanceof Uint8Array, `${file} is an image`);

  return decodePng(bytes);
};

const json = (output: { files: Record<string, Uint8Array | string> }, file: string): unknown => {
  const text = output.files[file];

  assert.equal(typeof text, 'string', `${file} is text`);

  return JSON.parse(String(text));
};

test('an iOS app icon is one 1024×1024 image in an AppIcon asset catalog', () => {
  const output = iosAppIcon(
    configWith({ icon: './icon.png' }),
    reader({ 'icon.png': icon(2048, [20, 40, 60, 255]) }),
  );

  assert.ok(output);

  assert.deepEqual(Object.keys(output.files).sort(), [
    'AppIcon.appiconset/Contents.json',
    'AppIcon.appiconset/icon.png',
    'Contents.json',
  ]);

  assert.deepEqual(json(output, 'AppIcon.appiconset/Contents.json'), {
    images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'kuito', version: 1 },
  });

  const image = png(output, 'AppIcon.appiconset/icon.png');

  assert.equal(image.width, 1024);
  assert.deepEqual(pixel(image, 512, 512), [20, 40, 60, 255]);
  assert.deepEqual(output.warnings, []);
});

test('iOS dark and tinted icons are appearances of the same asset; ios.icon.light replaces icon', () => {
  const output = iosAppIcon(
    configWith({
      icon: './icon.png',
      ios: {
        ...base.ios,
        icon: { light: './light.png', dark: './dark.png', tinted: './tinted.png' },
      },
    }),
    reader({
      'light.png': icon(1024, [255, 255, 255, 255]),
      'dark.png': icon(1024, [0, 0, 0, 0]),
      'tinted.png': icon(1024, [90, 90, 90, 255]),
    }),
  );

  assert.ok(output);

  assert.deepEqual(json(output, 'AppIcon.appiconset/Contents.json'), {
    images: [
      { filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
      {
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
        filename: 'icon-dark.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
      {
        appearances: [{ appearance: 'luminosity', value: 'tinted' }],
        filename: 'icon-tinted.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
    ],
    info: { author: 'kuito', version: 1 },
  });

  assert.deepEqual(pixel(png(output, 'AppIcon.appiconset/icon.png'), 0, 0), [255, 255, 255, 255]);

  assert.deepEqual(
    pixel(png(output, 'AppIcon.appiconset/icon-dark.png'), 0, 0),
    [0, 0, 0, 0],
    'dark icons may be transparent',
  );
});

test('a transparent iOS icon is flattened onto white, with a warning naming the key', () => {
  const output = iosAppIcon(
    configWith({ icon: './icon.png' }),
    reader({ 'icon.png': icon(1024, [0, 0, 255, 255], [0, 0, 0, 0]) }),
  );

  assert.ok(output);
  assert.deepEqual(pixel(png(output, 'AppIcon.appiconset/icon.png'), 0, 0), [255, 255, 255, 255]);

  assert.deepEqual(output.warnings, [
    `${FILE}: icon ('./icon.png') has transparency, which iOS app icons cannot have: it was flattened onto white. Export it without an alpha channel to choose the background.`,
  ]);
});

test('icon sources must be square PNGs of at least 1024×1024', () => {
  const config = configWith({ icon: './icon.png' });
  const invalid: [Uint8Array, RegExp][] = [
    [new TextEncoder().encode('not an image'), /icon \('\.\/icon\.png'\) is not a PNG/],
    [
      icon(512, [0, 0, 0, 255]),
      /icon \('\.\/icon\.png'\) is 512×512: app icons need a square PNG of at least 1024×1024/,
    ],
    [encodePng(solid(1024, 1100, [0, 0, 0, 255])), /is 1024×1100: app icons need a square PNG/],
  ];

  for (const [bytes, message] of invalid) {
    assert.throws(() => iosAppIcon(config, reader({ 'icon.png': bytes })), message);
    assert.throws(() => androidAppIcon(config, reader({ 'icon.png': bytes })), message);
  }
});

test('without an icon, neither platform generates one', () => {
  const none = configWith({});
  const read = reader({});

  assert.equal(iosAppIcon(none, read), null);
  assert.equal(androidAppIcon(none, read), null);
});

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

test('an Android icon is an adaptive icon over its corner color, with legacy mipmaps', () => {
  const output = androidAppIcon(
    configWith({ icon: './icon.png' }),
    reader({ 'icon.png': icon(1024, [200, 10, 10, 255], [0x1e, 0x88, 0xe5, 255]) }),
  );

  assert.ok(output);

  const files = Object.keys(output.files).sort();

  for (const [density, scale] of Object.entries(DENSITIES)) {
    const legacy = png(output, `mipmap-${density}/ic_launcher.png`);
    const foreground = png(output, `mipmap-${density}/ic_launcher_foreground.png`);

    assert.equal(legacy.width, 48 * scale, `${density} legacy icon`);
    assert.equal(foreground.width, 108 * scale, `${density} foreground layer`);
  }

  assert.ok(!files.some((file) => file.includes('monochrome')));

  assert.equal(
    output.files['mipmap-anydpi-v26/ic_launcher.xml'],
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`,
  );

  assert.match(
    String(output.files['values/ic_launcher_background.xml']),
    /<color name="ic_launcher_background">#1E88E5<\/color>/,
  );

  // The whole icon fills the 72dp a launcher's mask shows; the rest is the background.
  const foreground = png(output, 'mipmap-xxxhdpi/ic_launcher_foreground.png');

  assert.deepEqual(pixel(foreground, 216, 216), [200, 10, 10, 255]);
  assert.deepEqual(pixel(foreground, 10, 10), [0, 0, 0, 0]);

  assert.deepEqual(
    pixel(png(output, 'mipmap-xxxhdpi/ic_launcher.png'), 96, 96),
    [200, 10, 10, 255],
  );
});

test('android.adaptiveIcon sets the layers: foreground, background color or image, monochrome', () => {
  const colored = androidAppIcon(
    configWith({
      android: {
        ...base.android,
        adaptiveIcon: { foreground: './fg.png', background: '#102030', monochrome: './mono.png' },
      },
    }),
    reader({ 'fg.png': icon(1024, [0, 0, 0, 0]), 'mono.png': icon(1024, [0, 0, 0, 255]) }),
  );

  assert.ok(colored);

  assert.match(
    String(colored.files['mipmap-anydpi-v26/ic_launcher.xml']),
    /<monochrome android:drawable="@mipmap\/ic_launcher_monochrome" \/>/,
  );

  assert.equal(png(colored, 'mipmap-hdpi/ic_launcher_monochrome.png').width, 162);
  assert.match(String(colored.files['values/ic_launcher_background.xml']), /#102030/);

  assert.deepEqual(
    pixel(png(colored, 'mipmap-mdpi/ic_launcher.png'), 24, 24),
    [0x10, 0x20, 0x30, 255],
    'the legacy icon composes the layers',
  );

  const imaged = androidAppIcon(
    configWith({
      icon: './icon.png',
      android: { ...base.android, adaptiveIcon: { background: './bg.png' } },
    }),
    reader({ 'icon.png': icon(1024, [9, 9, 9, 255]), 'bg.png': icon(1024, [1, 2, 3, 255]) }),
  );

  assert.ok(imaged);

  assert.match(
    String(imaged.files['mipmap-anydpi-v26/ic_launcher.xml']),
    /<background android:drawable="@mipmap\/ic_launcher_background" \/>/,
  );

  assert.equal(imaged.files['values/ic_launcher_background.xml'], undefined);
  assert.equal(png(imaged, 'mipmap-xxhdpi/ic_launcher_background.png').width, 324);
});

function project() {
  const root = mkdtempSync(join(tmpdir(), 'kuito-icons-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'assets'));

  const file = join(root, 'kuito.config.ts');
  const config = (extra: object = {}) =>
    resolveConfig({ ...base, icon: './assets/icon.png', ...extra }, file, 'production');

  return { root, config, out: join(root, '.kuito/ios/AppIcon.xcassets') };
}

test('icons are regenerated only when a source or the config changes', async () => {
  const { root, config, out } = project();
  const generated = join(out, 'AppIcon.appiconset/icon.png');

  writeFileSync(join(root, 'assets/icon.png'), icon(1024, [1, 1, 1, 255], [0, 0, 0, 0]));

  const warnings = await writeAppIcon('ios', config(), out);

  assert.equal(warnings.length, 1);
  assert.ok(existsSync(generated));

  // A marker in the output survives a build with the same inputs.
  writeFileSync(generated, 'kept');
  assert.deepEqual(await writeAppIcon('ios', config(), out), warnings, 'warnings are replayed');
  assert.equal(readFileSync(generated, 'utf8'), 'kept');

  writeFileSync(join(root, 'assets/dark.png'), icon(1024, [0, 0, 0, 255]));

  await writeAppIcon(
    'ios',
    config({ ios: { ...base.ios, icon: { dark: './assets/dark.png' } } }),
    out,
  );

  assert.notEqual(readFileSync(generated, 'utf8'), 'kept', 'a config change regenerates');
  assert.ok(existsSync(join(out, 'AppIcon.appiconset/icon-dark.png')));

  writeFileSync(join(root, 'assets/icon.png'), icon(1024, [2, 2, 2, 255]));
  assert.deepEqual(await writeAppIcon('ios', config(), out), [], 'a source change regenerates');
  assert.ok(!existsSync(join(out, 'AppIcon.appiconset/icon-dark.png')), 'stale files go');
  assert.deepEqual(pixel(decodePng(readFileSync(generated)), 0, 0), [2, 2, 2, 255]);
});

test('a missing source names the key, and an app without an icon has no generated icon', async () => {
  const { config, out } = project();

  await assert.rejects(
    writeAppIcon('android', config(), out),
    /kuito\.config\.ts: icon \('\.\/assets\/icon\.png'\) does not exist/,
  );

  mkdirSync(out, { recursive: true });
  await writeAppIcon('android', resolveConfig(base, FILE, 'production'), out);
  assert.ok(!existsSync(out));
});
