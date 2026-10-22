/**
 * The six documentation sections and how every page falls into them.
 *
 * Pure data and pure functions over the generated indexes; runs on the server
 * (the indexes never ship to the client). Category and section labels are
 * message keys, translated where they are rendered.
 */
import componentCategories from './categories.json' with { type: 'json' };
import docsMap from './docs-map.json' with { type: 'json' };
import docsIndex from './generated/docs-index.json' with { type: 'json' };
import apiIndex from './generated/api-index.json' with { type: 'json' };
import type { Locale } from '../i18n/messages';

import { isSectionId, sectionIds, type SectionId } from './section-ids';

export { isSectionId, sectionIds, type SectionId };

export type NavItem = {
  slug: string;
  title: string;
  /** What the slug resolves to; a `doc` may also carry a generated entry (merged pages). */
  kind: 'doc' | 'entry' | 'special';
  entryKind?: string;
  translated?: boolean;
  description?: string;
};

export type NavCategory = { id: string; items: NavItem[] };
export type SectionNav = { id: SectionId; categories: NavCategory[] };

type MapEntry = {
  section: string;
  category?: string;
  page?: string;
  file?: string;
  exclude?: boolean;
};

const map = Object.fromEntries(
  Object.entries(docsMap).filter(([key]) => key !== '$comment'),
) as Record<string, MapEntry>;

export type ApiIndexEntry = {
  id: string;
  name: string;
  kind: string;
  section: string;
  description: string;
  file: string | null;
  members: string[];
  children?: string[];
};

type DocsIndex = Record<
  Locale,
  Record<string, { title: string; description: string; translated: boolean }>
>;

const index = docsIndex as DocsIndex;

export const apiEntries = (apiIndex as { entries: ApiIndexEntry[] }).entries;
export const apiCounts = (apiIndex as { counts: Record<string, number> }).counts;
export const apiVersion = (apiIndex as { version: string }).version;

export const cliCommands = (
  apiIndex as { cliCommands: { name: string; usage: string; summary: string }[] }
).cliCommands;

export const cliOptions = (
  apiIndex as { cliOptions: { flags: string[]; placeholder: string | null; help: string }[] }
).cliOptions;

export const cssProperties = (
  apiIndex as { cssProperties: { name: string; category: string; accepts: string }[] }
).cssProperties;

const apiById = new Map(apiEntries.map((entry) => [entry.id, entry]));

/** Components by category, in sidebar order: `categories.json`, which the reference generator holds to the exports. */
const COMPONENT_CATEGORIES = Object.entries(componentCategories as Record<string, string>).reduce<
  Record<string, string[]>
>((byCategory, [id, category]) => {
  (byCategory[category] ??= []).push(id);
  return byCategory;
}, {});

/** Group by the task an app author is doing, including namespace members and types. */
const API_CATEGORY_RULES: [RegExp, string][] = [
  [/src\/ui\/(reactivity|store)\.ts$/, 'state-data'],
  [/(persisted|database|storage|file-system|secure-store)\.ts$/, 'storage-files'],
  [
    /^root:src\/(ui\/motion|runtime\/(animation-specs|compose|derived|effects)|ui\/animations)\.ts$/,
    'motion',
  ],
  [/^root:src\/(runtime\/gesture-specs|ui\/gestures)\.ts$/, 'gestures'],
  [/^root:src\/(ui\/navigation\.tsx|runtime\/routes\.ts)$/, 'navigation'],
  [/(define-module|modules|schema|scope|views)\.ts$/, 'module-authoring'],
  [/(action-sheet|alert|prompt|share|dialog|clipboard|haptics)\.ts$/, 'dialogs-feedback'],
  [/(camera|video|webview|audio|image|image-picker|media-picker|fonts)\.ts$/, 'media-playback'],
  [/(accessibility|localization)\.ts$/, 'accessibility-language'],
  [/(permissions|location|notifications|background-tasks)\.ts$/, 'device-services'],
  [/(network|linking)\.ts$/, 'network-links'],
  [
    /(app|appearance|brightness|device|keep-awake|keyboard|splash|window|system-bars)\.ts$/,
    'app-device',
  ],
  [/^global:/, 'javascript-utilities'],
  [/^config:/, 'config'],
  [/^tests:/, 'quality'],
  [/^root:/, 'elements-styles'],
];

