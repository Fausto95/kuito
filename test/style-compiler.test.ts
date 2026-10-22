import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { compileNativeCSS, KuitoStyleError } from '../src/style/compiler.ts';

test('compiles static classes and tokens to native scalar property maps', () => {
  const c = compileNativeCSS(
    '@tokens { --accent: #1768db; --space: 12dp; } .card { padding: var(--space); background-color: var(--accent); border-radius: 14px; } .label { font-size: 17; opacity: 0.9; }',
  );

  assert.equal(c.tokens.accent, '#1768db');

  assert.deepEqual(
    { ...c.classes.card },
    {
      paddingTop: 12,
      paddingRight: 12,
      paddingBottom: 12,
      paddingLeft: 12,
      backgroundColor: '#1768db',
      borderRadius: 14,
    },
  );

  assert.equal(c.classes.label.fontSize, 17);
});

test('rejects selectors and values outside native subset', () => {
  assert.throws(() => compileNativeCSS('Button:hover { opacity: 1; }'), KuitoStyleError);
  assert.throws(() => compileNativeCSS('.x { float: left; }'), /Unsupported native property/);
  assert.throws(() => compileNativeCSS('.x { position: fixed; }'), /position must be one of/);
  assert.throws(() => compileNativeCSS('.x { gap: var(--missing); }'), /Unknown token/);
  assert.throws(() => compileNativeCSS('.x { gap: auto; }'), /requires a number/);
});

/** An in-memory project: `compileNativeCSS` reads @imported files through `read`. */
function project(files: Record<string, string>) {
  const read = (file: string) => {
    if (!Object.hasOwn(files, file))
      throw Object.assign(new Error('ENOENT: ' + file), { code: 'ENOENT' });

    return files[file];
  };

  return (file: string) => compileNativeCSS(files[file], file, { read });
}

/** Plain data, comparable whatever its prototype. */
const data = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

type LocatedError = KuitoStyleError & { loc: { file: string; line: number; column: number } };

function located(file: string, line: number, message: RegExp) {
  return (error: LocatedError) => {
    assert.ok(error instanceof KuitoStyleError);
    assert.match(error.message, message);
    assert.equal(error.loc.file, file);
    assert.equal(error.loc.line, line);

    return true;
  };
}

test('a stylesheet uses the tokens of the stylesheets it @imports', () => {
  const compile = project({
    '/app/tokens.css': ':root {\n  --accent: #ff5a5f;\n  --space: 8px;\n}',
    '/app/card.css':
      '@import "./tokens.css";\n.card { color: var(--accent); padding: var(--space) 0; }',
    '/app/tab.css': "@import url('tokens.css');\n.tab { background: var(--accent); }",
  });
  const card = compile('/app/card.css');

  assert.deepEqual(
    { ...card.classes.card },
    { color: '#ff5a5f', paddingTop: 8, paddingRight: 0, paddingBottom: 8, paddingLeft: 0 },
  );

  assert.deepEqual(card.files, ['/app/tokens.css']);
  assert.equal(compile('/app/tab.css').classes.tab.backgroundColor, '#ff5a5f');
});

test('imports are transitive, and a stylesheet reached twice is not a duplicate', () => {
  const compile = project({
    '/app/palette.css': ':root { --red: #ff0000; }',
    '/app/brand.css': '@import "./palette.css";\n:root { --accent: var(--red); }',
    '/app/spacing.css': '@import "./palette.css";\n:root { --space: 4px; }',
    '/app/ui/card.css':
      '@import "../brand.css";\n@import "../spacing.css";\n.card { color: var(--red); border-color: var(--accent); gap: var(--space); }',
  });
  const card = compile('/app/ui/card.css');

  assert.deepEqual(
    { ...card.classes.card },
    { color: '#ff0000', borderColor: '#ff0000', rowGap: 4, columnGap: 4 },
  );

  assert.deepEqual(card.files, ['/app/brand.css', '/app/palette.css', '/app/spacing.css']);
});

test('a token resolves where it is declared, not where it is used', () => {
  const compile = project({
    '/app/tokens.css': ':root {\n  --accent: var(--brand);\n}',
    '/app/card.css':
      '@import "./tokens.css";\n:root { --brand: red; }\n.card { color: var(--accent); }',
  });

  assert.throws(
    () => compile('/app/card.css'),
    located('/app/tokens.css', 2, /Unknown token --brand/),
  );
});

