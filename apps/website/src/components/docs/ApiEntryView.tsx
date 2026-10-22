import type { ApiEntry, ApiMember, ApiParameter, ApiSignature } from '../../content/api';
import type { ApiIndexEntry } from '../../content/sections';
import { useMessages } from '../../i18n/locale';
import type { MessageKey } from '../../i18n/messages';
import { tokenize } from '../../lib/highlight';
import { CodeBlock } from './CodeBlock';
import { DocLink } from './DocLink';
import { Inline } from './Inline';
import { Callout } from './PageChrome';

type Props = { entry: ApiEntry; children?: ApiIndexEntry[]; linkable: string[] };

/** A type expression, highlighted, with every identifier that has a reference page linked to it. */
function LinkedType({ children, linkable }: { children: string; linkable: string[] }) {
  return (
    <code className="api-type">
      {tokenize(children, 'ts').map((token, i) => {
        if (token.cls !== 'type')
          return token.cls ? (
            <span key={i} className={'tok-' + token.cls}>
              {token.text}
            </span>
          ) : (
            token.text
          );

        const target = linkable.includes(token.text)
          ? token.text
          : linkable.includes('config.' + token.text)
            ? 'config.' + token.text
            : null;

        return target ? (
          <DocLink key={i} section="apis" slug={target} className="api-type-link">
            <span className="tok-type">{token.text}</span>
          </DocLink>
        ) : (
          <span key={i} className="tok-type">
            {token.text}
          </span>
        );
      })}
    </code>
  );
}

function Tags({ tags }: { tags: { name: string; text: string }[] }) {
  if (!tags?.length) return null;

  return (
    <div className="api-tags">
      {tags.map((tag, i) => (
        <span key={tag.name + i}>
          <strong>@{tag.name}</strong> <Inline>{tag.text}</Inline>
        </span>
      ))}
    </div>
  );
}

