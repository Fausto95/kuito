import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, ChevronRight, Languages } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SectionId } from '../../content/section-ids';
import type { NavItem } from '../../content/sections';
import { localeParam, useLocale, useMessages } from '../../i18n/locale';
import type { MessageKey } from '../../i18n/messages';
import { DocLink } from './DocLink';
import { itemTitle } from './DocsSidebar';

export function Breadcrumbs({
  section,
  category,
  title,
}: {
  section: SectionId;
  category?: string;
  title: string;
}) {
  const t = useMessages();
  const locale = useLocale();

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link to="/{-$locale}/docs" params={{ locale: localeParam(locale) }}>
        {t('docs.title')}
      </Link>
      <ChevronRight size={13} aria-hidden="true" />
      <DocLink section={section}>{t(`section.${section}.title`)}</DocLink>
      {category && (
        <>
          <ChevronRight size={13} aria-hidden="true" />
          <span>{t(`category.${category}` as MessageKey)}</span>
        </>
      )}
      <ChevronRight size={13} aria-hidden="true" />
      <span aria-current="page">{title}</span>
    </nav>
  );
}

type HeaderProps = {
  title: string;
  description?: ReactNode;
  code?: boolean;
  badges?: ReactNode;
  translated?: boolean;
};

export function PageHeader({ title, description, code, badges, translated = true }: HeaderProps) {
  const t = useMessages();
  const locale = useLocale();

  return (
    <header className="page-header">
      <h1 className={code ? 'is-code' : undefined}>{title}</h1>
      {description && <p className="page-description">{description}</p>}
      <div className="page-meta">{badges}</div>
      {!translated && locale !== 'en' && (
        <div className="callout callout-info" role="note">
          <Languages size={16} aria-hidden="true" />
          <span>
            {t('docs.notTranslated')}{' '}
            <a
              href={
                typeof window === 'undefined'
                  ? '#'
                  : window.location.pathname.replace(/^\/(fr|pt|de)/, '')
              }
            >
              {t('docs.readEnglish')}
            </a>
          </span>
        </div>
      )}
    </header>
  );
}

export function DocsPager({
  section,
  previous,
  next,
}: {
  section: SectionId;
  previous?: NavItem;
  next?: NavItem;
}) {
  const t = useMessages();

  if (!previous && !next) return null;

  return (
    <nav className="pager" aria-label="Pagination">
      {previous ? (
        <DocLink section={section} slug={previous.slug} className="pager-link is-previous">
          <small>
            <ArrowLeft size={13} aria-hidden="true" /> {t('docs.previous')}
          </small>
          <strong
            className={previous.kind === 'entry' || previous.entryKind ? 'is-code' : undefined}
          >
            {itemTitle(previous, t)}
          </strong>
        </DocLink>
      ) : (
        <span />
      )}
      {next ? (
        <DocLink section={section} slug={next.slug} className="pager-link is-next">
          <small>
            {t('docs.next')} <ArrowRight size={13} aria-hidden="true" />
          </small>
          <strong className={next.kind === 'entry' || next.entryKind ? 'is-code' : undefined}>
            {itemTitle(next, t)}
          </strong>
        </DocLink>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function Callout({
  kind = 'note',
  children,
}: {
  kind?: 'note' | 'tip' | 'warning' | 'info';
  children: ReactNode;
}) {
  return (
    <div className={'callout callout-' + kind} role="note">
      {children}
    </div>
  );
}
