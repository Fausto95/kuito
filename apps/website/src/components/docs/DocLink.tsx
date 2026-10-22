import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { SectionId } from '../../content/section-ids';
import { localeParam, useLocale } from '../../i18n/locale';

type Props = {
  section: SectionId;
  slug?: string;
  hash?: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  ariaCurrent?: 'page';
};

/** A link into the documentation of the current locale. */
export function DocLink({ section, slug, hash, className, children, onClick, ariaCurrent }: Props) {
  const locale = useLocale();
  const params = { locale: localeParam(locale), section };

  return slug ? (
    <Link
      to="/{-$locale}/docs/$section/$slug"
      params={{ ...params, slug }}
      hash={hash}
      className={className}
      onClick={onClick}
      aria-current={ariaCurrent}
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/{-$locale}/docs/$section"
      params={params}
      className={className}
      onClick={onClick}
      aria-current={ariaCurrent}
    >
      {children}
    </Link>
  );
}
