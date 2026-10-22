import { onTestFinished, test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundledFonts, fontFace, writeFonts } from '../src/cli/fonts.ts';
import { resolveConfig, type AppConfig } from '../src/cli/kuito-config.ts';
import { font } from './support/sfnt.ts';

// Bundled fonts (docs/fonts.md): each file's family, weight and style come
// from its own name and OS/2 tables unless the config says otherwise, and
// every platform gets the same files and one manifest of their faces.

const FILE = '/app/kuito.config.ts';
const base = {
  name: 'Hello',
  ios: { bundleIdentifier: 'com.example.hello' },
  android: { applicationId: 'com.example.hello' },
};

const configWith = (fonts: unknown, environments?: unknown, environment = 'production') =>
  resolveConfig({ ...base, fonts, ...(environments ? { environments } : {}) }, FILE, environment);

test('a font’s family, weight and style come from its name and OS/2 tables', () => {
  assert.deepEqual(fontFace(font({ family: 'Lato' })), {
    family: 'Lato',
    weight: 400,
    style: 'normal',
  });

  assert.deepEqual(fontFace(font({ family: 'Lato Bold', weight: 700, italic: true })), {
    family: 'Lato Bold',
    weight: 700,
    style: 'italic',
  });

  // The typographic family groups weights that the legacy family splits.
  assert.deepEqual(
    fontFace(font({ family: 'Lato Light', typographic: 'Lato', weight: 300 }, 0x4f54544f)),
    { family: 'Lato', weight: 300, style: 'normal' },
  );
});

test('a file that is not a single TrueType or OpenType font is an error', () => {
  assert.throws(() => fontFace(new Uint8Array([1, 2, 3])), /not a TrueType or OpenType font/);

  assert.throws(
    () => fontFace(new Uint8Array(Buffer.from('ttcf\0\0\0\0', 'latin1'))),
    /a font collection \(\.ttc\); bundle its fonts one by one/,
  );

  assert.throws(
    () => fontFace(new Uint8Array(Buffer.from('wOFF\0\0\0\0', 'latin1'))),
    /not a TrueType or OpenType font/,
  );
});

test('fonts are .ttf or .otf paths relative to kuito.config.ts, or objects that name their face', () => {
  assert.deepEqual(resolveConfig(base, FILE, 'production').fonts, []);

  assert.deepEqual(
    configWith([
      './assets/fonts/Lato-Regular.ttf',
      { file: 'assets/fonts/Lato-Heavy.otf', weight: 'bold', style: 'italic', family: 'Lato' },
    ]).fonts,
    [
      {
        path: '/app/assets/fonts/Lato-Regular.ttf',
        origin: `${FILE}: fonts[0] ('./assets/fonts/Lato-Regular.ttf')`,
        family: null,
        weight: null,
        style: null,
      },
      {
        path: '/app/assets/fonts/Lato-Heavy.otf',
        origin: `${FILE}: fonts[1] ('assets/fonts/Lato-Heavy.otf')`,
        family: 'Lato',
        weight: 700,
        style: 'italic',
      },
    ],
  );

  const invalid: [unknown, RegExp][] = [
    ['./Lato.ttf', /kuito\.config\.ts: fonts must be an array of \.ttf or \.otf files/],
    [['./Lato.woff2'], /kuito\.config\.ts: fonts\[0\] must be a \.ttf or \.otf file/],
    [[{ weight: 400 }], /kuito\.config\.ts: fonts\[0\]\.file must be a \.ttf or \.otf file/],
    [
      [{ file: './Lato.ttf', weight: 450 }],
      /fonts\[0\]\.weight must be normal, bold or 100 to 900 in hundreds/,
    ],
    [[{ file: './Lato.ttf', style: 'oblique' }], /fonts\[0\]\.style must be normal or italic/],
    [[{ file: './Lato.ttf', family: '' }], /fonts\[0\]\.family must be a non-empty string/],
    [
      [{ file: './Lato.ttf', size: 12 }],
      /fonts\[0\]\.size is not a font key; use file, family, weight and style/,
    ],
    [
      ['./a/Lato.ttf', './b/Lato.ttf'],
      /fonts\[1\] \('\.\/b\/Lato\.ttf'\) has the same file name as fonts\[0\]; rename one/,
    ],
  ];

  for (const [fonts, message] of invalid) assert.throws(() => configWith(fonts), message);
});

