import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createSourceCompiler } from '../src/dev/compiler.ts';
import { CARDINAL_LOCALES, ORDINAL_LOCALES } from '../src/native/intl/cldr-plurals.ts';
import { nativeFormats, type IntlNative } from '../src/native/intl/native-formats.ts';
import { PluralRules } from '../src/native/intl/plural-rules.ts';
import { polyfillIntl } from '../src/native/intl/polyfill.ts';
import { loadCatalog } from '../src/dev/modules/catalog.ts';
import { fakeModules } from './support/fake-modules.ts';
import { hosting } from './support/host-wire.ts';
import { present } from './support/present.ts';
import { installKernel, type HostView } from './support/kuito-host.ts';

// Hermes has Intl's Collator, DateTimeFormat and NumberFormat only
// (docs/web-apis.md#intl). PluralRules runs on CLDR's rules, checked here
// against Node's ICU where it ships the same CLDR release; the other three
// ask the platform, faked here.

const NUMBERS = [
  ...Array.from({ length: 120 }, (_, n) => n),
  200,
  201,
  202,
  203,
  205,
  211,
  1000,
  1001,
  10000,
  100000,
  1000000,
  2000000,
  1000001,
  0.1,
  0.5,
  1.2,
  1.5,
  2.25,
  3.7,
  10.5,
  11.1,
  21.1,
  100.01,
  1000000.5,
  0.005,
  1.005,
  1.0005,
  0.0001234,
  2.5,
  1.5e-7,
];
const DIGITS = [
  {},
  { minimumFractionDigits: 1 },
  { maximumFractionDigits: 0 },
  { maximumSignificantDigits: 2 },
  { minimumSignificantDigits: 3 },
];

/** Each locale and number whose category differs from Node's, as `locale n: ours, Node's`. */
function differences(type: 'cardinal' | 'ordinal', locales: readonly string[]): string[] {
  const found: string[] = [];

  for (const locale of locales) {
    if (Intl.PluralRules.supportedLocalesOf(locale).length === 0) continue;

    for (const digits of DIGITS) {
      const ours = new PluralRules(locale, { type, ...digits });
      const icu = new Intl.PluralRules(locale, { type, ...digits });

      for (const n of NUMBERS) {
        if (ours.select(n) !== icu.select(n))
          found.push(
            `${locale} ${n} ${JSON.stringify(digits)}: ${ours.select(n)}, ${icu.select(n)}`,
          );
      }

      assert.deepEqual(
        ours.resolvedOptions().pluralCategories,
        icu.resolvedOptions().pluralCategories,
        `${locale} ${type} categories`,
      );
    }
  }

  return found;
}

// The release src/native/intl/cldr-plurals.ts is built from. Node 22 ships an
// older one, whose rules differ (scn's `many`) and whose categories come in
// ICU's order rather than ECMA-402's.
const CLDR = '48.0';

test('PluralRules picks the category ICU picks, in every CLDR locale', (t) => {
  if (process.versions.cldr !== CLDR)
    return t.skip(`Node's ICU has CLDR ${process.versions.cldr}, the rules CLDR ${CLDR}`);

  const cardinal = Object.keys(CARDINAL_LOCALES);
  const ordinal = Object.keys(ORDINAL_LOCALES);

  assert.ok(cardinal.length > 200 && ordinal.length > 100, 'the data covers CLDR');
  assert.deepEqual(differences('cardinal', cardinal), []);
  assert.deepEqual(differences('ordinal', ordinal), []);
});

test('PluralRules resolves locales and options like ECMA-402', () => {
  assert.equal(new PluralRules('ru-RU').select(3), 'few', 'a region uses its language’s rules');
  assert.equal(new PluralRules('pt-PT').select(0), 'other', 'pt-PT has rules of its own');
  assert.equal(new PluralRules('pt-BR').select(0), 'one');
  assert.equal(new PluralRules(['xx', 'fr']).select(1.5), 'one', 'the first locale with rules');
  assert.equal(new PluralRules('en', { type: 'ordinal' }).select(22), 'two');

  assert.deepEqual(new PluralRules('fr-CA', { minimumFractionDigits: 2 }).resolvedOptions(), {
    locale: 'fr',
    type: 'cardinal',
    minimumIntegerDigits: 1,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
    pluralCategories: ['one', 'many', 'other'],
  });

  assert.deepEqual(PluralRules.supportedLocalesOf(['en-GB', 'xx', 'ja']), ['en-GB', 'ja']);
  assert.throws(() => new PluralRules('en', { type: 'plural' as never }), RangeError);
  assert.throws(() => new PluralRules('not a locale'), RangeError);
  assert.equal(new PluralRules('en').select(Number.NaN), 'other');
  // Past 2^63 ICU's integer part overflows; CLDR's rules hold on.
  assert.equal(new PluralRules('ru').select(2 ** 70), 'many');
  assert.equal(new PluralRules('fr').select(1e21), 'many');
});

