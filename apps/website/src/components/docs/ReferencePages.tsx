import { Search } from 'lucide-react';
import { useState } from 'react';
import type { cliCommands, cliOptions, cssProperties } from '../../content/sections';
import { useMessages } from '../../i18n/locale';
import type { MessageKey } from '../../i18n/messages';
import type { TypesGroup } from '../../server/docs';
import { DocLink } from './DocLink';
import { Inline } from './Inline';
import { Callout } from './PageChrome';
import cssExamples from '../../../content/api/css-examples.json';
import cliExamples from '../../../content/api/cli-examples.json';
import { CodeBlock } from './CodeBlock';

function FilterInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="filter-input">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}

export function TypesIndex({ groups }: { groups: TypesGroup[] }) {
  const t = useMessages();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        (entry) =>
          !needle ||
          entry.id.toLowerCase().includes(needle) ||
          entry.description.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.entries.length);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <div className="reference-page">
      <FilterInput value={query} onChange={setQuery} placeholder={t('api.filter') + '…'} />
      <p className="reference-count">
        {visible.reduce((sum, group) => sum + group.entries.length, 0)} {t('api.of')} {total}
      </p>
      {visible.map((group) => (
        <section key={group.category} className="api-section" id={group.category}>
          <h2>
            {t(`category.${group.category}` as MessageKey)}{' '}
            <span className="api-count">{group.entries.length}</span>
          </h2>
          <div className="api-symbol-grid">
            {group.entries.map((entry) => (
              <DocLink key={entry.id} section="apis" slug={entry.id} className="api-symbol">
                <span className="api-kind">{entry.kind}</span>
                <code>{entry.id}</code>
                {entry.description && (
                  <small>
                    <Inline>{entry.description}</Inline>
                  </small>
                )}
              </DocLink>
            ))}
          </div>
        </section>
      ))}
      {!visible.length && <p className="api-empty">{t('search.empty')}</p>}
    </div>
  );
}

export function CliCommands({ commands }: { commands: typeof cliCommands }) {
  const t = useMessages();

  return (
    <div className="reference-page">
      <p className="page-lead">{t('cli.commandsLead')}</p>
      <div className="table-scroll">
        <table className="api-table">
          <thead>
            <tr>
              <th>{t('cli.usage')}</th>
              <th>{t('api.description')}</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((command) => (
              <tr key={command.name} id={command.name}>
                <td>
                  <code>
                    npx {command.name === 'create' ? '@kuito/kuito' : 'kuito'} {command.usage}
                  </code>
                </td>
                <td>
                  <Inline>{command.summary}</Inline>
                  <p>
                    {(cliExamples as Record<string, { useCase: string }>)[command.name].useCase}
                  </p>
                  <CodeBlock
                    code={(cliExamples as Record<string, { code: string }>)[command.name].code}
                    lang="sh"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout kind="info">{t('cli.generated')}</Callout>
    </div>
  );
}

export function CliOptions({ options }: { options: typeof cliOptions }) {
  const t = useMessages();

  return (
    <div className="reference-page">
      <p className="page-lead">{t('cli.optionsLead')}</p>
      <div className="table-scroll">
        <table className="api-table">
          <thead>
            <tr>
              <th>{t('cli.flag')}</th>
              <th>{t('cli.value')}</th>
              <th>{t('cli.meaning')}</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option, i) => (
              <tr key={i}>
                <td>
                  <code>{option.flags.join(', ')}</code>
                </td>
                <td>
                  <code>{option.placeholder ?? t('cli.switch')}</code>
                </td>
                <td>
                  <Inline>{option.help}</Inline>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout kind="info">{t('cli.generated')}</Callout>
    </div>
  );
}

export function CssProperties({ properties }: { properties: typeof cssProperties }) {
  const t = useMessages();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = properties.filter(
    (property) =>
      !needle ||
      `${property.name} ${property.category} ${property.accepts}`.toLowerCase().includes(needle),
  );
  const categories = [...new Set(visible.map((property) => property.category))];

  return (
    <div className="reference-page">
      <p className="page-lead">{t('css.lead')}</p>
      <FilterInput value={query} onChange={setQuery} placeholder={t('css.search')} />
      <p className="reference-count">
        {visible.length} {t('api.of')} {properties.length}
      </p>
      {categories.map((category) => (
        <section key={category} className="api-section" id={category}>
          <h2>{category}</h2>
          <div className="table-scroll">
            <table className="api-table">
              <thead>
                <tr>
                  <th>{t('css.property')}</th>
                  <th>{t('css.accepts')}</th>
                  <th>{t('api.usage')}</th>
                </tr>
              </thead>
              <tbody>
                {visible
                  .filter((property) => property.category === category)
                  .map((property) => (
                    <tr key={property.name} id={property.name}>
                      <td>
                        <code>{property.name}</code>
                      </td>
                      <td>
                        <Inline anchorsIn="language/styles">
                          {property.accepts.replace(/\\\|/g, '|')}
                        </Inline>
                      </td>
                      <td>
                        <code>
                          {property.name}:{' '}
                          {(cssExamples as Record<string, { value: string }>)[property.name].value};
                        </code>
                        <p>
                          {
                            (cssExamples as Record<string, { useCase: string }>)[property.name]
                              .useCase
                          }
                        </p>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <Callout kind="info">{t('css.generated')}</Callout>
    </div>
  );
}
