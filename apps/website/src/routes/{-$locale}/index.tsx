import { pageMetadata } from '../../lib/metadata';
import { defaultLocale, isLocale, messages } from '../../i18n/messages';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMessages } from '../../i18n/locale';
import { highlight } from '../../lib/highlight';
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Cpu,
  Layers3,
  MoveUpRight,
  MousePointer2,
  Network,
  RadioTower,
  Terminal,
  Zap,
} from 'lucide-react';

export const Route = createFileRoute('/{-$locale}/')({
  head: ({ params }) => {
    const locale = isLocale(params.locale) ? params.locale : defaultLocale;

    return pageMetadata({
      title: `Kuito — ${messages[locale]['home.title']} ${messages[locale]['home.titleAccent']}`,
      description: messages[locale]['home.lead'],
      locale,
    });
  },
  component: Home,
});

const DOC = {
  quickstart: ['guides', 'introduction'],
  styling: ['language', 'styles'],
  'web-apis': ['guides', 'web-apis'],
  reactivity: ['guides', 'reactivity'],
  motion: ['guides', 'motion'],
} as const;

const cssExample = [
  '.card {',
  '  padding: 24px;',
  '  border-radius: 24px;',
  '  background: #171b2b;',
  '  transition: transform 300ms spring(14, 180);',
  '}',
  '',
  '.title {',
  '  font-size: 1.5rem;',
  '  color: #fff;',
  '}',
].join('\n');

const componentExample = [
  "import { VStack, Text } from 'kuito';",
  "import css from './card.css';",
  '',
  'export function Profile() {',
  '  return (',
  '    <VStack class={css.card}>',
  '      <Text class={css.title}>',
  '        Built for native.',
  '      </Text>',
  '    </VStack>',
  '  );',
  '}',
].join('\n');

const setup = ['npx @kuito/kuito create MyApp', 'cd MyApp', 'npx kuito dev ios'].join('\n');

