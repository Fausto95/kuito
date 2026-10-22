import { defaultLocale, isLocale, type Locale } from '../i18n/messages';

const siteUrl = 'https://kuito.dev';
const imageUrl = `${siteUrl}/social-card.png`;
const imageAlt = 'Kuito — Native apps. Web simplicity. TypeScript, CSS, iOS and Android.';
const ogLocales: Record<Locale, string> = {
  en: 'en_US',
  fr: 'fr_FR',
  pt: 'pt_PT',
  de: 'de_DE',
};

/** Shared by every leaf route so crawlers receive page metadata in the server HTML. */
export function pageMetadata({
  title,
  description,
  locale: localeParam,
  segments = [],
  type = 'website',
}: {
  title: string;
  description: string;
  locale?: string;
  segments?: string[];
  type?: 'website' | 'article';
}) {
  const locale = isLocale(localeParam) ? localeParam : defaultLocale;
  const path = [...(locale === defaultLocale ? [] : [locale]), ...segments]
    .map(encodeURIComponent)
    .join('/');
  const url = `${siteUrl}/${path}`;
  // Descriptions may come from Markdown/JSDoc. Social cards need plain text.
  const summary = description
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    meta: [
      { title },
      { name: 'description', content: summary },
      { property: 'og:site_name', content: 'Kuito' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: summary },
      { property: 'og:type', content: type },
      { property: 'og:url', content: url },
      { property: 'og:locale', content: ogLocales[locale] },
      { property: 'og:image', content: imageUrl },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: imageAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: summary },
      { name: 'twitter:image', content: imageUrl },
      { name: 'twitter:image:alt', content: imageAlt },
    ],
    links: [{ rel: 'canonical', href: url }],
  };
}