/** A platform that answers every call with its arguments and records them. */
function fakeNative(overrides: Partial<IntlNative> = {}) {
  const calls: unknown[][] = [];
  const native: IntlNative = {
    relativeTime: (...args) => {
      calls.push(['relativeTime', ...args]);

      return 'relative';
    },
    list: (...args) => {
      calls.push(['list', ...args]);

      return args[3].join(' + ');
    },
    displayName: (...args) => {
      calls.push(['displayName', ...args]);

      return args[4] === 'XX' ? null : `name of ${args[4]}`;
    },
    ...overrides,
  };

  return { calls, native, ...nativeFormats(native) };
}

const unsupported = (message: string) =>
  Object.assign(new Error(message), { code: 'ERR_UNSUPPORTED' });

test('RelativeTimeFormat checks its unit and value, then asks the platform', () => {
  const { calls, RelativeTimeFormat } = fakeNative();
  const format = new RelativeTimeFormat('pt-PT', { style: 'short', numeric: 'auto' });

  assert.equal(format.format(-1, 'days'), 'relative');
  assert.equal(format.format(3, 'quarter'), 'relative');

  assert.deepEqual(calls, [
    ['relativeTime', 'pt-PT', 'short', 'auto', -1, 'day'],
    ['relativeTime', 'pt-PT', 'short', 'auto', 3, 'quarter'],
  ]);

  assert.deepEqual(format.resolvedOptions(), {
    locale: 'pt-PT',
    style: 'short',
    numeric: 'auto',
    numberingSystem: 'latn',
  });

  assert.deepEqual(new RelativeTimeFormat().resolvedOptions().style, 'long');

  assert.throws(() => format.format(1, 'fortnight' as never), RangeError);
  assert.throws(() => format.format(Number.POSITIVE_INFINITY, 'day'), RangeError);
  assert.throws(() => new RelativeTimeFormat('en', { style: 'tiny' as never }), RangeError);
});

test('ListFormat formats strings, and a type the platform lacks fails at construction', () => {
  const { calls, ListFormat } = fakeNative();

  assert.equal(new ListFormat('en').format(['a', 'b', 'c']), 'a + b + c');

  assert.deepEqual(
    calls,
    [
      ['list', 'en', 'conjunction', 'long', []],
      ['list', 'en', 'conjunction', 'long', ['a', 'b', 'c']],
    ],
    'the constructor asks whether the platform has the type and style',
  );

  assert.deepEqual(new ListFormat('de', { type: 'unit', style: 'narrow' }).resolvedOptions(), {
    locale: 'de',
    type: 'unit',
    style: 'narrow',
  });

  assert.throws(() => new ListFormat('en').format(['a', 1] as never), TypeError);
  assert.equal(new ListFormat('en').format(), '', 'no list is an empty one');

  const { ListFormat: Limited } = fakeNative({
    list: () => {
      throw unsupported('ListFormatter only joins with "and" on iOS');
    },
  });

  assert.throws(() => new Limited('en', { type: 'disjunction' }), {
    name: 'RangeError',
    message: /only joins with "and" on iOS/,
  });
});

