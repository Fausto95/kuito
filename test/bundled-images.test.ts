import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundledImages, writeImages } from '../src/cli/bundled-images.ts';
import { vectorDrawable } from '../src/cli/vector-drawable.ts';
import type { BundledAsset } from '../src/dev/assets.ts';

const cover: BundledAsset = {
  name: 'asset_images_cover',
  file: '/app/images/cover.png',
  type: 'png',
  variants: [
    { scale: 1, file: '/app/images/cover.png' },
    { scale: 2, file: '/app/images/cover@2x.png' },
  ],
  width: 40,
  height: 20,
  hash: 'h',
};

const icon: BundledAsset = {
  name: 'asset_icon',
  file: '/app/icon.svg',
  type: 'svg',
  variants: [{ scale: 1, file: '/app/icon.svg' }],
  width: 24,
  height: 24,
  hash: 'h',
};

const page: BundledAsset = { ...icon, name: 'asset_page', file: '/app/page.pdf', type: 'pdf' };

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20z"/></svg>';

const read = (source: { path: string }) =>
  Buffer.from(source.path.endsWith('.svg') ? SVG : source.path);

const text = (value: Uint8Array | string | undefined) =>
  typeof value === 'string' ? value : Buffer.from(value ?? []).toString();

test('iOS bundles each image as an image set of its scales, vectors kept as vectors', () => {
  const { files } = bundledImages('ios', [cover, icon], '/app', read);

  assert.deepEqual(Object.keys(files).sort(), [
    'Contents.json',
    'asset_icon.imageset/Contents.json',
    'asset_icon.imageset/asset_icon.svg',
    'asset_images_cover.imageset/Contents.json',
    'asset_images_cover.imageset/asset_images_cover@1x.png',
    'asset_images_cover.imageset/asset_images_cover@2x.png',
  ]);

  assert.equal(
    text(files['asset_images_cover.imageset/asset_images_cover@2x.png']),
    '/app/images/cover@2x.png',
  );

  assert.deepEqual(JSON.parse(text(files['asset_images_cover.imageset/Contents.json'])).images, [
    { idiom: 'universal', filename: 'asset_images_cover@1x.png', scale: '1x' },
    { idiom: 'universal', filename: 'asset_images_cover@2x.png', scale: '2x' },
  ]);

  // Xcode's key: an SVG or PDF drawn at each size it shows at, not scaled from 1x.
  assert.deepEqual(JSON.parse(text(files['asset_icon.imageset/Contents.json'])).properties, {
    'preserves-vector-representation': true,
  });
});

test('Android bundles rasters per density, SVG as a VectorDrawable and PDF raw', () => {
  const { files } = bundledImages('android', [cover, icon, page], '/app', read);

  assert.deepEqual(Object.keys(files).sort(), [
    'drawable-mdpi/asset_images_cover.png',
    'drawable-xhdpi/asset_images_cover.png',
    'drawable/asset_icon.xml',
    'raw/asset_page.pdf',
  ]);

  assert.match(text(files['drawable/asset_icon.xml']), /<vector /);
});

test('images are written into a shell only when they change, and removed with the last one', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-images-')));
  const directory = join(root, '.kuito/ios/Assets.xcassets');
  const svg = {
    ...icon,
    file: join(root, 'icon.svg'),
    variants: [{ scale: 1 as const, file: join(root, 'icon.svg') }],
  };

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(svg.file, SVG);

  await writeImages('ios', [svg], root, directory);

  const written = join(directory, 'asset_icon.imageset/asset_icon.svg');

  assert.equal(readFileSync(written, 'utf8'), SVG);

  writeFileSync(written, 'kept');
  await writeImages('ios', [svg], root, directory);
  assert.equal(readFileSync(written, 'utf8'), 'kept', 'unchanged images are not rewritten');

  writeFileSync(svg.file, SVG.replace('M2 2', 'M3 3'));
  await writeImages('ios', [svg], root, directory);
  assert.match(readFileSync(written, 'utf8'), /M3 3/, 'edited images are');

  await writeImages('ios', [], root, directory);
  assert.equal(existsSync(directory), false);
});

test('an SVG converts to a VectorDrawable of the same size and viewport', () => {
  const xml = vectorDrawable(
    `<?xml version="1.0"?>
<!-- an icon -->
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none">
  <title>Star</title>
  <g transform="translate(2 3) rotate(45 12 12)" stroke="#336699" stroke-width="2" stroke-linecap="round">
    <path d="M1 1L5 5" fill-rule="evenodd" style="fill: #fff; fill-opacity: .5"/>
    <circle cx="12" cy="12" r="4"/>
  </g>
  <rect x="1" y="1" width="4" height="2" fill="rgb(255, 0, 0)" opacity="0.5"/>
</svg>`,
  );

  assert.match(xml, /android:width="48dp" android:height="48dp"/);
  assert.match(xml, /android:viewportWidth="24" android:viewportHeight="24"/);

  assert.match(
    xml,
    /<group android:translateX="2" android:translateY="3">\s*<group android:rotation="45" android:pivotX="12" android:pivotY="12">/,
  );

  assert.match(
    xml,
    /<path android:pathData="M1 1L5 5" android:fillColor="#ffffff" android:fillAlpha="0.5" android:fillType="evenOdd" android:strokeColor="#336699" android:strokeWidth="2" android:strokeLineCap="round" \/>/,
  );

  assert.match(xml, /android:pathData="M8,12a4,4 0 1 0 8,0a4,4 0 1 0 -8,0z"/);

  assert.match(
    xml,
    /android:pathData="M1,1h4v2h-4z" android:fillColor="#ff0000" android:fillAlpha="0.5"/,
  );

  assert.doesNotMatch(xml, /title|Star/);
});

test('an SVG Android cannot draw is an error naming what', () => {
  assert.throws(
    () => vectorDrawable('<svg viewBox="0 0 10 10"><text>Hi</text></svg>'),
    /Android cannot draw <text>.*bundle a PNG or PDF instead/,
  );

  assert.throws(
    () => vectorDrawable('<svg viewBox="0 0 10 10"><path d="M0 0" fill="url(#g)"/></svg>'),
    /Android cannot draw a url\(#g\) paint/,
  );

  assert.throws(
    () => vectorDrawable('<svg viewBox="0 0 10 10"><g clip-path="url(#c)"/></svg>'),
    /Android cannot draw <g clip-path>/,
  );
});