export const SECTION_CATEGORIES: Record<SectionId, string[]> = {
  guides: [
    'start',
    'state-data',
    'screens',
    'navigation',
    'motion',
    'device-workflows',
    'module-authoring',
    'quality',
    'release',
    'contributing',
  ],
  components: [...Object.keys(COMPONENT_CATEGORIES), 'other'],
  apis: [
    'state-data',
    'storage-files',
    'network-links',
    'javascript-utilities',
    'motion',
    'gestures',
    'navigation',
    'dialogs-feedback',
    'media-playback',
    'device-services',
    'app-device',
    'accessibility-language',
    'elements-styles',
    'module-authoring',
    'config',
    'quality',
    'types',
  ],
  architecture: ['design', 'compiler', 'rendering'],
  cli: ['overview', 'reference'],
  language: ['tsx', 'css'],
};

export function apiCategory(entry: ApiIndexEntry): string {
  if (entry.kind === 'component') {
    return (
      Object.keys(COMPONENT_CATEGORIES).find((category) =>
        COMPONENT_CATEGORIES[category].includes(entry.id),
      ) ?? 'other'
    );
  }

  if (
    /^global\.(fetch|Headers|HeadersInit|BodyInit|RequestInit|Response|WebSocket|URL|URLSearchParams)$/.test(
      entry.id,
    )
  )
    return 'network-links';

  const key = `${entry.section}:${entry.file ?? ''}`;

  return API_CATEGORY_RULES.find(([pattern]) => pattern.test(key))?.[1] ?? 'module-authoring';
}

export const sectionOfEntry = (entry: ApiIndexEntry): SectionId =>
  entry.kind === 'component' ? 'components' : 'apis';

/** The documentation slug merged into a generated page, if any. */
const mergedDocOf = new Map(
  Object.entries(map)
    .filter(([, entry]) => entry.page)
    .map(([slug, entry]) => [entry.page as string, slug]),
);

function docItem(locale: Locale, pageSlug: string): NavItem {
  const page = index[locale][pageSlug];

  return {
    slug: pageSlug,
    title: page.title,
    kind: 'doc',
    translated: page.translated,
    description: page.description,
  };
}

function entryItem(locale: Locale, entry: ApiIndexEntry): NavItem {
  const merged = mergedDocOf.get(entry.id);

  return merged
    ? { ...docItem(locale, entry.id), entryKind: entry.kind }
    : {
        slug: entry.id,
        title: entry.id,
        kind: 'entry',
        entryKind: entry.kind,
        description: entry.description,
      };
}

/** Sidebar entries for the APIs section: namespaces but not their members, no types. */
function apiSidebarEntries(): ApiIndexEntry[] {
  return apiEntries.filter(
    (entry) =>
      entry.kind !== 'component' &&
      entry.kind !== 'type' &&
      !(entry.section === 'native' && entry.kind !== 'namespace'),
  );
}

export function sectionNav(locale: Locale, section: SectionId): SectionNav {
  const categories = new Map<string, NavItem[]>(SECTION_CATEGORIES[section].map((id) => [id, []]));
  const push = (category: string, item: NavItem) => {
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category)!.push(item);
  };

  for (const [slug, entry] of Object.entries(map)) {
    if (entry.section !== section || entry.page || entry.exclude) continue;
    push(entry.category ?? 'other', docItem(locale, slug));
  }

  if (section === 'components') {
    for (const [category, ids] of Object.entries(COMPONENT_CATEGORIES)) {
      for (const id of ids) {
        const entry = apiById.get(id);

        if (entry) push(category, entryItem(locale, entry));
      }
    }

    for (const entry of apiEntries) {
      if (entry.kind === 'component' && apiCategory(entry) === 'other')
        push('other', entryItem(locale, entry));
    }
  }

  if (section === 'apis') {
    for (const entry of apiSidebarEntries()) push(apiCategory(entry), entryItem(locale, entry));
    push('types', { slug: 'types', title: 'types', kind: 'special' });
  }

  if (section === 'cli') {
    push('reference', { slug: 'commands', title: 'commands', kind: 'special' });
    push('reference', { slug: 'options', title: 'options', kind: 'special' });
  }

  if (section === 'language')
    push('css', { slug: 'css-properties', title: 'css-properties', kind: 'special' });

  return {
    id: section,
    categories: [...categories]
      .filter(([, items]) => items.length)
      .map(([id, items]) => ({ id, items })),
  };
}

