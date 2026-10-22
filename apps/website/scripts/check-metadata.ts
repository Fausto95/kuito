/** Check crawler-visible metadata against a running production preview. */
import assert from 'node:assert/strict';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:4175';
const origin = 'https://kuito.dev';
const locales = { en: 'en_US', fr: 'fr_FR', pt: 'pt_PT', de: 'de_DE' };
const routes = [
  '',
  '/docs',
  ...['guides', 'components', 'apis', 'architecture', 'cli', 'language'].map(
    (section) => `/docs/${section}`,
  ),
  '/docs/guides/apps',
  '/docs/components/Button',
  '/docs/apis/videoRef',
  '/docs/apis/PermissionStatus',
  '/docs/architecture/overview',
  '/docs/cli/commands',
  '/docs/cli/options',
  '/docs/language/css-properties',
];

function decode(value: string): string {
  return value.replace(/&(amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (_, entity: string) => {
    if (entity.startsWith('#'))
      return String.fromCodePoint(
        entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)),
      );

    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity] ?? _;
  });
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)]),
  );
}

let checked = 0;

async function check(path: string, canonicalPath: string, locale: string, article: boolean) {
  const response = await fetch(new URL(path, base));

  assert.equal(response.status, 200, path);

  const html = await response.text();
  const head = /<head[^>]*>([\s\S]*?)<\/head>/.exec(html)?.[1];

  assert(head, `${path}: missing server-rendered head`);

  const tags = [...head.matchAll(/<meta\s[^>]*>/g)].map(([tag]) => attributes(tag));
  const get = (key: string) => {
    const matches = tags.filter((tag) => tag.property === key || tag.name === key);

    assert.equal(matches.length, 1, `${path}: expected exactly one ${key}`);
    assert(matches[0].content?.trim(), `${path}: empty ${key}`);

    return matches[0].content;
  };
  const titles = [...head.matchAll(/<title>(.*?)<\/title>/g)];

  assert.equal(titles.length, 1, `${path}: duplicate or missing title`);
  assert.equal(get('og:title'), decode(titles[0][1]), path);
  assert.equal(get('twitter:title'), get('og:title'), path);
  assert.equal(get('og:description'), get('description'), path);
  assert.equal(get('twitter:description'), get('description'), path);
  assert(!get('description').includes('`'), `${path}: Markdown leaked into description`);
  assert.equal(get('og:url'), origin + canonicalPath, path);
  assert.equal(get('og:locale'), locale, path);
  assert.equal(get('og:type'), article ? 'article' : 'website', path);
  assert.equal(get('og:site_name'), 'Kuito', path);
  assert.equal(get('og:image'), `${origin}/social-card.png`, path);
  assert.equal(get('og:image:type'), 'image/png', path);
  assert.equal(get('og:image:width'), '1200', path);
  assert.equal(get('og:image:height'), '630', path);
  assert.equal(get('twitter:image'), get('og:image'), path);
  assert.equal(get('twitter:image:alt'), get('og:image:alt'), path);
  assert.equal(get('twitter:card'), 'summary_large_image', path);

  const canonicals = [...head.matchAll(/<link\s[^>]*>/g)]
    .map(([tag]) => attributes(tag))
    .filter((link) => link.rel === 'canonical');

  assert.equal(canonicals.length, 1, `${path}: duplicate or missing canonical`);
  assert.equal(canonicals[0].href, get('og:url'), path);
  if (path.includes('/components/Button')) assert.match(get('og:title'), /^Button — /);
  if (path.includes('/apis/videoRef')) assert.match(get('og:title'), /^videoRef — /);
  if (path.includes('/guides/apps')) assert.match(get('og:title'), /^Create your first app — /);
  checked++;
}

for (const [locale, ogLocale] of Object.entries(locales)) {
  const prefix = locale === 'en' ? '' : `/${locale}`;

  for (const route of routes) {
    const path = prefix + route || '/';

    await check(path, path, ogLocale, route.split('/').length > 3);
  }
}

// Explicit English prefixes, trailing slashes and tracking queries share the canonical URL.
await check('/en/docs/components/Button?ref=share', '/docs/components/Button', 'en_US', true);
await check('/fr/docs/?ref=share', '/fr/docs', 'fr_FR', false);

for (const path of ['/examples', '/docs/apis/no-such-export']) {
  const response = await fetch(new URL(path, base));

  assert.equal(response.status, 404, path);

  const html = await response.text();

  assert(!/<meta[^>]*property="og:url"/.test(html), `${path}: fabricated social URL on a 404`);
}

const image = await fetch(new URL('/social-card.png', base));

assert.equal(image.status, 200);
assert.match(image.headers.get('content-type') ?? '', /^image\/png/);

const info = await sharp(Buffer.from(await image.arrayBuffer())).metadata();

assert.equal(info.width, 1200);
assert.equal(info.height, 630);

console.log(
  `Metadata: ${checked} server-rendered pages, canonical variants, 404s and share image checked.`,
);