function Parameters({ parameters, linkable }: { parameters: ApiParameter[]; linkable: string[] }) {
  const t = useMessages();

  if (!parameters?.length) return <p className="api-empty">{t('api.noParameters')}</p>;

  return (
    <div className="table-scroll">
      <table className="api-table">
        <thead>
          <tr>
            <th>{t('api.name')}</th>
            <th>{t('api.type')}</th>
            <th>{t('api.required')}</th>
            <th>{t('api.description')}</th>
          </tr>
        </thead>
        <tbody>
          {parameters.map((param, i) => (
            <tr key={param.name + i}>
              <td>
                <code>
                  {param.rest ? '...' : ''}
                  {param.name}
                </code>
              </td>
              <td>
                <LinkedType linkable={linkable}>{param.type}</LinkedType>
              </td>
              <td>{param.optional ? t('api.no') : t('api.yes')}</td>
              <td>
                {param.description ? <Inline>{param.description}</Inline> : '—'}
                {param.default !== undefined && (
                  <div className="api-default">
                    {t('api.default')}: <code>{param.default}</code>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Signatures({
  signatures,
  linkable,
  title,
  id,
  prefix = '',
  nested = false,
}: {
  signatures: ApiSignature[];
  linkable: string[];
  title?: string;
  id?: string;
  prefix?: string;
  nested?: boolean;
}) {
  const t = useMessages();

  if (!signatures?.length) return null;

  return (
    <section className={nested ? 'api-nested' : 'api-section'} id={id}>
      {nested ? <h4>{title ?? t('api.signatures')}</h4> : <h2>{title ?? t('api.signatures')}</h2>}
      {signatures.map((sig, i) => {
        const at = prefix + (signatures.length > 1 ? `overload-${i + 1}-` : '');

        return (
          <div
            className="api-signature"
            key={i}
            id={signatures.length > 1 ? `${prefix}overload-${i + 1}` : undefined}
          >
            {signatures.length > 1 && (
              <h3 className="api-overload">
                {t('api.overload')} {i + 1}
              </h3>
            )}
            <CodeBlock code={sig.signature} lang="ts" className="is-signature" />
            {sig.typeParameters.length > 0 && (
              <>
                <h4 id={at + 'type-parameters'}>{t('api.typeParameters')}</h4>
                <div className="table-scroll">
                  <table className="api-table">
                    <thead>
                      <tr>
                        <th>{t('api.name')}</th>
                        <th>{t('api.constraint')}</th>
                        <th>{t('api.default')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sig.typeParameters.map((g) => (
                        <tr key={g.name}>
                          <td>
                            <code>{g.name}</code>
                          </td>
                          <td>
                            {g.constraint ? (
                              <LinkedType linkable={linkable}>{g.constraint}</LinkedType>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {g.default ? (
                              <LinkedType linkable={linkable}>{g.default}</LinkedType>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <h4 id={at + 'parameters'}>{t('api.parameters')}</h4>
            <Parameters parameters={sig.parameters} linkable={linkable} />
            <h4 id={at + 'returns'}>{t('api.returns')}</h4>
            <p>
              <LinkedType linkable={linkable}>{sig.returns}</LinkedType>
            </p>
          </div>
        );
      })}
    </section>
  );
}

function Members({
  members,
  title,
  id,
  linkable,
  depth = 0,
}: {
  members: ApiMember[];
  title: string;
  id?: string;
  linkable: string[];
  depth?: number;
}) {
  const t = useMessages();

  if (!members?.length) return null;

  const nested =
    depth < 2
      ? members.filter((member) => member.overloads?.length || member.children?.length)
      : [];

  return (
    <section className={depth ? 'api-nested' : 'api-section'} id={id}>
      {depth ? (
        <h4>{title}</h4>
      ) : (
        <h2>
          {title} <span className="api-count">{members.length}</span>
        </h2>
      )}
      <div className="table-scroll">
        <table className="api-table api-members">
          <thead>
            <tr>
              <th>{t('api.name')}</th>
              <th>{t('api.type')}</th>
              <th>{t('api.required')}</th>
              <th>{t('api.description')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member, i) => (
              <tr key={member.name + i} id={depth ? undefined : 'prop-' + member.name}>
                <td>
                  <code>{member.name}</code>
                  {member.readonly && <span className="api-qualifier">{t('api.readonly')}</span>}
                </td>
                <td>
                  <LinkedType linkable={linkable}>{member.type}</LinkedType>
                </td>
                <td>{member.optional ? t('api.no') : t('api.yes')}</td>
                <td>
                  {member.description ? <Inline>{member.description}</Inline> : '—'}
                  {member.default !== undefined && (
                    <div className="api-default">
                      {t('api.default')}: <code>{member.default}</code>
                    </div>
                  )}
                  <Tags tags={member.tags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nested.map((member) => (
        <details className="api-details" key={member.name}>
          <summary>
            <code>{member.name}</code> —{' '}
            {member.overloads?.length ? t('api.methodSignatures') : t('api.nestedFields')}
          </summary>
          {member.overloads?.length ? (
            <Signatures signatures={member.overloads} linkable={linkable} nested />
          ) : null}
          {member.children?.length ? (
            <Members
              members={member.children}
              title={`${member.name} ${t('api.fields')}`}
              linkable={linkable}
              depth={depth + 1}
            />
          ) : null}
        </details>
      ))}
    </section>
  );
}

/** The outline of an entry page for "on this page", so the TOC is data, not a DOM scan. */
export function entryHeadings(entry: ApiEntry, t: (key: MessageKey) => string) {
  const headings: { id: string; text: string; level: number }[] = [];
  const signatureOutline = (signatures: ApiSignature[], prefix: string) => {
    if (signatures.length > 1) {
      signatures.forEach((_, i) =>
        headings.push({
          id: `${prefix}overload-${i + 1}`,
          text: `${t('api.overload')} ${i + 1}`,
          level: 3,
        }),
      );

      return;
    }

    if (signatures[0].typeParameters.length)
      headings.push({ id: prefix + 'type-parameters', text: t('api.typeParameters'), level: 3 });

    headings.push({ id: prefix + 'parameters', text: t('api.parameters'), level: 3 });
    headings.push({ id: prefix + 'returns', text: t('api.returns'), level: 3 });
  };

  if (entry.kind === 'namespace')
    headings.push({ id: 'exports', text: t('api.exports'), level: 2 });

  if ((entry.kind === 'type' || entry.kind === 'enum') && entry.declaration)
    headings.push({ id: 'declaration', text: t('api.declaration'), level: 2 });

  if (entry.overloads.length) {
    headings.push({ id: 'signatures', text: t('api.signatures'), level: 2 });
    signatureOutline(entry.overloads, '');
  }

  if (entry.constructors?.length) {
    headings.push({ id: 'constructors', text: t('api.constructors'), level: 2 });
    signatureOutline(entry.constructors, 'constructor-');
  }

  if (entry.members.length)
    headings.push({
      id: 'members',
      text:
        entry.kind === 'component'
          ? t('api.props')
          : entry.kind === 'type'
            ? t('api.members')
            : t('api.properties'),
      level: 2,
    });

  if (
    entry.kind !== 'namespace' &&
    entry.kind !== 'component' &&
    !entry.overloads.length &&
    !entry.members.length
  )
    headings.push({ id: 'type', text: t('api.type'), level: 2 });

  return headings;
}

export function ApiEntryView({ entry, children, linkable }: Props) {
  const t = useMessages();

  return (
    <div className="api-entry">
      <Tags tags={entry.tags} />
      {entry.kind === 'namespace' && (
        <section className="api-section" id="exports">
          <h2>
            {t('api.exports')}{' '}
            <span className="api-count">{children?.length ?? entry.children?.length ?? 0}</span>
          </h2>
          <p>{t('api.exportsLead')}</p>
          <div className="api-symbol-grid">
            {(children ?? []).map((child) => (
              <DocLink key={child.id} section="apis" slug={child.id} className="api-symbol">
                <span className="api-kind">{child.kind}</span>
                <code>{child.name}</code>
                {child.description && (
                  <small>
                    <Inline>{child.description}</Inline>
                  </small>
                )}
              </DocLink>
            ))}
          </div>
        </section>
      )}
      {(entry.kind === 'type' || entry.kind === 'enum') && entry.declaration && (
        <section className="api-section" id="declaration">
          <h2>{t('api.declaration')}</h2>
          <CodeBlock code={entry.declaration} lang="ts" className="is-declaration" />
        </section>
      )}
      <Signatures id="signatures" signatures={entry.overloads} linkable={linkable} />
      {entry.constructors?.length ? (
        <Signatures
          id="constructors"
          prefix="constructor-"
          signatures={entry.constructors}
          linkable={linkable}
          title={t('api.constructors')}
        />
      ) : null}
      {entry.kind === 'component' && entry.propsType && (
        <p className="api-props-type">
          {t('api.props')}: <LinkedType linkable={linkable}>{entry.propsType}</LinkedType>
        </p>
      )}
      <Members
        id="members"
        linkable={linkable}
        members={entry.members}
        title={
          entry.kind === 'component'
            ? `${t('api.props')} (${t('api.propsInherited')})`
            : entry.kind === 'type'
              ? t('api.members')
              : t('api.properties')
        }
      />
      {entry.kind !== 'namespace' &&
        entry.kind !== 'component' &&
        !entry.overloads.length &&
        !entry.members.length && (
          <section className="api-section" id="type">
            <h2>{t('api.type')}</h2>
            <CodeBlock code={entry.type} lang="ts" />
          </section>
        )}
      <Callout kind="info">{t('api.generated')}</Callout>
    </div>
  );
}