export function flatNav(locale: Locale, section: SectionId): NavItem[] {
  return sectionNav(locale, section).categories.flatMap((category) => category.items);
}

export type ResolvedPage =
  | { kind: 'doc'; section: SectionId; slug: string; entry?: ApiIndexEntry }
  | { kind: 'entry'; section: SectionId; slug: string; entry: ApiIndexEntry }
  | {
      kind: 'special';
      section: SectionId;
      slug: 'types' | 'commands' | 'options' | 'css-properties';
    };

export function resolvePage(
  locale: Locale,
  section: SectionId,
  slug: string,
): ResolvedPage | undefined {
  const page = index[locale][slug];
  const mapped = Object.entries(map).find(([key, entry]) => (entry.page ?? key) === slug);

  if (page && mapped && mapped[1].section === section) {
    return { kind: 'doc', section, slug, entry: apiById.get(slug) };
  }

  const entry = apiById.get(slug);

  if (entry && sectionOfEntry(entry) === section) return { kind: 'entry', section, slug, entry };
  if (section === 'apis' && slug === 'types') return { kind: 'special', section, slug };

  if (section === 'cli' && (slug === 'commands' || slug === 'options'))
    return { kind: 'special', section, slug };

  if (section === 'language' && slug === 'css-properties')
    return { kind: 'special', section, slug };

  return undefined;
}

export function pager(
  locale: Locale,
  section: SectionId,
  slug: string,
): { previous?: NavItem; next?: NavItem } {
  const items = flatNav(locale, section);
  const at = items.findIndex((item) => item.slug === slug);

  if (at < 0) return {};

  return { previous: items[at - 1], next: items[at + 1] };
}

/** Where a page outside the sidebar (a type, a namespace member) sits, for breadcrumbs. */
export function categoryOf(resolved: ResolvedPage): string {
  if (resolved.kind === 'special')
    return resolved.slug === 'types'
      ? 'types'
      : resolved.slug === 'css-properties'
        ? 'css'
        : 'reference';

  if (resolved.kind === 'entry')
    return resolved.entry.kind === 'type' ? 'types' : apiCategory(resolved.entry);

  if (resolved.entry) return apiCategory(resolved.entry);

  const mapped = Object.entries(map).find(([key, entry]) => (entry.page ?? key) === resolved.slug);

  return mapped?.[1].category ?? 'other';
}

export type SearchHit = {
  section: SectionId;
  slug: string;
  title: string;
  description: string;
  category: string;
  kind: string;
};

export function searchIndex(locale: Locale): SearchHit[] {
  const hits: SearchHit[] = [];

  for (const section of sectionIds) {
    for (const category of sectionNav(locale, section).categories) {
      for (const item of category.items) {
        const page = index[locale][item.slug];
        const entry = apiById.get(item.slug);

        hits.push({
          section,
          slug: item.slug,
          title: item.title,
          category: category.id,
          kind: item.entryKind ?? item.kind,
          description: page?.description ?? entry?.description ?? '',
        });
      }
    }
  }

  for (const entry of apiEntries) {
    if (hits.some((hit) => hit.slug === entry.id && hit.section === sectionOfEntry(entry)))
      continue;

    hits.push({
      section: sectionOfEntry(entry),
      slug: entry.id,
      title: entry.id,
      category: entry.kind === 'type' ? 'types' : apiCategory(entry),
      kind: entry.kind,
      description: entry.description,
    });
  }

  return hits;
}

export function docStats(locale: Locale) {
  const pages = Object.values(index[locale]);

  return {
    pages: pages.length,
    translated: pages.filter((page) => page.translated).length,
    apis: apiEntries.length,
  };
}
