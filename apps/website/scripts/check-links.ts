/**
 * Every link in the generated pages leads somewhere: a page of the site, a heading
 * on it, or a file of the repository.
 *
 * Reads `src/content/generated/docs.<locale>.json` (after `docs:generate`) and checks
 * each `href`: `/docs/<section>/<slug>` against the mapped documents and the API
 * index, `#anchor` against the target page's headings, and GitHub links into this
 * repository's `main` against the checkout. Other external links are not fetched.
 *
 * Usage: node scripts/check-links.ts   (exits 1 on any broken link)
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import docsMap from '../src/content/docs-map.json' with { type: 'json' };
import { sectionIds } from '../src/content/section-ids.ts';

type Page = { slug: string; html: string; headings: { id: string }[] };

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(site, '../..');
const locales = ['en', 'fr', 'pt', 'de'];
const REPOSITORY = /^https:\/\/github\.com\/Fausto95\/kuito\/(?:blob|tree)\/main\/([^#?]+)/;

const read = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(resolve(site, path), 'utf8'));
const api = await read<{ entries: { id: string; kind: string }[] }>(
  'src/content/generated/api-index.json',
);

/** `section/slug` of every page a link may name. */
const routes = new Set<string>(
  api.entries.map((entry) => `${entry.kind === 'component' ? 'components' : 'apis'}/${entry.id}`),
);

type Mapped = { section: string; page?: string; exclude?: boolean };

for (const [slug, entry] of Object.entries(docsMap as Record<string, Mapped | string>)) {
  if (typeof entry !== 'object' || entry.exclude) continue;

  routes.add(`${entry.section}/${entry.page ?? slug}`);
}

const broken: string[] = [];

for (const locale of locales) {
  const { pages } = await read<{ pages: Record<string, Page> }>(
    `src/content/generated/docs.${locale}.json`,
  );
  const anchorsOf = new Map(
    Object.values(pages).map((page) => [page.slug, new Set(page.headings.map((h) => h.id))]),
  );

  for (const page of Object.values(pages)) {
    const ids = new Set([...page.html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

    for (const [, href] of page.html.matchAll(/\shref="([^"]*)"/g)) {
      const at = `${locale}/${page.slug}: ${href}`;
      const inRepository = REPOSITORY.exec(href);

      if (inRepository) {
        if (!existsSync(resolve(repo, decodeURIComponent(inRepository[1])))) broken.push(at);
        continue;
      }

      if (/^(https?:|mailto:)/.test(href)) continue;

      if (href.startsWith('#')) {
        if (!ids.has(href.slice(1))) broken.push(at);
        continue;
      }

      const [path, anchor] = href.split('#');
      const route = /^(?:\/(?:fr|pt|de))?\/docs\/([^/]+)(?:\/([^/]+))?\/?$/.exec(path);

      if (!route || !sectionIds.includes(route[1] as never)) {
        if (!/^(?:\/(?:fr|pt|de))?\/(?:examples|api(?:\/.*)?)?$/.test(path)) broken.push(at);
        continue;
      }

      if (!route[2]) continue;

      const slug = decodeURIComponent(route[2]);

      if (!routes.has(`${route[1]}/${slug}`)) broken.push(at);
      else if (anchor && anchorsOf.has(slug) && !anchorsOf.get(slug)!.has(anchor)) broken.push(at);
    }
  }
}

console.log(`Links: ${broken.length} broken`);
for (const link of broken) console.log('  ' + link);
if (broken.length) process.exitCode = 1;
