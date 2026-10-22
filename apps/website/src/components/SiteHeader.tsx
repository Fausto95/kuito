import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowUpRight, ChevronDown, Github, Languages, Menu, Moon, Sun, X } from 'lucide-react';
import { useState } from 'react';
import { sectionIds } from '../content/section-ids';
import { localeParam, useLocale, useMessages } from '../i18n/locale';
import { localeNames, locales } from '../i18n/messages';
import { setTheme, useTheme } from '../lib/theme';
import { Brand } from './Brand';

export function SiteHeader() {
  const locale = useLocale();
  const t = useMessages();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const inDocs = /^(\/(fr|pt|de))?\/docs(\/|$)/.test(pathname);

  return (
    <header className="site-header" data-menu-open={open || undefined}>
      <div className="header-inner">
        <Brand />
        <nav aria-label="Main navigation" className="nav-links">
          <div className="nav-dropdown">
            <Link
              to="/{-$locale}/docs"
              params={{ locale: localeParam(locale) }}
              className={inDocs ? 'active' : undefined}
              onClick={() => setOpen(false)}
            >
              {t('nav.docs')} <ChevronDown size={13} aria-hidden="true" />
            </Link>
            <div className="nav-dropdown-menu" role="menu">
              {sectionIds.map((section) => (
                <Link
                  key={section}
                  role="menuitem"
                  to="/{-$locale}/docs/$section"
                  params={{ locale: localeParam(locale), section }}
                  onClick={() => setOpen(false)}
                >
                  <strong>{t(`section.${section}.title`)}</strong>
                  <span>{t(`section.${section}.tagline`)}</span>
                </Link>
              ))}
            </div>
          </div>
          <Link
            to="/{-$locale}/docs/$section"
            params={{ locale: localeParam(locale), section: 'apis' }}
            onClick={() => setOpen(false)}
          >
            {t('section.apis.title')}
          </Link>
          <Link
            to="/{-$locale}/docs/$section"
            params={{ locale: localeParam(locale), section: 'architecture' }}
            onClick={() => setOpen(false)}
          >
            {t('section.architecture.title')}
          </Link>
        </nav>
        <div className="nav-actions">
          <LanguageMenu />
          <ThemeToggle />
          <a
            className="icon-button github-link"
            href="https://github.com/Fausto95/kuito"
            target="_blank"
            rel="noreferrer"
            aria-label={t('nav.github')}
          >
            <Github size={18} />
          </a>
          <Link
            to="/{-$locale}/docs/$section/$slug"
            params={{ locale: localeParam(locale), section: 'guides', slug: 'introduction' }}
            className="nav-cta"
          >
            {t('nav.getStarted')} <ArrowUpRight size={14} />
          </Link>
          <button
            type="button"
            className="icon-button menu-button"
            aria-expanded={open}
            aria-label={open ? t('nav.close') : t('nav.menu')}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const theme = useTheme();
  const t = useMessages();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={t('theme.toggle')}
      title={t(`theme.${next}`)}
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function LanguageMenu() {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const t = useMessages();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const rest = pathname.replace(/^\/(fr|pt|de)(?=\/|$)/, '') || '/';

  return (
    <div className="nav-dropdown lang-menu" data-open={open || undefined}>
      <button
        type="button"
        className="icon-button"
        aria-label={t('lang.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Languages size={17} />
        <span className="lang-code">{locale}</span>
      </button>
      <div className="nav-dropdown-menu lang-menu-list" role="menu">
        {locales.map((target) => (
          <a
            key={target}
            role="menuitem"
            href={(target === 'en' ? '' : '/' + target) + rest}
            aria-current={target === locale ? 'true' : undefined}
            lang={target}
          >
            <strong>{localeNames[target]}</strong>
          </a>
        ))}
      </div>
    </div>
  );
}
