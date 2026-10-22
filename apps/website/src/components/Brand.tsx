import { Link } from '@tanstack/react-router';
import { localeParam, useLocale } from '../i18n/locale';

export function Brand({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();

  return (
    <Link
      className="brand"
      to="/{-$locale}"
      params={{ locale: localeParam(locale) }}
      aria-label="Kuito home"
    >
      <img src="/kuito-mark.svg" alt="" aria-hidden="true" width="33" height="33" />
      {!compact && (
        <span>
          kuito<span className="brand-dot">.</span>
        </span>
      )}
    </Link>
  );
}