test('an imported :root font-size sets the root for rem', () => {
  const compile = project({
    '/app/tokens.css': ':root { font-size: 20px; }',
    '/app/card.css': '@import "./tokens.css";\n.card { padding: 1rem; }',
  });
  const card = compile('/app/card.css');

  assert.equal(card.rootFontSize, 20);
  assert.equal(card.classes.card.paddingTop, 20);
});

test('token errors name the file and line that caused them', () => {
  const compile = project({
    '/app/a.css': '@import "./b.css";\n.a { gap: 1px; }',
    '/app/b.css': '\n@import "./a.css";',
    '/app/one.css': ':root { --accent: red; }',
    '/app/two.css': '\n\n:root { --accent: blue; }',
    '/app/both.css': '@import "./one.css";\n@import "./two.css";',
    '/app/shadow.css': '@import "./one.css";\n:root {\n  --accent: green;\n}',
    '/app/missing.css': '\n@import "./nope.css";',
    '/app/late.css': '.x { gap: 1px; }\n@import "./one.css";',
    '/app/remote.css': '@import "https://cdn.example.com/tokens.css";',
    '/app/unknown.css': '@import "./one.css";\n\n.x {\n  color: var(--acent);\n}',
  });

  assert.throws(
    () => compile('/app/a.css'),
    located('/app/b.css', 2, /Circular @import: \/app\/a\.css -> \/app\/b\.css -> \/app\/a\.css/),
  );

  assert.throws(
    () => compile('/app/both.css'),
    located('/app/two.css', 3, /Duplicate token --accent, also declared at \/app\/one\.css:1/),
  );

  assert.throws(
    () => compile('/app/shadow.css'),
    located('/app/shadow.css', 3, /Duplicate token --accent, also declared at \/app\/one\.css:1/),
  );

  assert.throws(
    () => compile('/app/missing.css'),
    located('/app/missing.css', 2, /Cannot @import \.\/nope\.css: \/app\/nope\.css not found/),
  );

  assert.throws(
    () => compile('/app/late.css'),
    located('/app/late.css', 2, /@import must come before every rule/),
  );

  assert.throws(
    () => compile('/app/remote.css'),
    located('/app/remote.css', 1, /@import takes a relative path/),
  );

  assert.throws(
    () => compile('/app/unknown.css'),
    located('/app/unknown.css', 4, /Unknown token --acent/),
  );
});

test('strings, parentheses and comments are read as CSS reads them', () => {
  const c = compileNativeCSS(
    [
      '/* .ghost { color: red; } */',
      '.title { font-family: "Brace } Semi; Font"; /* ; } */ color: #fff; }',
      ".quote { font-family: 'It\\'s'; }",
      '.after { background: linear-gradient(to right, #000, #fff); }',
    ].join('\n'),
  );

  assert.equal(c.classes.title.fontFamily, 'Brace } Semi; Font');
  assert.equal(c.classes.title.color, '#fff');
  assert.equal(c.classes.quote.fontFamily, "It's");
  assert.deepEqual(c.classes.after.backgroundGradient, { angle: 90, colors: ['#000', '#fff'] });
  assert.equal(c.classes.ghost, undefined);
});

test('scanner errors name the line', () => {
  const at = (css: string, line: number, message: RegExp) =>
    assert.throws(() => compileNativeCSS(css, '/app/x.css'), located('/app/x.css', line, message));

  at('.a {\n  font-family: "Open;\n}', 2, /Unterminated string/);
  at('.a { color: red; }\n/* open', 2, /Unterminated comment/);
  at('.a {\n  color: red;\n', 1, /Missing } for this block/);
  at('.a {\n  .b { color: red; }\n}', 2, /Nested blocks are not supported/);
  at('.a {\n  background: linear-gradient(red, blue;\n}', 2, /Missing \) for this \(/);
  at('.a { color: red; }\n}', 2, /Unexpected }/);
});

