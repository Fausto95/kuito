import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePng, encodePng, type Image } from '../src/cli/png.ts';
import {
  androidSplashScreen,
  iosSplashScreen,
  writeSplashScreen,
} from '../src/cli/splash-screens.ts';
import { resolveConfig, type AppConfig } from '../src/cli/kuito-config.ts';

const FILE = '/app/kuito.config.ts';

const base = {
  name: 'Splash',
  ios: { bundleIdentifier: 'com.example.splash' },
  android: { applicationId: 'com.example.splash' },
};

const configWith = (splash: object): AppConfig =>
  resolveConfig({ ...base, splash }, FILE, 'production');

function solid(width: number, height: number, rgba: number[]): Image {
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);

  return { width, height, data };
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const GREEN = [0, 255, 0, 255];

/** A 2:1 logo, a 5:1 brand and a dark logo, keyed by path under /app. */
const sources: Record<string, Uint8Array> = {
  'logo.png': encodePng(solid(480, 240, RED)),
  'logo-dark.png': encodePng(solid(480, 240, BLUE)),
  'brand.png': encodePng(solid(1000, 200, GREEN)),
  'holiday.png': encodePng(solid(480, 480, GREEN)),
};

const read = (source: { path: string }) => {
  const bytes = sources[source.path.replace('/app/', '')];

  assert.ok(bytes, `test file ${source.path}`);

  return bytes;
};

const full = {
  logo: './logo.png',
  logoWidth: 120,
  background: '#0B1020',
  brand: './brand.png',
  dark: { logo: './logo-dark.png', background: '#000000' },
};

type Output = { files: Record<string, Uint8Array | string> };

const png = (output: Output, file: string) => {
  const bytes = output.files[file];

  assert.ok(bytes instanceof Uint8Array, `${file} is an image`);

  return decodePng(bytes);
};

const text = (output: Output, file: string) => {
  const contents = output.files[file];

  assert.equal(typeof contents, 'string', `${file} is text`);

  return String(contents);
};

const size = (image: Image) => [image.width, image.height];

const pixel = (image: Image, x: number, y: number) => [
  ...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
];

test('without a splash, neither platform generates a launch screen', () => {
  const app = resolveConfig(base, FILE, 'production');

  assert.equal(iosSplashScreen(app, read), null);
  assert.equal(androidSplashScreen(app, read), null);
});