function Home() {
  const { locale } = Route.useParams();
  const t = useMessages();
  const [count, setCount] = useState(8);
  const [tab, setTab] = useState<'css' | 'tsx'>('css');
  const [platform, setPlatform] = useState<'ios' | 'android'>('ios');
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText(setup);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <div className="announcement">
        <span className="status-dot" /> {t('home.announcement')}{' '}
        <span className="announcement-divider">/</span> {t('home.announcementMore')}{' '}
        <ArrowRight size={13} />
      </div>
      <section className="hero container">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-line" /> {t('home.eyebrow')}
            </div>
            <h1>
              {t('home.title')}
              <br />
              <span>{t('home.titleAccent')}</span>
            </h1>
            <p>{t('home.lead')}</p>
            <div className="hero-actions">
              <Link
                to="/{-$locale}/docs/$section/$slug"
                params={{ locale, section: DOC['quickstart'][0], slug: DOC['quickstart'][1] }}
                className="button button-primary"
              >
                {t('home.getStarted')} <ArrowUpRight size={17} />
              </Link>
              <a
                href="https://github.com/Fausto95/kuito"
                target="_blank"
                rel="noreferrer"
                className="button button-outline"
              >
                {t('home.github')} <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="quick-command">
              <Terminal size={16} />
              <pre>{setup}</pre>
              <button
                type="button"
                onClick={copyCommand}
                aria-label={t('home.setupCopy')}
                title={t('home.setupCopy')}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <span className="hero-note">
              {t('home.setupNote')} {t('home.notProduction')}
            </span>
          </div>
          <div className="hero-visual" aria-label={t('home.preview.label')}>
            <div className="ambient-glow" />
            <div className="phone-top-caption">
              <span className="caption-star">✳</span> {t('home.preview.caption')}
            </div>
            <div className="phone-device">
              <div className="phone-status">
                <span>9:41</span>
                <span className="phone-island" />
                <span>● ▰</span>
              </div>
              <div className="phone-ui">
                <span className="preview-pill">
                  <span className="status-dot" /> {t('home.preview.pill')}
                </span>
                <img
                  src="/kuito-mark.svg"
                  width="76"
                  height="76"
                  alt={t('home.preview.logoAlt')}
                  className="phone-cat"
                />
                <h2>
                  {t('home.preview.title')}
                  <br />
                  {t('home.preview.titleEnd')}
                </h2>
                <p>{t('home.preview.lead')}</p>
                <div className="counter-card">
                  <span>{t('home.preview.counter')}</span>
                  <div>
                    <strong>{count}</strong>
                    <button
                      type="button"
                      onClick={() => setCount((n) => n + 1)}
                      aria-label={t('home.preview.increment')}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="phone-bottom">
                  <span>{t('home.preview.explore')}</span>
                  <span>{t('home.preview.discover')}</span>
                  <span>{t('home.preview.profile')}</span>
                </div>
              </div>
            </div>
            <div className="floating-token token-a">
              <Zap size={13} /> {t('home.token.reconciler')}
            </div>
            <div className="floating-token token-b">
              <RadioTower size={13} /> {t('home.token.views')}
            </div>
          </div>
        </div>
        <div className="hero-footnote">
          <span>{t('home.footnote')}</span>
          <span>
            {t('home.scroll')} <span aria-hidden>↓</span>
          </span>
        </div>
      </section>

      <section className="intro-section container" id="features">
        <div className="section-kicker">
          <span className="section-number">01</span> {t('home.features.kicker')}
        </div>
        <div className="section-heading-row">
          <h2>
            {t('home.features.title')}
            <br />
            <span>{t('home.features.titleAccent')}</span>
          </h2>
          <p>{t('home.features.lead')}</p>
        </div>
        <div className="features-grid">
          <article className="feature-tile feature-css">
            <div className="feature-top">
              <div className="feature-icon">
                <Braces size={20} />
              </div>
              <span>{t('home.css.label')}</span>
            </div>
            <h3>
              {t('home.css.title')}
              <br />
              {t('home.css.titleEnd')}
            </h3>
            <p>{t('home.css.body')}</p>
            <div className="mini-css">
              <span>
                <i> .card</i> {'{'}
              </span>
              <span>
                &nbsp;&nbsp;<em>padding</em>: <b>24px</b>;
              </span>
              <span>
                &nbsp;&nbsp;<em>border-radius</em>: <b>16px</b>;
              </span>
              <span>
                &nbsp;&nbsp;<em>transition</em>: <b>transform 250ms</b>;
              </span>
              <span>{'}'}</span>
            </div>
            <Link
              to="/{-$locale}/docs/$section/$slug"
              params={{ locale, section: DOC['styling'][0], slug: DOC['styling'][1] }}
              className="feature-link"
            >
              {t('home.css.link')} <MoveUpRight size={16} />
            </Link>
          </article>
          <article className="feature-tile feature-web">
            <div className="feature-top">
              <div className="feature-icon">
                <Network size={20} />
              </div>
              <span>{t('home.web.label')}</span>
            </div>
            <h3>
              {t('home.web.title')}
              <br />
              {t('home.web.titleEnd')}
            </h3>
            <p>{t('home.web.body')}</p>
            <div className="api-list">
              <span>fetch()</span>
              <span>WebSocket</span>
              <span>AbortController</span>
              <span>crypto</span>
              <span>URL</span>
              <span>setTimeout()</span>
            </div>
            <Link
              to="/{-$locale}/docs/$section/$slug"
              params={{ locale, section: DOC['web-apis'][0], slug: DOC['web-apis'][1] }}
              className="feature-link"
            >
              {t('home.web.link')} <MoveUpRight size={16} />
            </Link>
          </article>
          <article className="feature-tile feature-reactivity">
            <div className="feature-top">
              <div className="feature-icon">
                <Zap size={20} />
              </div>
              <span>{t('home.signals.label')}</span>
            </div>
            <h3>
              {t('home.signals.title')}
              <br />
              {t('home.signals.titleEnd')}
            </h3>
            <p>{t('home.signals.body')}</p>
            <div className="signal-visual">
              <div className="signal-source">signal()</div>
              <div className="signal-connector">
                <span />
              </div>
              <div className="signal-sinks">
                <span>Text</span>
                <span>Opacity</span>
                <span>Position</span>
              </div>
            </div>
            <Link
              to="/{-$locale}/docs/$section/$slug"
              params={{ locale, section: DOC['reactivity'][0], slug: DOC['reactivity'][1] }}
              className="feature-link"
            >
              {t('home.signals.link')} <MoveUpRight size={16} />
            </Link>
          </article>
          <article className="feature-tile feature-motion">
            <div className="feature-top">
              <div className="feature-icon">
                <MousePointer2 size={20} />
              </div>
              <span>{t('home.motion.label')}</span>
            </div>
            <h3>
              {t('home.motion.title')}
              <br />
              {t('home.motion.titleEnd')}
            </h3>
            <p>{t('home.motion.body')}</p>
            <div className="motion-visual">
              <div className="motion-trail t1" />
              <div className="motion-trail t2" />
              <div className="motion-block">↗</div>
            </div>
            <Link
              to="/{-$locale}/docs/$section/$slug"
              params={{ locale, section: DOC['motion'][0], slug: DOC['motion'][1] }}
              className="feature-link"
            >
              {t('home.motion.link')} <MoveUpRight size={16} />
            </Link>
          </article>
        </div>
      </section>

      <section className="showcase-section">
        <div className="container">
          <div className="section-kicker">
            <span className="section-number">02</span> {t('home.styling.kicker')}
          </div>
          <div className="showcase-heading">
            <h2>
              {t('home.styling.title')}
              <br />
              <span>{t('home.styling.titleAccent')}</span>
            </h2>
            <p>{t('home.styling.lead')}</p>
          </div>
          <div className="showcase-editor">
            <div className="editor-panel">
              <div className="editor-title">
                <span className="window-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>profile</span>
                <span className="editor-filename">
                  {tab === 'css' ? 'card.css' : 'profile.tsx'}
                </span>
              </div>
              <div className="editor-tabs">
                <button
                  type="button"
                  className={tab === 'css' ? 'selected' : ''}
                  onClick={() => setTab('css')}
                >
                  card.css
                </button>
                <button
                  type="button"
                  className={tab === 'tsx' ? 'selected' : ''}
                  onClick={() => setTab('tsx')}
                >
                  profile.tsx
                </button>
              </div>
              <pre className="feature-code">
                <code
                  dangerouslySetInnerHTML={{
                    __html: highlight(tab === 'css' ? cssExample : componentExample, tab),
                  }}
                />
              </pre>
              <div className="editor-bottom">
                <span>
                  <span className="status-dot" /> {t('home.editor.compiled')}
                </span>
                <span>{t('home.editor.pipeline')}</span>
              </div>
            </div>
            <div className="result-panel">
              <div className="result-heading">
                <span>{t('home.result.heading')}</span>
                <div
                  className="platform-switch"
                  role="group"
                  aria-label={t('home.result.platform')}
                >
                  <button
                    type="button"
                    className={platform === 'ios' ? 'on' : ''}
                    onClick={() => setPlatform('ios')}
                  >
                    iOS
                  </button>
                  <button
                    type="button"
                    className={platform === 'android' ? 'on' : ''}
                    onClick={() => setPlatform('android')}
                  >
                    Android
                  </button>
                </div>
              </div>
              <div className={'result-card ' + (platform === 'android' ? 'result-android' : '')}>
                <div className="result-avatar">
                  <img src="/kuito-mark.svg" alt="" width="52" height="52" />
                </div>
                <span className="result-tag">{t('home.result.tag')}</span>
                <h3>Built for native.</h3>
                <p>{t('home.result.lead')}</p>
                <div className="result-button">
                  {t('home.result.continue')} <ArrowRight size={15} />
                </div>
              </div>
              <div className="result-disclaimer">{t('home.result.disclaimer')}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="native-section container">
        <div className="section-kicker">
          <span className="section-number">03</span> {t('home.native.kicker')}
        </div>
        <div className="native-row">
          <div>
            <h2>
              {t('home.native.title')}
              <br />
              <span>{t('home.native.titleAccent')}</span>
            </h2>
            <p>{t('home.native.lead')}</p>
            <Link
              to="/{-$locale}/docs/$section"
              params={{ locale, section: 'architecture' }}
              className="text-link"
            >
              {t('home.native.link')} <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="arch-diagram">
            <div>
              <Code2 size={20} />
              <strong>TypeScript + CSS</strong>
              <small>{t('home.arch.source')}</small>
            </div>
            <ChevronRight />
            <div>
              <Cpu size={20} />
              <strong>{t('home.arch.compiler')}</strong>
              <small>Oxc • Rolldown • hermesc</small>
            </div>
            <ChevronRight />
            <div>
              <Layers3 size={20} />
              <strong>{t('home.arch.platform')}</strong>
              <small>UIKit • Android Views</small>
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta container">
        <div className="final-cta-glow" />
        <div className="final-cta-inner">
          <img src="/kuito-mark.svg" width="62" height="62" alt="" />
          <h2>{t('home.cta.title')}</h2>
          <p>{t('home.cta.lead')}</p>
          <Link
            to="/{-$locale}/docs/$section/$slug"
            params={{ locale, section: DOC['quickstart'][0], slug: DOC['quickstart'][1] }}
            className="button button-primary"
          >
            {t('home.cta.button')} <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}