test('every color compiles to the hex both renderers parse', () => {
  const c = compileNativeCSS(
    [
      '.a { color: rgb(255 0 0); background-color: rgba(0, 0, 255, 0.5);',
      '  border-color: hsl(120 100% 50%); shadow-color: white; }',
      '.b { color: color(srgb 1 0.5 0 / 50%);',
      '  background: linear-gradient(to right, transparent, color(srgb 0 0 0)); }',
      '.c { border: 1px solid RebeccaPurple; color: #ABC; box-shadow: 0 2px 4px rgb(0 0 0 / 25%); }',
    ].join('\n'),
  );

  assert.deepEqual(
    { ...c.classes.a },
    {
      color: '#ff0000',
      backgroundColor: '#0000ff80',
      borderColor: '#00ff00',
      shadowColor: '#ffffff',
    },
  );

  assert.equal(c.classes.b.color, '#ff800080');

  assert.deepEqual(c.classes.b.backgroundGradient, {
    angle: 90,
    colors: ['#00000000', '#000000'],
  });

  assert.equal(c.classes.c.borderColor, '#663399');
  assert.equal(c.classes.c.color, '#abc');
  assert.equal(c.classes.c.shadowColor, '#00000040');
});

test('a color the compiler cannot read is an error', () => {
  assert.throws(() => compileNativeCSS('.x { color: blurple; }'), /Unknown color "blurple"/);
  assert.throws(() => compileNativeCSS('.x { color: #12345; }'), /Invalid hex color "#12345"/);

  assert.throws(
    () => compileNativeCSS('.x { color: color(display-p3 1 0 0); }'),
    /color\(\) supports the srgb color space, got display-p3/,
  );

  assert.throws(
    () => compileNativeCSS('.x { color: color(srgb 1 0); }'),
    /color\(srgb\) takes three channels/,
  );

  assert.throws(
    () => compileNativeCSS('.x { color: rgb(300 0 0); }'),
    /rgb\(\) channels must be between 0 and 255/,
  );
});

test('values outside their range are errors', () => {
  const rejects = (css: string, message: RegExp) =>
    assert.throws(() => compileNativeCSS('.x { ' + css + ' }'), message);

  rejects('opacity: 1.2;', /opacity must be between 0 and 1/);
  rejects('opacity: -0.1;', /opacity must be between 0 and 1/);
  rejects('padding: 4px -4px;', /padding must not be negative/);
  rejects('padding-top: -1px;', /paddingTop must not be negative/);
  rejects('width: -1px;', /width must not be negative/);
  rejects('border-width: -1px;', /borderWidth must not be negative/);
  rejects('font-size: -2px;', /fontSize must not be negative/);
  rejects('border-radius: -3px;', /borderRadius must not be negative/);
  rejects('gap: -1px;', /gap must not be negative/);
  rejects('box-shadow: 0 0 -2px #000;', /box-shadow blur must not be negative/);

  const c = compileNativeCSS(
    '.x { margin: -4px; top: -2px; letter-spacing: -1px; translate-x: -3px; }',
  );

  assert.equal(c.classes.x.marginTop, -4);
  assert.equal(c.classes.x.top, -2);
});

test('border takes a width, a style and a color, once each, in any order', () => {
  const c = compileNativeCSS('.a { border: solid red 2px; } .b { border: 2px; }');

  assert.deepEqual({ ...c.classes.a }, { borderWidth: 2, borderColor: '#ff0000' });
  assert.deepEqual({ ...c.classes.b }, { borderWidth: 2 });

  const rejects = (value: string, message: RegExp) =>
    assert.throws(() => compileNativeCSS('.x { border: ' + value + '; }'), message);

  rejects('1px 2px solid', /border takes one width/);
  rejects('1px red blue', /border takes one color/);
  rejects('solid solid 1px', /border takes one style/);
  rejects('1px dashed red', /Only solid borders are supported/);
});

test('a shorthand expands to longhands, and the later declaration wins', () => {
  const c = compileNativeCSS(
    [
      '.a { padding-top: 8px; padding: 4px; }',
      '.b { padding: 4px; padding-top: 8px; }',
      '.c { padding: 1px; padding-top: 8px; padding: 2px; }',
      '.d { gap: 4px; column-gap: 8px; }',
      '.e { border: 1px solid red; border-width: 2px; }',
    ].join('\n'),
  );
  const sides = (top: number, rest: number) => ({
    paddingTop: top,
    paddingRight: rest,
    paddingBottom: rest,
    paddingLeft: rest,
  });

  assert.deepEqual({ ...c.classes.a }, sides(4, 4));
  assert.deepEqual({ ...c.classes.b }, sides(8, 4));
  assert.deepEqual({ ...c.classes.c }, sides(2, 2));
  assert.deepEqual({ ...c.classes.d }, { rowGap: 4, columnGap: 8 });
  assert.deepEqual({ ...c.classes.e }, { borderWidth: 2, borderColor: '#ff0000' });
});

