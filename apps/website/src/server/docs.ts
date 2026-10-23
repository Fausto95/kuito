/** Server functions: everything the documentation routes load. The generated JSON never reaches the client. */
import { createServerFn } from '@tanstack/react-start';
import { apiEntryById, type ApiEntry } from '../content/api';
import {
  apiCategory,
  apiEntries,
  apiVersion,
  categoryOf,
  cliCommands,
  cliOptions,
  cssProperties,
  docStats,
  isSectionId,
  pager,
  resolvePage,
  searchIndex,
  sectionIds,
  sectionNav,
  type ApiIndexEntry,
  type NavItem,
  type ResolvedPage,
  type SearchHit,
  type SectionId,
  type SectionNav,
} from '../content/sections';
import { isLocale, type Locale } from '../i18n/messages';
import usageIndex from '../content/generated/usage.json' with { type: 'json' };

export type UsageExample = {
  file: string;
  line: number;
  code: string;
  title: string;
  context?: string;
  via?: string;
  viaSection?: 'components' | 'apis';
};

const usage = usageIndex as Record<string, UsageExample[]>;

type DocPage = {
  slug: string;
  title: string;
  description: string;
  html: string;
  headings: { id: string; text: string; level: number }[];
  translated: boolean;
  sourcePath: string;
};

type DocsFile = { locale: Locale; pages: Record<string, DocPage> };

const docsByLocale: Record<Locale, () => Promise<{ default: DocsFile }>> = {
  en: () => import('../content/generated/docs.en.json') as Promise<{ default: DocsFile }>,
  fr: () => import('../content/generated/docs.fr.json') as Promise<{ default: DocsFile }>,
  pt: () => import('../content/generated/docs.pt.json') as Promise<{ default: DocsFile }>,
  de: () => import('../content/generated/docs.de.json') as Promise<{ default: DocsFile }>,
};

function locale(value: unknown): Locale {
  if (!isLocale(value as string)) throw new Error('Unknown locale: ' + String(value));
  return value as Locale;
}

function section(value: unknown): SectionId {
  if (!isSectionId(String(value))) throw new Error('Unknown section: ' + String(value));
  return value as SectionId;
}

export type DocsNavPayload = {
  sections: SectionNav[];
  stats: ReturnType<typeof docStats>;
  version: string;
};

export const getDocsNav = createServerFn({ method: 'GET' })
  .validator((data: { locale: string }) => data)
  .handler(async ({ data }): Promise<DocsNavPayload> => {
    const l = locale(data.locale);

    return {
      sections: sectionIds.map((id) => sectionNav(l, id)),
      stats: docStats(l),
      version: apiVersion,
    };
  });

export type TypesGroup = { category: string; entries: ApiIndexEntry[] };

export type DocPagePayload = {
  resolved: ResolvedPage;
  category: string;
  nav: SectionNav;
  pager: { previous?: NavItem; next?: NavItem };
  doc?: DocPage;
  entry?: ApiEntry;
  /** Members of a namespace, with their one-line descriptions. */
  children?: ApiIndexEntry[];
  /** Ids of documented exports named inside this entry's types, for linking them. */
  linkable?: string[];
  /** Complete authored examples using this export. */
  usage?: UsageExample[];
  types?: TypesGroup[];
  commands?: typeof cliCommands;
  options?: typeof cliOptions;
  cssProperties?: typeof cssProperties;
};

export const getDocPage = createServerFn({ method: 'GET' })
  .validator((data: { locale: string; section: string; slug: string }) => data)
  .handler(async ({ data }): Promise<DocPagePayload | null> => {
    const l = locale(data.locale);
    const s = section(data.section);
    const resolved = resolvePage(l, s, data.slug);

    if (!resolved) return null;

    const payload: DocPagePayload = {
      resolved,
      category: categoryOf(resolved),
      nav: sectionNav(l, s),
      pager: pager(l, s, data.slug),
    };

    if (resolved.kind === 'doc') {
      const file = (await docsByLocale[l]()).default;

      payload.doc = file.pages[data.slug];
    }

    if (resolved.kind !== 'special') {
      const entry = resolved.entry ? await apiEntryById(resolved.entry.id) : undefined;

      if (entry) {
        payload.entry = entry;
        payload.usage = usage[entry.id];

        const names = new Set(
          [...JSON.stringify(entry).matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map((match) => match[1]),
        );

        payload.linkable = apiEntries
          .filter(
            (candidate) =>
              candidate.id !== entry.id && names.has(candidate.id.replace(/^config\./, '')),
          )
          .map((candidate) => candidate.id);

        if (entry.children) {
          payload.children = entry.children
            .map((child) => apiEntries.find((candidate) => candidate.id === entry.id + '.' + child))
            .filter((child): child is ApiIndexEntry => Boolean(child));
        }
      }
    } else if (resolved.slug === 'types') {
      const groups = new Map<string, ApiIndexEntry[]>();

      for (const entry of apiEntries) {
        if (entry.kind !== 'type') continue;

        const category = apiCategory(entry);

        if (!groups.has(category)) groups.set(category, []);
        groups.get(category)!.push(entry);
      }

      payload.types = [...groups].map(([category, entries]) => ({ category, entries }));
    } else if (resolved.slug === 'commands') payload.commands = cliCommands;
    else if (resolved.slug === 'options') payload.options = cliOptions;
    else if (resolved.slug === 'css-properties') payload.cssProperties = cssProperties;

    return payload;
  });

export const getSearchIndex = createServerFn({ method: 'GET' })
  .validator((data: { locale: string }) => data)
  .handler(async ({ data }): Promise<SearchHit[]> => searchIndex(locale(data.locale)));