test('iOS launches with a storyboard: the logo centered at its width, the brand at the bottom', () => {
  const output = iosSplashScreen(configWith(full), read);

  assert.ok(output);

  const storyboard = text(output, 'Splash.storyboard');

  assert.match(storyboard, /launchScreen="YES"/);
  assert.match(storyboard, /<imageView [^>]*tag="1"[^>]*image="SplashLogo"/);
  assert.match(storyboard, /<imageView [^>]*tag="2"[^>]*image="SplashBrand"/);
  assert.match(storyboard, /<color key="backgroundColor" name="SplashBackground"\/>/);
  assert.match(storyboard, /firstAttribute="width" constant="120"/);
  assert.match(storyboard, /firstAttribute="height" constant="60"/, 'the logo keeps its 2:1 shape');
  assert.match(storyboard, /firstAttribute="width" constant="200"/, 'the brand box');
  assert.match(storyboard, /firstAttribute="height" constant="80"/);
  assert.match(storyboard, /secondAttribute="bottom" constant="60"/, '60 points from the bottom');
  assert.match(storyboard, /firstAttribute="centerY" secondItem="[^"]+" secondAttribute="centerY"/);

  // Every id the storyboard references is declared once.
  const ids = [...storyboard.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(new Set(ids).size, ids.length, 'unique ids');

  for (const [, reference] of storyboard.matchAll(/(?:firstItem|secondItem)="([^"]+)"/g))
    assert.ok(ids.includes(reference), `${reference} is declared`);
});

test('iOS splash images are an asset catalog at 2x and 3x, with dark appearances', () => {
  const output = iosSplashScreen(configWith(full), read);

  assert.ok(output);

  assert.deepEqual(
    size(png(output, 'Splash.xcassets/SplashLogo.imageset/logo@2x.png')),
    [240, 120],
  );

  assert.deepEqual(
    size(png(output, 'Splash.xcassets/SplashLogo.imageset/logo@3x.png')),
    [360, 180],
  );

  assert.deepEqual(
    pixel(png(output, 'Splash.xcassets/SplashLogo.imageset/logo-dark@3x.png'), 0, 0),
    BLUE,
  );

  const brand = png(output, 'Splash.xcassets/SplashBrand.imageset/brand@2x.png');

  assert.deepEqual(size(brand), [400, 160], 'the 200×80 brand box');
  assert.deepEqual(pixel(brand, 200, 80), GREEN);
  assert.deepEqual(pixel(brand, 200, 0), [0, 0, 0, 0], 'a 5:1 brand is letterboxed in the box');

  const logo = JSON.parse(text(output, 'Splash.xcassets/SplashLogo.imageset/Contents.json')) as {
    images: { filename: string; scale: string; appearances?: unknown[] }[];
  };

  assert.deepEqual(
    logo.images.map(({ filename, scale, appearances }) => [filename, scale, appearances ?? null]),
    [
      ['logo@2x.png', '2x', null],
      ['logo@3x.png', '3x', null],
      ['logo-dark@2x.png', '2x', [{ appearance: 'luminosity', value: 'dark' }]],
      ['logo-dark@3x.png', '3x', [{ appearance: 'luminosity', value: 'dark' }]],
    ],
  );

  const color = JSON.parse(
    text(output, 'Splash.xcassets/SplashBackground.colorset/Contents.json'),
  ) as { colors: { appearances?: unknown[]; color: { components: Record<string, string> } }[] };

  assert.deepEqual(
    color.colors.map(({ appearances, color: { components } }) => [appearances ?? null, components]),
    [
      [null, { red: '0x0B', green: '0x10', blue: '0x20', alpha: '1.000' }],
      [
        [{ appearance: 'luminosity', value: 'dark' }],
        { red: '0x00', green: '0x00', blue: '0x00', alpha: '1.000' },
      ],
    ],
  );
});

test('without a brand, iOS shows only the logo', () => {
  const output = iosSplashScreen(configWith({ logo: './logo.png' }), read);

  assert.ok(output);
  assert.doesNotMatch(text(output, 'Splash.storyboard'), /SplashBrand/);
  assert.equal(output.files['Splash.xcassets/SplashBrand.imageset/Contents.json'], undefined);
});

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

test('before Android 12, the splash is the theme’s window background: a layer list', () => {
  const output = androidSplashScreen(configWith(full), read);

  assert.ok(output);

  const layers = text(output, 'drawable/kuito_splash.xml');

  assert.match(layers, /<item android:drawable="@color\/kuito_splash_background" \/>/);

  assert.match(
    layers,
    /<item android:width="120dp" android:height="60dp" android:gravity="center" android:drawable="@drawable\/kuito_splash_logo" \/>/,
  );

  assert.match(
    layers,
    /<item android:width="200dp" android:height="80dp" android:gravity="bottom\|center_horizontal" android:bottom="60dp" android:drawable="@drawable\/kuito_splash_brand" \/>/,
  );

  const values = text(output, 'values/kuito_splash.xml');

  assert.match(values, /<color name="kuito_splash_background">#0B1020<\/color>/);

  assert.match(values, /<style name="Theme\.Kuito\.Splash" parent="@style\/AppTheme">/);

  assert.match(values, /<item name="android:windowBackground">@drawable\/kuito_splash<\/item>/);

  assert.match(
    values,
    /<bool name="kuito_splash_light_bars">false<\/bool>/,
    'light icons on a dark background',
  );

  assert.match(
    text(output, 'values-night/kuito_splash.xml'),
    /<color name="kuito_splash_background">#000000<\/color>/,
  );

  for (const [density, scale] of Object.entries(DENSITIES)) {
    assert.deepEqual(size(png(output, `drawable-${density}/kuito_splash_logo.png`)), [
      120 * scale,
      60 * scale,
    ]);

    assert.deepEqual(size(png(output, `drawable-${density}/kuito_splash_brand.png`)), [
      200 * scale,
      80 * scale,
    ]);

    assert.deepEqual(
      pixel(png(output, `drawable-night-${density}/kuito_splash_logo.png`), 0, 0),
      BLUE,
    );
  }

  assert.equal(
    output.files['drawable-night-mdpi/kuito_splash_brand.png'],
    undefined,
    'no dark brand',
  );
});

test('Android 12 and later show the logo through the SplashScreen API, as a 288dp icon', () => {
  const output = androidSplashScreen(configWith(full), read);

  assert.ok(output);

  const theme = text(output, 'values-v31/kuito_splash.xml');

  assert.match(
    theme,
    /<item name="android:windowSplashScreenBackground">@color\/kuito_splash_background<\/item>/,
  );

  assert.match(
    theme,
    /<item name="android:windowSplashScreenAnimatedIcon">@drawable\/kuito_splash_icon<\/item>/,
  );

  assert.match(
    theme,
    /<item name="android:windowSplashScreenBrandingImage">@drawable\/kuito_splash_brand<\/item>/,
  );

  const icon = png(output, 'drawable-xxxhdpi/kuito_splash_icon.png');

  assert.deepEqual(size(icon), [288 * 4, 288 * 4]);
  assert.deepEqual(pixel(icon, 576, 576), RED, 'the logo in the middle');
  assert.deepEqual(pixel(icon, 576 - 240, 576 - 120), RED, 'at its width');
  assert.deepEqual(pixel(icon, 576 - 241, 576), [0, 0, 0, 0]);
  assert.deepEqual(pixel(icon, 576, 576 - 121), [0, 0, 0, 0]);
});

test('the shell reads the splash layout from a raw resource', () => {
  const output = androidSplashScreen(configWith(full), read);

  assert.ok(output);

  assert.deepEqual(JSON.parse(text(output, 'raw/kuito_splash.json')), {
    logo: { width: 120, height: 60 },
    brand: { width: 200, height: 80, bottom: 60 },
    variants: {},
  });
});

test('variants are Android themes the app picks for its next launch; iOS has one launch screen', () => {
  const app = configWith({
    ...full,
    variants: { holiday: { logo: './holiday.png', background: '#C62828' } },
  });
  const android = androidSplashScreen(app, read);
  const ios = iosSplashScreen(app, read);

  assert.ok(android && ios);

  assert.match(
    text(android, 'values/kuito_splash.xml'),
    /<color name="kuito_splash_holiday_background">#C62828<\/color>/,
  );

  assert.match(
    text(android, 'values/kuito_splash.xml'),
    /<style name="Theme\.Kuito\.Splash\.holiday" parent="Theme\.Kuito\.Splash">/,
  );

  assert.match(
    text(android, 'values-v31/kuito_splash.xml'),
    /<item name="android:windowSplashScreenAnimatedIcon">@drawable\/kuito_splash_holiday_icon<\/item>/,
  );

  assert.match(
    text(android, 'drawable/kuito_splash_holiday.xml'),
    /@drawable\/kuito_splash_holiday_logo/,
  );

  assert.deepEqual(size(png(android, 'drawable-mdpi/kuito_splash_holiday_logo.png')), [120, 120]);

  assert.deepEqual(
    pixel(png(android, 'drawable-night-mdpi/kuito_splash_holiday_logo.png'), 60, 60),
    BLUE,
    'inherits the dark logo, fitted into its own logo’s box',
  );

  assert.deepEqual(JSON.parse(text(android, 'raw/kuito_splash.json')).variants, {
    holiday: { logo: { width: 120, height: 120 }, brand: { width: 200, height: 80, bottom: 60 } },
  });

  assert.ok(!Object.keys(ios.files).some((file) => file.includes('holiday')));
});

test('a logo too small for its width on the densest screens is an error naming the key', () => {
  assert.throws(
    () => androidSplashScreen(configWith({ ...full, logoWidth: 288 }), read),
    /kuito\.config\.ts: splash\.logo \('\.\/logo\.png'\) is 480×240: a 288-point-wide splash logo needs at least 1152 pixels across/,
  );

  assert.throws(
    () =>
      iosSplashScreen(
        configWith({ logo: './brand.png', logoWidth: 120, brand: './logo.png' }),
        read,
      ),
    /splash\.brand \('\.\/logo\.png'\) is 480×240: the brand needs at least 640×320 pixels/,
  );
});

test('Android 12 clips the logo to a 192dp circle: a logo reaching outside it is a warning', () => {
  const wide = androidSplashScreen(configWith({ ...full, logoWidth: 180 }), (source) =>
    source.path.endsWith('logo.png') || source.path.endsWith('logo-dark.png')
      ? encodePng(solid(720, 360, RED))
      : read(source),
  );

  assert.deepEqual(wide?.warnings, [
    `${FILE}: splash.logo ('./logo.png') at 180×90 reaches outside the 192dp circle Android 12 and later show of a splash icon, so its corners are cut there. Keep the logo's diagonal under 192: a logoWidth of 171 or less.`,
  ]);

  assert.deepEqual(androidSplashScreen(configWith(full), read)?.warnings, []);
});

function tempApp() {
  const root = mkdtempSync(join(tmpdir(), 'kuito-splash-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets/logo.png'), sources['logo.png']);

  return root;
}

test('splash screens are regenerated only when a source or the config changes', async () => {
  const root = tempApp();
  const file = join(root, 'kuito.config.ts');
  const app = resolveConfig({ ...base, splash: { logo: './assets/logo.png' } }, file, 'production');
  const directory = join(root, '.kuito/android/splash');
  const marker = join(directory, 'drawable/kuito_splash.xml');

  await writeSplashScreen('android', app, directory);
  writeFileSync(marker, 'kept');
  await writeSplashScreen('android', app, directory);
  assert.equal(readFileSync(marker, 'utf8'), 'kept', 'unchanged: nothing is written');

  await writeSplashScreen(
    'android',
    { ...app, splash: app.splash && { ...app.splash, background: '#000000' } },
    directory,
  );

  assert.notEqual(readFileSync(marker, 'utf8'), 'kept', 'the config changed');

  writeFileSync(marker, 'kept');
  writeFileSync(join(root, 'assets/logo.png'), sources['logo-dark.png']);

  await writeSplashScreen(
    'android',
    { ...app, splash: app.splash && { ...app.splash, background: '#000000' } },
    directory,
  );

  assert.notEqual(readFileSync(marker, 'utf8'), 'kept', 'the logo changed');

  await writeSplashScreen('android', resolveConfig(base, file, 'production'), directory);
  assert.ok(!existsSync(directory), 'a removed splash is removed from the shell');
});
