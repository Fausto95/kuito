import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useMessages } from '../../i18n/locale';
import { highlight } from '../../lib/highlight';

/** A highlighted code block rendered from React (the API pages); markdown pages get the same markup from the generator. */
export function CodeBlock({
  code,
  lang = 'ts',
  className,
}: {
  code: string;
  lang?: string;
  className?: string;
}) {
  const t = useMessages();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <figure className={'code-block' + (className ? ' ' + className : '')} data-lang={lang}>
      <figcaption className="code-head">
        <span>{lang}</span>
        <button
          type="button"
          className="code-copy"
          onClick={copy}
          aria-label={t('copyCode')}
          title={t('copyCode')}
          data-copied={copied || undefined}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </figcaption>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
      </pre>
    </figure>
  );
}

/** Inline type text, highlighted, wrapping where it must. */
export function TypeText({ children }: { children: string }) {
  return (
    <code className="api-type" dangerouslySetInnerHTML={{ __html: highlight(children, 'ts') }} />
  );
}
