import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { localeParam, useLocale } from '../../i18n/locale';

type Props = {
  children: string;
  /** Where a bare `#anchor` points, as `section/slug`; the current page when absent. */
  anchorsIn?: string;
};

const DOC_LINK = /^(?:docs\/)?([\w-]+)\.md(#[\w-]+)?$/;

/**
 * Inline markdown from JSDoc and the compiler tables: `code`, **bold**, [links](…).
 * Links to repository documents resolve to their pages; bare anchors stay on the page.
 */
export function Inline({ children, anchorsIn }: Props) {
  const locale = useLocale();
  const parts: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(children))) {
    if (match.index > last) parts.push(children.slice(last, match.index));

    const [whole, code, bold, text, href] = match;

    if (code) parts.push(<code key={match.index}>{code.slice(1, -1)}</code>);
    else if (bold) parts.push(<strong key={match.index}>{bold.slice(2, -2)}</strong>);
    else
      parts.push(
        <InlineLink key={match.index} href={href} anchorsIn={anchorsIn} locale={locale}>
          {text}
        </InlineLink>,
      );

    last = match.index + whole.length;
  }

  if (last < children.length) parts.push(children.slice(last));

  return <>{parts}</>;
}

function InlineLink({
  href,
  anchorsIn,
  locale,
  children,
}: {
  href: string;
  anchorsIn?: string;
  locale: ReturnType<typeof useLocale>;
  children: ReactNode;
}) {
  if (/^https?:/.test(href))
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );

  const doc = DOC_LINK.exec(href);
  const target = doc
    ? { slug: doc[1], hash: doc[2]?.slice(1) }
    : href.startsWith('#') && anchorsIn
      ? { slug: anchorsIn.split('/')[1], hash: href.slice(1), section: anchorsIn.split('/')[0] }
      : null;

  if (!target) return <a href={href}>{children}</a>;

  const section =
    'section' in target && target.section ? target.section : sectionOfDoc(target.slug);

  return (
    <Link
      to="/{-$locale}/docs/$section/$slug"
      params={{ locale: localeParam(locale), section, slug: target.slug }}
      hash={target.hash}
    >
      {children}
    </Link>
  );
}

/** Repository documents linked from descriptions, by the section docs-map.json gives them. */
function sectionOfDoc(slug: string): string {
  if (['styles', 'css-units', 'control-flow', 'naming'].includes(slug)) return 'language';

  if (
    [
      'fonts',
      'splash',
      'keyboard',
      'navigation',
      'lists',
      'motion',
      'accessibility',
      'primitives',
      'reactivity',
      'assets',
      'apps',
      'native-modules',
      'web-apis',
    ].includes(slug)
  )
    return 'guides';

  return 'apis';
}