test('an app has one :root font-size: a second stylesheet declaring one is an error', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-root-font-')));
  const write = (file: string, text: string) => writeFileSync(join(dir, file), text);
  const compile = createSourceCompiler({ platform: 'ios', outputDir: join(dir, 'out') });

  try {
    write('tokens.css', ':root { font-size: 18px; }');
    write('card.css', '@import "./tokens.css";\n.card { padding: 1rem; }');
    write('list.css', '@import "./tokens.css";\n.list { gap: 1rem; }');

    write(
      'app.tsx',
      "import a from './card.css';\nimport b from './list.css';\nexport default () => a.card + b.list;\n",
    );

    // Reached through two imports, one declaration is one root.
    assert.match((await compile(join(dir, 'app.tsx'))).code, /"paddingTop": 18/);

    write('other.css', '\n:root { font-size: 20px; }\n.other { gap: 1px; }');

    write(
      'app.tsx',
      "import a from './card.css';\nimport b from './other.css';\nexport default () => a.card + b.other;\n",
    );

    await assert.rejects(compile(join(dir, 'app.tsx')), (error: Error) => {
      assert.match(error.message, /Conflicting :root font-size: an app has one root font size/);
      assert.match(error.message, /tokens\.css:1/);
      assert.match(error.message, /other\.css:2/);

      return true;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an @platform block applies on its platform only', () => {
  const css = [
    '.card { padding: 4px; opacity: 1; }',
    '@platform ios {',
    '  :root { --radius: 12px; }',
    '  .card { padding: 8px; border-radius: var(--radius); }',
    '}',
    '@platform android { .card { opacity: 0.5; } .ripple { opacity: 0.2; } }',
  ].join('\n');
  const ios = compileNativeCSS(css, 'card.css', { platform: 'ios' });
  const android = compileNativeCSS(css, 'card.css', { platform: 'android' });

  assert.deepEqual(
    { ...ios.classes.card },
    {
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
      opacity: 1,
      borderRadius: 12,
    },
  );

  assert.equal(ios.tokens.radius, '12px');
  assert.deepEqual(Object.keys(ios.classes), ['card']);
  assert.equal(android.classes.card.opacity, 0.5);
  assert.equal(android.classes.card.paddingTop, 4);
  assert.equal(android.classes.ripple.opacity, 0.2);
  assert.equal(android.tokens.radius, undefined);
});

test('each rejected @platform construct is an error at its line', () => {
  const at = (line: number, message: RegExp) => located('<css>', line, message);
  const compile = (css: string) => () => compileNativeCSS(css, '<css>', { platform: 'ios' });

  assert.throws(
    compile('\n@platform web { .a { opacity: 1; } }'),
    at(2, /@platform takes ios or android/),
  );

  assert.throws(
    compile('@platform { .a { opacity: 1; } }'),
    at(1, /@platform takes ios or android/),
  );

  assert.throws(
    compile('@platform ios {\n  @platform ios { .a { opacity: 1; } }\n}'),
    at(2, /@platform inside @platform/),
  );

  assert.throws(compile('@platform ios {\n  opacity: 1;\n}'), at(2, /Expected a rule/));

  assert.throws(
    compile('@platform ios {\n  @import "./a.css";\n}'),
    at(2, /@import must come before every rule/),
  );

  assert.throws(compile('.a {\n  .b { opacity: 1; }\n}'), at(2, /Nested blocks are not supported/));

  assert.throws(
    compile('@supports (gap: 1px) { .a { opacity: 1; } }'),
    at(1, /Unsupported at-rule @supports/),
  );

  assert.throws(
    () => compileNativeCSS('@platform ios { .a { opacity: 1; } }'),
    /@platform needs the platform the bundle is for/,
  );
});

test("a platform's bundle leaves no trace of the other platform's code or styles", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'kuito-platform-')));
  const write = (file: string, text: string) => writeFileSync(join(dir, file), text);

  try {
    write('card.css', '.card { opacity: 1; }\n@platform android { .card { opacity: 0.25; } }');

    write(
      'app.tsx',
      [
        `import { platform, styles } from ${JSON.stringify(resolve('src/ui/index.ts'))};`,
        "import css from './card.css';",
        "const sheet = styles({ row: { gap: 4, '@platform android': { gap: 7 } } });",
        "const label = platform === 'android' ? 'ANDROID_LABEL' : 'IOS_LABEL';",
        "if (platform !== 'ios') console.log('ANDROID_BRANCH');",
        'export default () => <Text class={[css.card, sheet.row]}>{label}</Text>;',
      ].join('\n'),
    );

    const compile = (platform: 'ios' | 'android') =>
      createSourceCompiler({ outputDir: join(dir, platform), platform })(join(dir, 'app.tsx'));
    const ios = (await compile('ios')).code;
    const android = (await compile('android')).code;

    assert.match(ios, /IOS_LABEL/);
    assert.doesNotMatch(ios, /ANDROID|"opacity": \.25|"rowGap": ?7/);
    assert.match(android, /ANDROID_LABEL/);
    assert.match(android, /ANDROID_BRANCH/);
    assert.match(android, /"opacity": \.25/);
    assert.match(android, /"rowGap": ?7/);
    assert.doesNotMatch(android, /IOS_LABEL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a token the dark scheme redefines compiles to a marker and two manifests', () => {
  const c = compileNativeCSS(
    [
      ':root { --surface: white; --ink: #111; --line: var(--surface); }',
      '@media (prefers-color-scheme: dark) { :root { --surface: black; } }',
      '.card { background-color: var(--surface); border: 1px solid var(--line); color: var(--ink); }',
    ].join('\n'),
  );
  const { themes } = c.conditions;
  const marker = c.classes.card.backgroundColor;
  const id =
    typeof marker === 'object' && marker !== null && '__kuitoToken' in marker
      ? marker.__kuitoToken
      : null;

  assert.equal(typeof id, 'string', 'backgroundColor is a token marker');
  if (typeof id !== 'string') return;

  assert.equal(themes.light[id], '#ffffff');
  assert.equal(themes.dark[id], '#000000');
  // A token built from a themed one follows the theme too.
  assert.deepEqual(c.classes.card.borderColor, marker);
  assert.equal(c.classes.card.borderWidth, 1);
  assert.equal(c.classes.card.color, '#111', 'a token the theme leaves alone stays a constant');
  assert.equal(c.tokens.surface, 'white');
});

