import { useMessages } from '../../i18n/locale';
import type { UsageExample } from '../../server/docs';
import { CodeBlock } from './CodeBlock';
import { Inline } from './Inline';
import { DocLink } from './DocLink';

/** Complete, checked examples written for readers. */
export function UsageExamples({ examples }: { examples: UsageExample[] }) {
  const t = useMessages();

  if (!examples.length) return null;

  return (
    <section className="api-section" id="usage">
      <h2>{t('api.usage')}</h2>
      {examples.map((example) => (
        <figure key={example.file + example.line} className="usage-example">
          <figcaption>
            <h3>{example.title}</h3>
            {example.context && (
              <p>
                <Inline>{example.context}</Inline>
              </p>
            )}
            {example.via && (
              <p>
                {t('api.exampleVia')}{' '}
                <DocLink section={example.viaSection ?? 'apis'} slug={example.via}>
                  {example.via}
                </DocLink>
              </p>
            )}
          </figcaption>
          <CodeBlock code={example.code} lang={example.file.endsWith('.ts') ? 'ts' : 'tsx'} />
        </figure>
      ))}
    </section>
  );
}