test('DisplayNames checks the code for its type and falls back as asked', () => {
  const { calls, DisplayNames } = fakeNative();
  const regions = new DisplayNames('fr', { type: 'region' });

  assert.equal(regions.of('us'), 'name of US');
  assert.deepEqual(calls, [['displayName', 'fr', 'region', 'long', 'dialect', 'US']]);
  assert.equal(regions.of('XX'), 'XX', 'an unknown code falls back to itself');
  assert.equal(new DisplayNames('fr', { type: 'region', fallback: 'none' }).of('XX'), undefined);
  assert.equal(new DisplayNames('en', { type: 'script' }).of('latn'), 'name of Latn');
  assert.equal(new DisplayNames('en', { type: 'currency' }).of('eur'), 'name of EUR');
  assert.equal(new DisplayNames('en', { type: 'language' }).of('EN-gb'), 'name of en-GB');

  assert.throws(() => new DisplayNames('en', {} as never), TypeError, 'type is required');
  assert.throws(() => regions.of('U'), RangeError);

  assert.throws(
    () => new DisplayNames('en', { type: 'language' }).of('en-u-ca-gregory'),
    RangeError,
  );

  assert.throws(() => new DisplayNames('en', { type: 'dateTimeField' }), RangeError);

  assert.deepEqual(new DisplayNames('en', { type: 'calendar' }).resolvedOptions(), {
    locale: 'en',
    style: 'long',
    type: 'calendar',
    fallback: 'code',
  });
});

test('polyfillIntl adds only what Intl lacks', () => {
  const { RelativeTimeFormat, native } = fakeNative();
  const target: Record<string, unknown> = {
    NumberFormat: Intl.NumberFormat,
    getCanonicalLocales: Intl.getCanonicalLocales,
    RelativeTimeFormat: Intl.RelativeTimeFormat,
  };

  polyfillIntl(target, native);

  assert.equal(target.PluralRules, PluralRules);
  assert.equal(target.RelativeTimeFormat, Intl.RelativeTimeFormat, 'the platform’s own stays');
  assert.notEqual(target.RelativeTimeFormat, RelativeTimeFormat);
  assert.equal(typeof target.ListFormat, 'function');
  assert.equal(typeof target.DisplayNames, 'function');

  assert.equal(
    Object.getOwnPropertyDescriptor(target, 'PluralRules')?.enumerable,
    false,
    'installed like a built-in',
  );
});

test('the app bundle installs them before its first module runs', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-intl-'));
  const { code } = await createSourceCompiler({ platform: 'ios', outputDir: temp })(
    resolve('test/fixtures/intl-first-app.tsx'),
  ).finally(() => rmSync(temp, { recursive: true, force: true }));
  const views = new Map<string, HostView>();
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
    }),
  );

  // As on Hermes: the realm has no PluralRules of its own.
  runInNewContext('delete Intl.PluralRules', host);
  runInNewContext(code, host);

  assert.equal(present(views.get('category'), 'category').props.text, 'few');
});

/** What `entry` compiles to, and the module functions it links, as `Module.function`. */
async function compiled(entry: string) {
  const temp = mkdtempSync(join(tmpdir(), 'kuito-intl-'));
  const build = await createSourceCompiler({ platform: 'ios', outputDir: temp })(
    resolve(entry),
  ).finally(() => rmSync(temp, { recursive: true, force: true }));
  const { members } = await loadCatalog(temp);
  const linked = build.links.map((id) => {
    const member = members.find((each) => each.id === id);

    return member ? `${member.module.name}.${member.member.name}` : `#${id}`;
  });

  return { code: build.code, linked };
}

test('a format the app names is installed before the module that names it, and links its function alone', async () => {
  const { code, linked } = await compiled('test/fixtures/intl-list-app.tsx');

  assert.deepEqual(linked, ['IntlFormats.list']);

  const native = fakeModules({
    IntlFormats: {
      functions: {
        list: {
          thread: 'js',
          run: (_locale, _type, _style, items) => (items as string[]).join(' and '),
        },
      },
    },
  });
  const views = new Map<string, HostView>();
  const host = installKernel(
    hosting({
      createView(id: string, kind: string, parent: string) {
        views.set(id, { kind, parent, props: {} });
      },
      setProp(id: string, name: string, value: unknown) {
        present(views.get(id), id).props[name] = value;
      },
      removeView(id: string) {
        views.delete(id);
      },
      ...native.host,
    }),
  );

  native.attach(host);
  // As on Hermes: the realm has no ListFormat of its own.
  runInNewContext('delete Intl.ListFormat', host);
  runInNewContext(code, host);

  assert.equal(present(views.get('joined'), 'joined').props.text, 'apples and pears');
});

test('an app that names none of the formats links none of them', async () => {
  assert.deepEqual((await compiled('test/fixtures/intl-first-app.tsx')).linked, []);
});

test('a JSON file that names a format takes no installer', async () => {
  const { linked } = await compiled('test/fixtures/intl-json-app.tsx');

  assert.deepEqual(linked, []);
});