test('@media blocks compile to alternate prop sets for their classes', () => {
  const c = compileNativeCSS(
    [
      '.card { padding: 8px; opacity: 1; }',
      '@media (min-width: 600px) { .card { padding: 16px; } }',
      '@media (width-class: expanded) and (prefers-reduced-motion: reduce) {',
      '  .card { opacity: 0.5; }',
      '}',
      '@media (prefers-color-scheme: dark) { .card { opacity: 0.8; } .only { gap: 2px; } }',
      '@platform android { @media (max-width: 400px) { .card { opacity: 0.6; } } }',
    ].join('\n'),
    'card.css',
    { platform: 'ios' },
  );
  const sides = (n: number) => ({
    paddingTop: n,
    paddingRight: n,
    paddingBottom: n,
    paddingLeft: n,
  });

  assert.deepEqual({ ...c.classes.card }, { ...sides(8), opacity: 1 });

  assert.deepEqual(data(c.conditions.when.card), [
    { media: { minWidth: 600 }, props: sides(16) },
    { media: { widthClass: 'expanded', reduceMotion: true }, props: { opacity: 0.5 } },
    { media: { colorScheme: 'dark' }, props: { opacity: 0.8 } },
  ]);

  assert.deepEqual({ ...c.classes.only }, {}, 'a class only a condition declares has no base');

  assert.deepEqual(data(c.conditions.when.only), [
    { media: { colorScheme: 'dark' }, props: { rowGap: 2, columnGap: 2 } },
  ]);
});