test('an environment replaces the whole font list, and every environment’s is checked', () => {
  const environments = { staging: { fonts: ['./Staging.ttf'] } };

  assert.deepEqual(
    configWith(['./Lato.ttf'], environments, 'staging').fonts.map(({ path }) => path),
    ['/app/Staging.ttf'],
  );

  assert.deepEqual(
    configWith(['./Lato.ttf'], environments).fonts.map(({ path }) => path),
    ['/app/Lato.ttf'],
  );

  assert.throws(
    () => configWith([], { staging: { fonts: ['./x.png'] } }),
    /kuito\.config\.ts: environments\.staging\.fonts\[0\] must be a \.ttf or \.otf file/,
  );
});

function appWith(fonts: unknown): AppConfig {
  return configWith(fonts);
}

test('bundled fonts are the files and a manifest of their faces, the config overriding the file', () => {
  const files: Record<string, Uint8Array> = {
    '/app/Lato-Regular.ttf': font({ family: 'Lato' }),
    '/app/Lato-Black.ttf': font({ family: 'Lato Black', weight: 900 }),
  };

  const output = bundledFonts(
    appWith(['./Lato-Regular.ttf', { file: './Lato-Black.ttf', family: 'Lato' }]),
    (source) => files[source.path],
  );

  assert.ok(output);

  assert.deepEqual(Object.keys(output.files).sort(), [
    'Lato-Black.ttf',
    'Lato-Regular.ttf',
    'fonts.json',
  ]);

  assert.equal(output.files['Lato-Regular.ttf'], files['/app/Lato-Regular.ttf']);

  assert.deepEqual(JSON.parse(String(output.files['fonts.json'])), [
    { family: 'Lato', weight: 400, style: 'normal', file: 'Lato-Regular.ttf' },
    { family: 'Lato', weight: 900, style: 'normal', file: 'Lato-Black.ttf' },
  ]);

  assert.equal(
    bundledFonts(appWith([]), () => new Uint8Array()),
    null,
  );
});

test('two files of one face, or a file that is not a font, fail naming their keys', () => {
  const read = (bytes: Record<string, Uint8Array>) => (source: { path: string }) =>
    bytes[source.path];

  assert.throws(
    () =>
      bundledFonts(
        appWith(['./A.ttf', './B.ttf']),
        read({ '/app/A.ttf': font({ family: 'Lato' }), '/app/B.ttf': font({ family: 'Lato' }) }),
      ),
    /fonts\[1\] \('\.\/B\.ttf'\) is Lato 400 normal, like fonts\[0\] \('\.\/A\.ttf'\)/,
  );

  assert.throws(
    () => bundledFonts(appWith(['./A.ttf']), read({ '/app/A.ttf': new Uint8Array(8) })),
    /kuito\.config\.ts: fonts\[0\] \('\.\/A\.ttf'\) is not a TrueType or OpenType font/,
  );
});

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'kuito-fonts-'));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

test('a build writes the fonts into the shell and removes them when the config has none', async () => {
  const dir = tempDir();
  const source = join(dir, 'Lato.ttf');
  const out = join(dir, 'shell/fonts');

  writeFileSync(source, font({ family: 'Lato' }));

  const app = resolveConfig(
    { ...base, fonts: ['./Lato.ttf'] },
    join(dir, 'kuito.config.ts'),
    'production',
  );

  await writeFonts(app, out);
  assert.deepEqual(readdirSync(out).sort(), ['Lato.ttf', 'fonts.json']);

  assert.deepEqual(JSON.parse(readFileSync(join(out, 'fonts.json'), 'utf8')), [
    { family: 'Lato', weight: 400, style: 'normal', file: 'Lato.ttf' },
  ]);

  await writeFonts({ ...app, fonts: [] }, out);
  assert.equal(existsSync(out), false);

  await assert.rejects(
    writeFonts(
      resolveConfig(
        { ...base, fonts: ['./Missing.ttf'] },
        join(dir, 'kuito.config.ts'),
        'production',
      ),
      out,
    ),
    /fonts\[0\] \('\.\/Missing\.ttf'\) does not exist/,
  );
});
