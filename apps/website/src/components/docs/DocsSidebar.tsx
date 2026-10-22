import { ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { NavCategory, SectionNav } from '../../content/sections';
import { useMessages } from '../../i18n/locale';
import type { MessageKey } from '../../i18n/messages';
import { DocLink } from './DocLink';

type Props = { nav: SectionNav; activeSlug?: string; onNavigate?: () => void };

/** The title a sidebar item shows: documents carry their own, generated pages their export name. */
export function itemTitle(
  item: NavCategory['items'][number],
  t: (key: MessageKey) => string,
): string {
  if (item.kind === 'special') {
    return item.slug === 'types'
      ? t('api.allTypes')
      : item.slug === 'commands'
        ? t('cli.commands')
        : item.slug === 'options'
          ? t('cli.options')
          : t('css.title');
  }

  return item.title;
}

export function DocsSidebar({ nav, activeSlug, onNavigate }: Props) {
  const t = useMessages();
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    root.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeSlug]);

  return (
    <nav ref={root} className="sidebar-nav" aria-label={t('docs.sidebar')}>
      <DocLink section={nav.id} className="sidebar-section-title" onClick={onNavigate}>
        {t(`section.${nav.id}.title`)}
      </DocLink>
      {nav.categories.map((category) => {
        const containsActive = category.items.some((item) => item.slug === activeSlug);

        return (
          <details
            key={category.id}
            className="sidebar-category"
            open={containsActive || nav.categories.length <= 3 || undefined}
          >
            <summary>
              <ChevronRight size={14} aria-hidden="true" />
              {t(`category.${category.id}` as MessageKey)}
            </summary>
            <ul>
              {category.items.map((item) => (
                <li key={item.slug}>
                  <DocLink
                    section={nav.id}
                    slug={item.slug}
                    onClick={onNavigate}
                    ariaCurrent={item.slug === activeSlug ? 'page' : undefined}
                    className={item.kind === 'entry' || item.entryKind ? 'sidebar-code' : undefined}
                  >
                    {itemTitle(item, t)}
                    {item.translated === false && (
                      <span className="sidebar-badge" title={t('docs.notTranslated')}>
                        EN
                      </span>
                    )}
                  </DocLink>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}