test('each rejected @media construct is an error at its line', () => {
  const at = (line: number, message: RegExp) => located('<css>', line, message);
  const compile = (css: string) => () => compileNativeCSS(css, '<css>', { platform: 'ios' });
  const media = (query: string) => compile('\n@media ' + query + ' { .a { opacity: 1; } }');

  assert.throws(
    media('screen and (min-width: 1px)'),
    at(2, /@media takes features in parentheses/),
  );

  assert.throws(media('(min-width: 1px), (max-width: 9px)'), at(2, /joined by and/));
  assert.throws(media('(min-width: 1px) or (max-width: 9px)'), at(2, /joined by and/));
  assert.throws(media('not (min-width: 1px)'), at(2, /@media takes features in parentheses/));
  assert.throws(media('(hover: hover)'), at(2, /Unsupported media feature hover/));
  assert.throws(media('(min-width: wide)'), at(2, /min-width takes a length/));
  assert.throws(media('(min-width)'), at(2, /min-width takes a value/));
  assert.throws(media('(prefers-color-scheme: sepia)'), at(2, /light or dark/));
  assert.throws(media('(prefers-reduced-motion: always)'), at(2, /reduce or no-preference/));
  assert.throws(media('(width-class: huge)'), at(2, /compact, medium or expanded/));
  assert.throws(media('(min-width: 1px) and (min-width: 2px)'), at(2, /min-width twice/));

  assert.throws(
    compile('@media (min-width: 1px) {\n  @media (max-width: 9px) { .a { opacity: 1; } }\n}'),
    at(2, /@media inside @media: join the features with and/),
  );

  assert.throws(
    compile('@media (min-width: 600px) {\n  :root { --gap: 4px; }\n}'),
    at(2, /Tokens follow the color scheme alone/),
  );

  assert.throws(
    compile(
      ':root { --a: red; }\n@media (prefers-color-scheme: dark) {\n  :root { --b: blue; }\n}',
    ),
    at(3, /--b has no value outside @media: declare it in :root/),
  );

  assert.throws(
    compile('@media (min-width: 600px) {\n  .a { font-size: 20px; }\n}'),
    at(2, /font-size cannot change with a condition/),
  );
});

test('a light block redefines tokens for the light scheme, over a dark base', () => {
  const c = compileNativeCSS(
    [
      ':root { --bg: #08080b; --accent: #ff5a5f; }',
      '@media (prefers-color-scheme: light) { :root { --bg: #f6f6f8; } }',
      '.screen { background-color: var(--bg); color: var(--accent); }',
    ].join('\n'),
  );
  const marker = c.classes.screen.backgroundColor;
  const id =
    typeof marker === 'object' && marker !== null && '__kuitoToken' in marker
      ? marker.__kuitoToken
      : null;

  assert.equal(typeof id, 'string', 'backgroundColor is a token marker');
  if (typeof id !== 'string') return;

  assert.equal(c.conditions.themes.light[id], '#f6f6f8');
  assert.equal(c.conditions.themes.dark[id], '#08080b');
  assert.equal(c.classes.screen.color, '#ff5a5f');
});

test('.class[data-name=value] rules compile to variant classes of their class', () => {
  const c = compileNativeCSS(
    [
      '.card { padding: 8px; opacity: 1; }',
      '.card[data-size=large] { padding: 16px; }',
      '.card[data-size="small"] { padding: 4px; }',
      '.card[data-tone=muted] { opacity: 0.6; }',
      '@media (min-width: 600px) { .card[data-size=large] { padding: 24px; } }',
    ].join('\n'),
  );

  assert.deepEqual(data(c.conditions.variants.card), {
    size: { large: 'card[size=large]', small: 'card[size=small]' },
    tone: { muted: 'card[tone=muted]' },
  });

  assert.equal(c.classes['card[size=large]'].paddingTop, 16);
  assert.equal(c.classes['card[size=small]'].paddingTop, 4);
  assert.equal(c.classes.card.paddingTop, 8);

  assert.deepEqual(data(c.conditions.when['card[size=large]']), [
    {
      media: { minWidth: 600 },
      props: { paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24 },
    },
  ]);
});

test('each rejected variant construct is an error at its line', () => {
  const at = (line: number, message: RegExp) => located('<css>', line, message);
  const compile = (css: string) => () => compileNativeCSS('.card { opacity: 1; }\n' + css);

  assert.throws(compile('[data-size=large] { opacity: 1; }'), at(2, /Unsupported selector/));
  assert.throws(compile('.card[data-size] { opacity: 1; }'), at(2, /\[data-size\] takes a value/));
  assert.throws(compile('.card[size=large] { opacity: 1; }'), at(2, /data- attributes/));

  assert.throws(
    compile('.card[data-size=large][data-tone=warm] { opacity: 1; }'),
    at(2, /one data- attribute/),
  );

  assert.throws(
    compile('.card[data-size=large] { opacity: 1; }\n.card[data-size=large] { opacity: 0; }'),
    at(3, /Duplicate class \.card\[data-size=large\]/),
  );

  // Both variants may apply at once, and neither is more specific.
  assert.throws(
    compile(
      '.card[data-size=large] { padding: 8px; }\n.card[data-tone=muted] { padding-top: 2px; }',
    ),
    at(
      3,
      /Conflicting declarations: paddingTop is set by both \.card\[data-size=large\] \(<css>:2\) and \.card\[data-tone=muted\]/,
    ),
  );
});
