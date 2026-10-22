import { useParams } from '@tanstack/react-router';
import { defaultLocale, isLocale, messages, type Locale, type MessageKey } from './messages';

/** The locale of the current route; English when the URL carries none. */
export function useLocale(): Locale {
  const params = useParams({ strict: false }) as { locale?: string };

  return isLocale(params.locale) ? params.locale : defaultLocale;
}

export function useMessages() {
  const locale = useLocale();

  return (key: MessageKey) => messages[locale][key];
}

/** The `{-$locale}` route param: absent for English, so English URLs have no prefix. */
export const localeParam = (locale: Locale): string | undefined =>
  locale === defaultLocale ? undefined : locale;

export const localePrefix = (locale: Locale): string =>
  locale === defaultLocale ? '' : '/' + locale;
