import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ROOT } from '../src/cli/config.ts';
import { encodePng, solid } from '../src/cli/png.ts';
import { assetName } from '../src/dev/assets.ts';
import { createSourceCompiler, type Diagnostic } from '../src/dev/compiler.ts';
import { imageSize } from '../src/dev/image-size.ts';
import { installKernel, type Props } from './support/kuito-host.ts';
import { hosting } from './support/host-wire.ts';

const UI = join(ROOT, 'src/ui');

const png = (width: number, height: number) => encodePng(solid(width, height, [255, 0, 0]));

/** An app in a temporary directory: file name → contents. */
function app(files: Record<string, string | Uint8Array>) {
  // Real path: module ids are, and macOS's tmpdir is a symlink.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-assets-')));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  }

  return root;
}

const compile = (root: string) =>
  createSourceCompiler({ platform: 'ios', outputDir: join(root, 'dist'), root })(
    join(root, 'app.tsx'),
  );

/** What the app's `Text id="out"` shows: the imported value, as JSON. */
async function shown(root: string) {
  const { code } = await compile(root);
  const views = new Map<string, Props>();
  const host = installKernel(
    hosting({
      createView(id: string) {
        views.set(id, {});
      },
      setProp(id: string, name: string, value: unknown) {
        const props = views.get(id);

        if (props) props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );

  runInNewContext(code, host);

  return JSON.parse(String(views.get('out')?.text));
}

const showing = (imports: string) => `import { Text } from '${UI}';
${imports}
export default function App() { return <Text id="out">{JSON.stringify(image)}</Text>; }`;

test('an imported PNG is a bundled source with its size in points', async () => {
  const root = app({
    'app.tsx': showing(`import image from './images/cover.png';`),
    'images/cover.png': png(40, 20),
    'images/cover@2x.png': png(80, 40),
  });

  assert.deepEqual(await shown(root), { asset: 'asset_images_cover', width: 40, height: 20 });

  const { assets, watched } = await compile(root);

  assert.deepEqual(
    assets.map(({ name, type, variants }) => ({
      name,
      type,
      scales: variants.map((v) => v.scale),
    })),
    [{ name: 'asset_images_cover', type: 'png', scales: [1, 2] }],
  );

  assert.ok(watched.includes(join(root, 'images/cover@2x.png')), 'each scale is watched');
});

test('an image only at @2x and @3x is still imported by its plain name', async () => {
  const root = app({
    'app.tsx': showing(`import image from './logo.png';`),
    'logo@2x.png': png(64, 32),
    'logo@3x.png': png(96, 48),
  });

  assert.deepEqual(await shown(root), { asset: 'asset_logo', width: 32, height: 16 });
});

test('SVG and PDF images take their size from the file, in points', async () => {
  const root = app({
    'app.tsx': showing(`import icon from './icon.svg';
import page from './page.pdf';
const image = [icon, page];`),
    'icon.svg':
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18"><path d="M0 0h24v18z"/></svg>',
    'page.pdf': '%PDF-1.4\n1 0 obj << /Type /Page /MediaBox [0 0 120 60] >> endobj\n%%EOF',
  });

  assert.deepEqual(await shown(root), [
    { asset: 'asset_icon', width: 24, height: 18 },
    { asset: 'asset_page', width: 120, height: 60 },
  ]);

  assert.deepEqual(
    (await compile(root)).assets.map(({ type }) => type),
    ['svg', 'pdf'],
  );
});

test('a renamed image is a compile error at its import', async () => {
  const root = app({
    'app.tsx': showing(`\nimport image from './cover.png';`),
    'cover-old.png': png(4, 4),
  });

  const error: unknown = await compile(root).catch((caught: unknown) => caught);
  const diagnostics: Diagnostic[] = Reflect.get(Object(error), 'diagnostics') ?? [];

  assert.ok(diagnostics.length, String(error));

  assert.deepEqual(
    diagnostics.map(({ file, line }) => ({ file, line })),
    [{ file: join(root, 'app.tsx'), line: 3 }],
  );

  assert.match(diagnostics[0].message, /\.\/cover\.png/);
});

test('two images that would share a name are a compile error', async () => {
  const root = app({
    'app.tsx': showing(`import a from './a-b.png';
import b from './a_b.png';
const image = [a, b];`),
    'a-b.png': png(2, 2),
    'a_b.png': png(2, 2),
  });

  await assert.rejects(compile(root), /a[-_]b\.png and a[-_]b\.png are both bundled as asset_a_b/);
});

test('asset names are Android resource names, read back to their path', () => {
  assert.equal(assetName('/app', '/app/Images/Hero Shot.PNG'), 'asset_images_hero_shot');
  assert.equal(assetName('/app/src', '/app/assets/a.png'), 'asset_up_assets_a');
});

test('image headers give their size', () => {
  assert.deepEqual(imageSize('png', png(3, 7)), { width: 3, height: 7 });

  // SOI, an APP0 segment, then SOF0 with height 5 and width 9.
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x05, 0x00,
    0x09, 0x03,
  ]);

  assert.deepEqual(imageSize('jpeg', jpeg), { width: 9, height: 5 });

  assert.deepEqual(
    imageSize('svg', Buffer.from('<svg width="48px" height="32" viewBox="0 0 24 16"></svg>')),
    { width: 48, height: 32 },
  );

  assert.throws(() => imageSize('svg', Buffer.from('<svg width="100%"></svg>')), /viewBox/);
});

test('an SVG imported with ?drawing is its shapes, and bundles no image', async () => {
  const root = app({
    'app.tsx': showing(`import image from './icon.svg?drawing';`),
    'icon.svg':
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18"><path d="M0 0h24v18z" fill="red"/></svg>',
  });
  const drawing = await shown(root);

  assert.deepEqual(drawing.viewBox, [0, 0, 24, 18]);

  assert.deepEqual(
    drawing.shapes.map(({ d, fill }: { d: string; fill: string }) => ({ d, fill })),
    [{ d: 'M0 0h24v18z', fill: '#ff0000ff' }],
  );

  const { assets, watched } = await compile(root);

  assert.deepEqual(assets, [], 'the shell holds no image of it');
  assert.ok(watched.includes(join(root, 'icon.svg')), 'it is watched');
});

test('an SVG a Drawing cannot draw is a compile error naming the file and the element', async () => {
  const root = app({
    'app.tsx': showing(`import image from './label.svg?drawing';`),
    'label.svg':
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text>Hi</text></svg>',
  });

  await assert.rejects(
    compile(root),
    /label\.svg: a Drawing cannot draw <text>: simplify the SVG, or bundle it as an image \(docs\/drawing\.md\)/,
  );
});
