import { useMessages } from '../../i18n/locale';
import type { UsageExample } from '../../server/docs';
import { CodeBlock } from './CodeBlock';

/** Where an export is used in the repository: the template, the demos, the documentation. */
export function UsageExamples({ examples }: { examples: UsageExample[] }) {
  const t = useMessages();

  if (!examples.length) return null;

  return (
    <section className="api-section" id="usage">
      <h2>{t('api.usage')}</h2>
      {examples.map((example) => (
        <figure key={example.file + example.line} className="usage-example">
          <CodeBlock code={example.code} lang={example.file.endsWith('.ts') ? 'ts' : 'tsx'} />
        </figure>
      ))}
    </section>
  );
}
