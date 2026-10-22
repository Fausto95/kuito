/**
 * Turn the repository's documentation into website pages, one JSON per locale.
 *
 * - English comes from `docs/*.md` (plus CONTRIBUTING.md and the website's own
 *   pages under `apps/website/content`); other
 *   locales from `i18n/<locale>/docs/<slug>.md`, falling back to English when a
 *   translation is missing (the page then carries `translated: false`).
 * - `src/content/docs-map.json` decides the section and category of every file
 *   and fails the build on a file it does not list.
 * - Heading anchors are the English ones in every locale, by position, so a link
 *   written as `reactivity.md#stores` resolves in French too.
 * - Cross-document links become site routes; repository paths become GitHub links;
 *   images under `docs/assets` are copied to `public/docs-assets`.
 *
 * Also writes the slim client-side API index from `reference.generated.json`, so
 * the full 7 MB reference stays on the server.
 *
 * Usage: node scripts/generate-docs.ts
 */
import { marked, type Tokens } from 'marked';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { highlight } from '../src/lib/highlight.ts';
import { locales, messages, type Locale } from '../src/i18n/messages.ts';
import docsMap from '../src/content/docs-map.json' with { type: 'json' };
import websiteDescriptions from '../content/api/descriptions.json' with { type: 'json' };

const describe = (id: string, jsdoc: string): string =>
  jsdoc || (websiteDescriptions as Record<string, string>)[id] || '';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const repo = resolve(site, '../..');
const docsDir = resolve(repo, 'docs');
const generated = resolve(site, 'src/content/generated');
const assetsOut = resolve(site, 'public/docs-assets');
const GITHUB = 'https://github.com/Fausto95/kuito/blob/main/';

type MapEntry = {
  section: string;
  category?: string;
  page?: string;
  /** Source, relative to the repository; `docs/<key>.md` when absent. */
  file?: string;
  diagrams?: string[];
  exclude?: boolean;
  /** Rendered and searchable, but not in the sidebar: the in-depth page behind a concise one. */
  hidden?: boolean;
};

/** The repository path of a page's English source. */
const sourceOf = (slug: string): string => map[slug].file ?? `docs/${slug}.md`;

