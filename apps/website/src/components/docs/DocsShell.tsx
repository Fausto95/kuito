import { Menu, Search, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { sectionIds, type SectionId } from '../../content/section-ids';
import type { SearchHit, SectionNav } from '../../content/sections';
import { useLocale, useMessages } from '../../i18n/locale';
import { getSearchIndex } from '../../server/docs';
import { DocLink } from './DocLink';
import { DocsSidebar } from './DocsSidebar';
import { DocsToc, type Heading } from './DocsToc';
import { SearchPalette } from './SearchPalette';

type Props = {
  section?: SectionId;
  nav?: SectionNav;
  activeSlug?: string;
  headings?: Heading[];
  /** Without a sidebar the content spans the full width (the hub and section landings). */
  wide?: boolean;
  children: ReactNode;
};

/**
 * The documentation frame: section tabs under the site header, the sidebar of the
 * current section, the article, and "on this page". Owns the search palette.
 */
export function DocsShell({ section, nav, activeSlug, headings = [], wide, children }: Props) {
  const t = useMessages();
  const locale = useLocale();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [index, setIndex] = useState<SearchHit[] | undefined>(undefined);

  async function openSearch() {
    setSearch(true);
    if (!index) setIndex(await getSearchIndex({ data: { locale } }));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing = (event.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable]',
      );

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        void openSearch();
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        void openSearch();
      }
    }

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="docs" data-wide={wide || undefined}>
      <div className="docs-subnav">
        <div className="docs-subnav-inner">
          {nav && (
            <button
              type="button"
              className="docs-menu-button"
              aria-expanded={drawer}
              onClick={() => setDrawer((value) => !value)}
            >
              {drawer ? <X size={16} /> : <Menu size={16} />} {t(`section.${nav.id}.title`)}
            </button>
          )}
          <nav className="docs-tabs" aria-label={t('docs.title')}>
            {sectionIds.map((id) => (
              <DocLink key={id} section={id} ariaCurrent={id === section ? 'page' : undefined}>
                {t(`section.${id}.title`)}
              </DocLink>
            ))}
          </nav>
          <button
            type="button"
            className="docs-search-button"
            aria-label={t('search.button')}
            onClick={openSearch}
          >
            <Search size={15} aria-hidden="true" />
            <span>{t('search.button')}</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      </div>
      <div className="docs-body">
        {nav && (
          <>
            <div
              className="docs-drawer-backdrop"
              data-open={drawer || undefined}
              onClick={() => setDrawer(false)}
            />
            <aside className="docs-sidebar" data-open={drawer || undefined}>
              <DocsSidebar nav={nav} activeSlug={activeSlug} onNavigate={() => setDrawer(false)} />
            </aside>
          </>
        )}
        <main className="docs-main" id="content">
          {children}
        </main>
        {!wide && (
          <aside className="docs-aside">
            <DocsToc headings={headings} />
          </aside>
        )}
      </div>
      <SearchPalette open={search} onClose={() => setSearch(false)} index={index} />
    </div>
  );
}
