import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SearchHit } from '../../content/sections';
import { localeParam, useLocale, useMessages } from '../../i18n/locale';
import type { MessageKey } from '../../i18n/messages';

type Props = { open: boolean; onClose: () => void; index: SearchHit[] | undefined };

function score(hit: SearchHit, query: string): number {
  const title = hit.title.toLowerCase();
  const slug = hit.slug.toLowerCase();

  if (title === query || slug === query) return 100;
  if (title.startsWith(query) || slug.startsWith(query)) return 60;
  if (title.includes(query) || slug.includes(query)) return 40;
  if (hit.description.toLowerCase().includes(query)) return 15;

  return 0;
}

export function SearchPalette({ open, onClose, index }: Props) {
  const t = useMessages();
  const locale = useLocale();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    }
  }, [open]);

  if (!open) return null;

  const needle = query.trim().toLowerCase();
  const hits =
    needle && index
      ? index
          .map((hit) => ({ hit, score: score(hit, needle) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title))
          .slice(0, 12)
          .map((item) => item.hit)
      : [];
  const selected = Math.min(cursor, Math.max(hits.length - 1, 0));

  function go(hit: SearchHit) {
    onClose();

    void navigate({
      to: '/{-$locale}/docs/$section/$slug',
      params: { locale: localeParam(locale), section: hit.section, slug: hit.slug },
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter' && hits[selected]) {
      event.preventDefault();
      go(hits[selected]);
    } else if (event.key === 'Escape') onClose();
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('search.button')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label className="palette-input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={input}
            type="search"
            value={query}
            placeholder={t('search.placeholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd>esc</kbd>
        </label>
        <ul className="palette-results" role="listbox">
          {!needle && <li className="palette-hint">{t('search.hint')}</li>}
          {needle && index && !hits.length && <li className="palette-hint">{t('search.empty')}</li>}
          {hits.map((hit, i) => (
            <li
              key={hit.section + hit.slug}
              role="option"
              aria-selected={i === selected}
              onMouseEnter={() => setCursor(i)}
            >
              <button type="button" onClick={() => go(hit)}>
                <span className={'palette-kind' + (hit.kind === 'doc' ? '' : ' is-code')}>
                  {hit.kind === 'doc' ? t(`section.${hit.section}.title`) : hit.kind}
                </span>
                <span className="palette-text">
                  <strong
                    className={hit.kind === 'doc' || hit.kind === 'special' ? undefined : 'is-code'}
                  >
                    {hit.title}
                  </strong>
                  <small>
                    {t(`section.${hit.section}.title`)} ›{' '}
                    {t(`category.${hit.category}` as MessageKey)}
                    {hit.description ? ' — ' + hit.description : ''}
                  </small>
                </span>
                {i === selected ? (
                  <CornerDownLeft size={14} aria-hidden="true" />
                ) : (
                  <ArrowRight size={14} aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t('search.navigate')}
          </span>
          <span>
            <kbd>↵</kbd> {t('search.select')}
          </span>
          <span>
            <kbd>esc</kbd> {t('search.close')}
          </span>
        </div>
      </div>
    </div>
  );
}
