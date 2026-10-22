import { HeadContent, Outlet, Scripts, createRootRoute, useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { isLocale } from '../i18n/messages';
import { THEME_SCRIPT } from '../lib/theme';
import '../styles.css';
import '../docs.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Kuito — Native apps. Web simplicity.' },
      {
        name: 'description',
        content:
          'A TypeScript-first native app framework with compiled CSS, familiar Web APIs, fine-grained reactivity, and real iOS and Android views.',
      },
      { name: 'theme-color', content: '#090b12' },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/kuito-mark.svg' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700;800&display=swap',
      },
    ],
    scripts: [{ children: THEME_SCRIPT }],
  }),
  component: Root,
});

function Root() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

function Document({ children }: { children: ReactNode }) {
  const params = useParams({ strict: false }) as { locale?: string };

  return (
    <html lang={isLocale(params.locale) ? params.locale : 'en'} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
