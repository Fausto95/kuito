import { createFileRoute } from '@tanstack/react-router';
import { ArrowUpRight, FlaskConical, Layers, Play } from 'lucide-react';
import { useState } from 'react';
import { DocLink } from '../../components/docs/DocLink';
import { examples, exampleUrl, type ExampleKind } from '../../content/examples';
import { useLocale, useMessages } from '../../i18n/locale';
import { messages } from '../../i18n/messages';
import { highlight } from '../../lib/highlight';

export const Route = createFileRoute('/{-$locale}/examples')({
  head: ({ params }) => {
    const locale =
      params.locale === 'fr' || params.locale === 'pt' || params.locale === 'de'
        ? params.locale
        : 'en';

    return {
      meta: [
        { title: `${messages[locale]['nav.examples']} — Kuito` },
        { name: 'description', content: messages[locale]['examples.lead'] },
      ],
    };
  },
  component: Examples,
});

const KIND_ICONS = { starter: Layers, lab: FlaskConical };

function Examples() {
  const t = useMessages();
  const locale = useLocale();
  const [kind, setKind] = useState<ExampleKind | 'all'>('all');
  const visible = examples.filter((example) => kind === 'all' || example.kind === kind);
  const filters: (ExampleKind | 'all')[] = ['all', 'starter', 'lab'];

  return (
    <div className="container inner-page examples-page">
      <div className="eyebrow">
        <span className="eyebrow-line" /> {t('examples.eyebrow').toUpperCase()}
      </div>
      <h1>
        {t('examples.title')}
        <br />
        <span>{t('examples.titleAccent')}</span>
      </h1>
      <p className="page-lead">{t('examples.lead')}</p>
      <div className="chip-row" role="group" aria-label={t('api.filter')}>
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            className="chip"
            aria-pressed={kind === filter}
            onClick={() => setKind(filter)}
          >
            {t(filter === 'all' ? 'examples.all' : `examples.${filter}`)}
          </button>
        ))}
      </div>
      <div className="example-grid">
        {visible.map((example) => {
          const Icon = KIND_ICONS[example.kind];

          return (
            <article key={example.id} className="example-card" data-kind={example.kind}>
              <div className="example-card-head">
                <span className="example-card-icon">
                  <Icon size={18} />
                </span>
                <span className="example-label">{t(`examples.${example.kind}`)}</span>
              </div>
              <h2>{example.name}</h2>
              <p>{example.description[locale]}</p>
              {example.run && (
                <pre className="example-run">
                  <code dangerouslySetInnerHTML={{ __html: highlight(example.run, 'sh') }} />
                </pre>
              )}
              <div className="example-tags">
                {example.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <a
                className="example-link"
                href={exampleUrl(example)}
                target="_blank"
                rel="noreferrer"
              >
                {example.run ? <Play size={14} aria-hidden="true" /> : null}
                {t('examples.open')} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </article>
          );
        })}
      </div>
      <div className="inner-bottom">
        {t('examples.footer')} <DocLink section="guides">{t('examples.footerLink')}</DocLink>
      </div>
    </div>
  );
}
