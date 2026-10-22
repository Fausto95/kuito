import { useEffect, useState } from 'react';
import { useMessages } from '../../i18n/locale';

export type Heading = { id: string; text: string; level: number };

/** "On this page": the h2/h3 of the article, the one in view highlighted. */
export function DocsToc({ headings }: { headings: Heading[] }) {
  const t = useMessages();
  const visible = headings.filter((heading) => heading.level >= 2 && heading.level <= 4);
  const [active, setActive] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!visible.length) return;

    const elements = visible
      .map((heading) => document.getElementById(heading.id))
      .filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (inView.length) setActive(inView[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [visible.map((heading) => heading.id).join('|')]);

  if (!visible.length) return null;

  return (
    <nav className="toc" aria-label={t('docs.onThisPage')}>
      <div className="toc-title">{t('docs.onThisPage')}</div>
      <ul>
        {visible.map((heading) => (
          <li key={heading.id} data-level={heading.level}>
            <a
              href={'#' + heading.id}
              aria-current={active === heading.id ? 'location' : undefined}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
