import { Link } from '@tanstack/react-router';
import { localeParam, useLocale, useMessages } from '../i18n/locale';
import { Brand } from './Brand';

export function SiteFooter() {
  const locale = useLocale();
  const t = useMessages();
  const params = { locale: localeParam(locale) };

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div>
          <Brand />
          <p>{t('footer.tagline')}</p>
        </div>
        <div className="footer-links">
          <div>
            <span>{t('footer.learn')}</span>
            <Link to="/{-$locale}/docs" params={params}>
              {t('footer.documentation')}
            </Link>
            <Link to="/{-$locale}/docs/$section" params={{ ...params, section: 'apis' }}>
              {t('footer.apiReference')}
            </Link>
            <Link to="/{-$locale}/examples" params={params}>
              {t('footer.examples')}
            </Link>
            <Link
              to="/{-$locale}/docs/$section/$slug"
              params={{ ...params, section: 'guides', slug: 'introduction' }}
            >
              {t('footer.quickstart')}
            </Link>
          </div>
          <div>
            <span>{t('footer.project')}</span>
            <a href="https://github.com/Fausto95/kuito" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link to="/{-$locale}/docs/$section" params={{ ...params, section: 'architecture' }}>
              {t('footer.architecture')}
            </Link>
            <Link
              to="/{-$locale}/docs/$section/$slug"
              params={{ ...params, section: 'guides', slug: 'contributing' }}
            >
              {t('footer.contribute')}
            </Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>{t('footer.copyright')}</span>
        <span>{t('footer.status')}</span>
      </div>
    </footer>
  );
}
