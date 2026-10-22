import { ArrowRight, BookOpen, Boxes, Braces, Cpu, Languages, Terminal } from 'lucide-react';
import type { ComponentType } from 'react';
import { sectionIds, type SectionId } from '../../content/section-ids';
import type { SectionNav } from '../../content/sections';
import { useMessages } from '../../i18n/locale';
import type { MessageKey } from '../../i18n/messages';
import type { DocsNavPayload } from '../../server/docs';
import { DocLink } from './DocLink';
import { itemTitle } from './DocsSidebar';
import { Inline } from './Inline';
import { Callout } from './PageChrome';

export const SECTION_ICONS: Record<SectionId, ComponentType<{ size?: number }>> = {
  guides: BookOpen,
  components: Boxes,
  apis: Braces,
  architecture: Cpu,
  cli: Terminal,
  language: Languages,
};

/** `/docs`: the six sections and where to begin. */
export function DocsHub({ data }: { data: DocsNavPayload }) {
  const t = useMessages();
  const starts: { section: SectionId; slug: string }[] = [
    { section: 'guides', slug: 'introduction' },
    { section: 'guides', slug: 'apps' },
    { section: 'guides', slug: 'primitives' },
    { section: 'guides', slug: 'reactivity' },
    { section: 'language', slug: 'styles' },
    { section: 'cli', slug: 'cli' },
  ];
  const titleOf = (section: SectionId, slug: string) => {
    const nav = data.sections.find((item) => item.id === section);
    const item = nav?.categories
      .flatMap((category) => category.items)
      .find((item) => item.slug === slug);

    return item ? itemTitle(item, t) : slug;
  };

  return (
    <div className="hub">
      <header className="hub-header">
        <h1>{t('docs.title')}</h1>
        <p className="page-lead">{t('docs.lead')}</p>
        <p className="hub-stats">
          <span>
            {data.stats.pages} {t('docs.pages')}
          </span>
          <span>
            {data.stats.apis} API {t('api.exports.count')}
          </span>
          <span>kuito v{data.version}</span>
        </p>
      </header>
      <div className="section-grid">
        {sectionIds.map((id) => {
          const Icon = SECTION_ICONS[id];
          const count =
            data.sections
              .find((section) => section.id === id)
              ?.categories.reduce((sum, category) => sum + category.items.length, 0) ?? 0;

          return (
            <DocLink key={id} section={id} className="section-card">
              <span className="section-card-icon">
                <Icon size={20} />
              </span>
              <strong>{t(`section.${id}.title`)}</strong>
              <span className="section-card-tagline">{t(`section.${id}.tagline`)}</span>
              <p>{t(`section.${id}.lead`)}</p>
              <small>
                {count} {t('docs.pages')} <ArrowRight size={12} aria-hidden="true" />
              </small>
            </DocLink>
          );
        })}
      </div>
      <section className="hub-start">
        <h2>{t('docs.quickLinks')}</h2>
        <ul className="link-list">
          {starts.map((start) => (
            <li key={start.section + start.slug}>
              <DocLink section={start.section} slug={start.slug}>
                <span className="link-list-section">{t(`section.${start.section}.title`)}</span>
                <strong>{titleOf(start.section, start.slug)}</strong>
                <ArrowRight size={14} aria-hidden="true" />
              </DocLink>
            </li>
          ))}
        </ul>
      </section>
      <Callout kind="warning">{t('docs.experimental')}</Callout>
    </div>
  );
}

/** `/docs/<section>`: every page of the section by category. */
export function SectionLanding({ nav }: { nav: SectionNav }) {
  const t = useMessages();
  const Icon = SECTION_ICONS[nav.id];

  return (
    <div className="section-landing">
      <header className="hub-header">
        <span className="section-card-icon is-large">
          <Icon size={22} />
        </span>
        <h1>{t(`section.${nav.id}.title`)}</h1>
        <p className="page-lead">{t(`section.${nav.id}.lead`)}</p>
      </header>
      {nav.categories.map((category) => (
        <section key={category.id} className="landing-category" id={category.id}>
          <h2>
            {t(`category.${category.id}` as MessageKey)}{' '}
            <span className="api-count">{category.items.length}</span>
          </h2>
          <div className="card-grid">
            {category.items.map((item) => (
              <DocLink key={item.slug} section={nav.id} slug={item.slug} className="doc-card">
                <span className="doc-card-head">
                  <strong
                    className={item.kind === 'entry' || item.entryKind ? 'is-code' : undefined}
                  >
                    {itemTitle(item, t)}
                  </strong>
                  {item.entryKind && <span className="api-kind">{item.entryKind}</span>}
                  {item.translated === false && <span className="sidebar-badge">EN</span>}
                </span>
                {item.description && (
                  <p>
                    <Inline>{item.description}</Inline>
                  </p>
                )}
                <ArrowRight size={13} aria-hidden="true" className="doc-card-arrow" />
              </DocLink>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