/** Translations mirror the source tree: `i18n/<locale>/docs/x.md`, `i18n/<locale>/content/guides/x.md`. */
const translationOf = (locale: string, slug: string): string =>
  resolve(site, 'i18n', locale, sourceOf(slug).replace(/^apps\/website\//, ''));
const map = Object.fromEntries(
  Object.entries(docsMap).filter(([key]) => key !== '$comment'),
) as Record<string, MapEntry>;
const pageSlugOf = (slug: string) => map[slug].page ?? slug;

type Heading = { id: string; text: string; level: number };

/** The language of a fence without one, from what its first lines look like. */
function guessLanguage(code: string): string {
  if (/^\s*(npm|npx|kuito|cd|git|xcrun|adb|brew|\$)\b/m.test(code)) return 'sh';
  if (/\b(import|export|const|function|return)\b|=>|<[A-Z]\w*/.test(code)) return 'tsx';
  if (/^[.#:@\w-][^\n]*\{\s*$/m.test(code) && /:\s*[^\n]+;/.test(code)) return 'css';

  if (/^\s*[[{]/.test(code)) {
    try {
      JSON.parse(code);
      return 'json';
    } catch {
      /* not JSON */
    }
  }

  return 'text';
}

/** Hex colors of the repository diagrams, by role, so the inlined SVG follows the theme. */
const DIAGRAM_COLORS: [RegExp, string][] = [
  [/#16253a/gi, 'var(--dg-panel)'],
  [/#2b3d51/gi, 'var(--dg-line)'],
  [/#(f2f7ff|f4f9ff|f5f9ff)/gi, 'var(--dg-text)'],
  [/#(a8b8cd|b5c9db|b8c9db|c3d0dd|c5d4e4|b1c4da)/gi, 'var(--dg-muted)'],
  [/#8ba4bd/gi, 'var(--dg-arrow)'],
  [/#(6dbdff|70b9ff|7bb8ff|7cb7ff|7db7ff|87c3ff|a7dcff|6fbde8)/gi, 'var(--dg-blue)'],
  [/#(c7a8ff|baa5ff|b3a2ff)/gi, 'var(--dg-purple)'],
  [/#(7edec0|7bd8bf|85d5c5|a0efda|aff5da|b8d8ce|3fb995)/gi, 'var(--dg-green)'],
  [/#104439/gi, 'var(--dg-green-dim)'],
  [/#(ffce88|ffcb80|ffcf91|e8a763|e5cdb3)/gi, 'var(--dg-orange)'],
  [/#49311f/gi, 'var(--dg-orange-dim)'],
];

/** An inline, themed, responsive copy of a diagram from docs/assets. */
async function diagram(name: string): Promise<{ title: string; html: string }> {
  let svg = await readFile(resolve(docsDir, 'assets', name), 'utf8');
  const title = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? name;
  const prefix = name.replace(/\.svg$/, '').replace(/[^\w-]/g, '');

  svg = svg
    .replace(/<\?xml[^>]*>/, '')
    .replace(/<svg([^>]*)\swidth="\d+"\sheight="\d+"/, '<svg$1')
    .replace(/<linearGradient[\s\S]*?<\/linearGradient>/g, '')
    .replace(/fill="url\(#bg\)"/g, 'fill="var(--dg-bg)"')
    .replace(/id="([\w-]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([\w-]+)\)/g, `url(#${prefix}-$1)`);

  for (const [pattern, token] of DIAGRAM_COLORS) svg = svg.replace(pattern, token);

  return { title, html: `<figure class="diagram">${svg.trim()}</figure>` };
}

type Page = {
  slug: string;
  title: string;
  description: string;
  html: string;
  headings: Heading[];
  translated: boolean;
  sourcePath: string;
  words: number;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Cuts at a word boundary and marks the cut. */
function trimToWord(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function plain(tokens: Tokens.Generic[] | undefined): string {
  if (!tokens) return '';

  return tokens
    .map((token) => {
      if (token.type === 'codespan') return token.text;
      if ('tokens' in token && token.tokens) return plain(token.tokens as Tokens.Generic[]);

      return token.type === 'text' || token.type === 'escape' ? token.text : (token.raw ?? '');
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** State of the document being rendered, read by the renderer overrides. */
let current: {
  slug: string;
  locale: Locale;
  base: string;
  sourceDir: string;
  headingIds: string[] | null;
  headings: Heading[];
  usedIds: Set<string>;
  images: Set<string>;
};

/** The heading ids of a mapped document's English source, as the renderer assigns them. */
const anchorCache = new Map<string, Set<string>>();

function anchorsOf(slug: string): Set<string> {
  let ids = anchorCache.get(slug);

  if (!ids) {
    ids = new Set();

    const source = resolve(repo, sourceOf(slug));

    if (existsSync(source))
      for (const token of marked.lexer(readFileSync(source, 'utf8'))) {
        if (token.type !== 'heading' || token.depth === 1) continue;

        let id = slugify(plain((token as Tokens.Heading).tokens));

        while (ids.has(id)) id += '-';
        ids.add(id);
      }

    anchorCache.set(slug, ids);
  }

  return ids;
}

function resolveHref(href: string): { href: string; external: boolean } {
  if (href.startsWith('#')) return { href, external: false };

  if (/^https?:\/\/kuito\.dev(\/|$)/.test(href))
    return { href: current.base + href.replace(/^https?:\/\/kuito\.dev/, ''), external: false };

  if (/^[a-z]+:/.test(href)) return { href, external: true };

  const [path, hash = ''] = href.split('#');
  const absolute = resolve(current.sourceDir, path);
  const fromRepo = relative(repo, absolute).split('\\').join('/');
  let slug = Object.keys(map).find((key) => sourceOf(key) === fromRepo) ?? null;

  // From a concise page, a repository document links to its concise counterpart when one
  // exists and has the heading linked to, except the page's own full document (its "In depth" link).
  if (slug && map[slug].hidden && !map[current.slug].hidden) {
    const concise = slug.replace(/-in-depth$/, '');

    if (
      concise !== current.slug &&
      map[concise] &&
      !map[concise].hidden &&
      (!hash || anchorsOf(concise).has(hash))
    )
      slug = concise;
  }

  if (slug && !map[slug].exclude) {
    return {
      href: `${current.base}/docs/${map[slug].section}/${pageSlugOf(slug)}${hash ? '#' + hash : ''}`,
      external: false,
    };
  }

  return { href: GITHUB + fromRepo + (hash ? '#' + hash : ''), external: true };
}

marked.use({
  gfm: true,
  renderer: {
    heading(token) {
      const text = this.parser.parseInline(token.tokens);
      const index = current.headings.length;
      let id = current.headingIds?.[index] ?? slugify(plain(token.tokens));

      while (current.usedIds.has(id)) id += '-';
      current.usedIds.add(id);
      current.headings.push({ id, text: plain(token.tokens), level: token.depth });

      return `<h${token.depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${token.depth}>\n`;
    },
    link(token) {
      const { href, external } = resolveHref(token.href);
      const text = this.parser.parseInline(token.tokens);
      const title = token.title ? ` title="${token.title}"` : '';

      return external
        ? `<a href="${href}"${title} target="_blank" rel="noreferrer">${text}</a>`
        : `<a href="${href}"${title}>${text}</a>`;
    },
    image(token) {
      const absolute = resolve(current.sourceDir, token.href);
      const name = basename(absolute);

      if (absolute.startsWith(resolve(docsDir, 'assets'))) {
        current.images.add(absolute);
        return `<img src="/docs-assets/${name}" alt="${token.text}" loading="lazy">`;
      }

      return `<img src="${token.href}" alt="${token.text}" loading="lazy">`;
    },
    code(token) {
      const [fenced, ...info] = (token.lang ?? '').trim().split(/\s+/);
      const lang = fenced || guessLanguage(token.text);
      const label = lang || 'text';
      // ```tsx partial: part of a larger program, so it is not compiled (check-snippets.ts).
      const fragment = info.includes('partial')
        ? `<span class="code-fragment">${messages[current.locale].codeFragment}</span>`
        : '';

      return (
        `<figure class="code-block" data-lang="${label}">` +
        `<figcaption class="code-head"><span>${label}</span>${fragment}` +
        `<button class="code-copy" type="button" aria-label="${messages[current.locale].copyCode}" title="${messages[current.locale].copyCode}">` +
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>` +
        `</button></figcaption>` +
        `<pre><code>${highlight(token.text, lang)}</code></pre></figure>\n`
      );
    },
  },
});

async function renderDocument(
  source: string,
  locale: Locale,
  slug: string,
  headingIds: string[] | null,
): Promise<Omit<Page, 'translated' | 'sourcePath'>> {
  const raw = await readFile(source, 'utf8');

  current = {
    slug,
    locale,
    base: locale === 'en' ? '' : '/' + locale,
    sourceDir: dirname(source),
    headingIds,
    headings: [],
    usedIds: new Set(),
    images: current?.images ?? new Set(),
  };

  const tokens = marked.lexer(raw);
  const titleIndex = tokens.findIndex((token) => token.type === 'heading' && token.depth === 1);
  const titleToken = titleIndex >= 0 ? (tokens.splice(titleIndex, 1)[0] as Tokens.Heading) : null;
  const title = titleToken ? plain(titleToken.tokens) : slug;
  const firstParagraph = tokens.find((token) => token.type === 'paragraph') as
    | Tokens.Paragraph
    | undefined;
  const description = trimToWord(plain(firstParagraph?.tokens), 220);
  let html = marked.parser(tokens);

  html = html
    .replace(/<table>/g, '<div class="table-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');

  const directives = [...raw.matchAll(/<!--\s*diagram:\s*([\w.-]+)\s*-->/g)].map(
    (match) => match[1],
  );

  for (const name of directives) {
    html = html.replace(/<!--\s*diagram:\s*[\w.-]+\s*-->/, (await diagram(name)).html);
  }

  for (const name of map[slug].diagrams ?? []) {
    const figure = (await diagram(name)).html;
    const firstHeading = html.search(/<h2 /);

    html =
      firstHeading >= 0
        ? html.slice(0, firstHeading) + figure + '\n' + html.slice(firstHeading)
        : html + figure;
  }

  const words = raw.split(/\s+/).filter(Boolean).length;

  return { slug: pageSlugOf(slug), title, description, html, headings: current.headings, words };
}

async function main() {
  await mkdir(generated, { recursive: true });
  await mkdir(assetsOut, { recursive: true });

  const repoDocs = (await readdir(docsDir))
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3));
  const sources = new Set(Object.keys(map).map(sourceOf));
  const unmapped = repoDocs.filter((slug) => !sources.has(`docs/${slug}.md`));

  if (unmapped.length) throw new Error('docs-map.json does not place: ' + unmapped.join(', '));

  const missing = Object.keys(map).filter((slug) => !existsSync(resolve(repo, sourceOf(slug))));

  if (missing.length)
    throw new Error('docs-map.json lists documents that do not exist: ' + missing.join(', '));

  const englishHeadings = new Map<string, string[]>();
  const index: Record<
    string,
    Record<string, Pick<Page, 'title' | 'description' | 'headings' | 'translated'>>
  > = {};
  const stats: Record<string, { translated: number; total: number }> = {};

  for (const locale of locales) {
    const pages: Record<string, Page> = {};

    stats[locale] = { translated: 0, total: 0 };

    for (const slug of Object.keys(map)) {
      const entry = map[slug];

      if (entry.exclude) continue;

      const english = resolve(repo, sourceOf(slug));
      const localized = translationOf(locale, slug);
      const translated = locale === 'en' || existsSync(localized);
      const source = translated ? (locale === 'en' ? english : localized) : english;
      const ids = locale === 'en' ? null : (englishHeadings.get(slug) ?? null);
      const page = await renderDocument(source, locale, slug, ids);

      if (locale === 'en')
        englishHeadings.set(
          slug,
          page.headings.map((h) => h.id),
        );
      else if (translated && ids && page.headings.length !== ids.length) {
        console.warn(
          `! ${locale}/${slug}.md has ${page.headings.length} headings, English has ${ids.length}: anchors fall back to local ids`,
        );
      }

      const sourcePath = relative(repo, source).split('\\').join('/');

      pages[page.slug] = { ...page, translated, sourcePath };
      stats[locale].total += 1;
      if (translated) stats[locale].translated += 1;
    }

    await writeFile(
      join(generated, `docs.${locale}.json`),
      JSON.stringify({ locale, pages }) + '\n',
    );

    index[locale] = Object.fromEntries(
      Object.values(pages).map((page) => [
        page.slug,
        {
          title: page.title,
          description: page.description,
          headings: page.headings,
          translated: page.translated,
        },
      ]),
    );
  }

  await writeFile(join(generated, 'docs-index.json'), JSON.stringify(index) + '\n');

  for (const image of current.images) await copyFile(image, join(assetsOut, basename(image)));

  const referencePath = resolve(site, 'src/content/reference.generated.json');

  if (!existsSync(referencePath)) throw new Error('Run api:generate before docs:generate');

  const reference = JSON.parse(await readFile(referencePath, 'utf8'));
  const slim = {
    version: reference.version,
    counts: reference.counts,
    entries: reference.entries.map(
      (entry: {
        id: string;
        name: string;
        kind: string;
        section: string;
        description: string;
        source: { file: string } | null;
        members: { name: string }[];
        children?: string[];
      }) => ({
        id: entry.id,
        name: entry.name,
        kind: entry.kind,
        section: entry.section,
        description: describe(entry.id, entry.description)
          .split(/(?<=[.!?])\s/)[0]
          .slice(0, 180),
        file: entry.source?.file ?? null,
        members: entry.members.map((member) => member.name),
        ...(entry.children ? { children: entry.children } : {}),
      }),
    ),
    cliCommands: reference.cliCommands,
    cliOptions: reference.cliOptions,
    cssProperties: reference.cssProperties,
  };

  await writeFile(join(generated, 'api-index.json'), JSON.stringify(slim) + '\n');

  console.log(
    'Documentation pages: ' +
      locales
        .map((locale) => `${locale} ${stats[locale].translated}/${stats[locale].total}`)
        .join(', ') +
      `; ${current.images.size} images; ${slim.entries.length} API index entries`,
  );
}

await main();
