import { pageMetadata } from '../../../../lib/metadata';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { ApiEntryView, entryHeadings } from '../../../../components/docs/ApiEntryView';
import { Article } from '../../../../components/docs/Article';
import { DocLink } from '../../../../components/docs/DocLink';
import { DocsShell } from '../../../../components/docs/DocsShell';
import { Breadcrumbs, DocsPager, PageHeader } from '../../../../components/docs/PageChrome';
import { Inline } from '../../../../components/docs/Inline';
import {
  CliCommands,
  CliOptions,
  CssProperties,
  TypesIndex,
} from '../../../../components/docs/ReferencePages';
import { UsageExamples } from '../../../../components/docs/UsageExamples';
import { isSectionId } from '../../../../content/section-ids';
import { useMessages } from '../../../../i18n/locale';
import { defaultLocale, isLocale, messages, type MessageKey } from '../../../../i18n/messages';
import { getDocPage, type DocPagePayload } from '../../../../server/docs';

export const Route = createFileRoute('/{-$locale}/docs/$section/$slug')({
  loader: async ({ params }) => {
    if (!isSectionId(params.section)) throw notFound();

    const locale = isLocale(params.locale) ? params.locale : defaultLocale;
    const page = await getDocPage({ data: { locale, section: params.section, slug: params.slug } });

    if (!page) throw notFound();

    return page;
  },
  head: ({ loaderData, params }) => {
    const locale = isLocale(params.locale) ? params.locale : defaultLocale;
    const title = pageTitle(loaderData, (key) => messages[locale][key]);

    if (!loaderData) return {};

    return pageMetadata({
      title: `${title} — Kuito ${messages[locale]['docs.title']}`,
      description:
        loaderData.doc?.description ||
        loaderData.entry?.description ||
        messages[locale][`section.${loaderData.resolved.section}.lead`],
      locale,
      segments: ['docs', loaderData.resolved.section, loaderData.resolved.slug],
      type: 'article',
    });
  },
  component: Page,
  notFoundComponent: NotFound,
});

function pageTitle(page: DocPagePayload | undefined, t: (key: MessageKey) => string): string {
  if (!page) return t('docs.title');

  if (page.resolved.kind === 'special') {
    return {
      types: t('api.allTypes'),
      commands: t('cli.commands'),
      options: t('cli.options'),
      'css-properties': t('css.title'),
    }[page.resolved.slug];
  }

  if (page.entry) return page.entry.id;

  return page.doc?.title ?? page.resolved.slug;
}

function Page() {
  const page = Route.useLoaderData();
  const t = useMessages();
  const { resolved, doc, entry, nav, pager, category } = page;
  const title = pageTitle(page, t);
  const headings = [
    ...(doc?.headings ?? []),
    ...(!doc && page.usage?.length ? [{ id: 'usage', text: t('api.usage'), level: 2 }] : []),
    ...(entry ? entryHeadings(entry, t) : []),
  ];
  const kindLabel = entry ? t(`api.kind.${entry.kind}` as MessageKey) : undefined;

  return (
    <DocsShell section={resolved.section} nav={nav} activeSlug={resolved.slug} headings={headings}>
      <article className="doc-page">
        <Breadcrumbs section={resolved.section} category={category} title={title} />
        <PageHeader
          title={title}
          code={Boolean(entry)}
          description={
            doc || !entry?.description ? undefined : <Inline>{entry.description}</Inline>
          }
          translated={doc?.translated ?? true}
          badges={
            <>
              {kindLabel && <span className="badge badge-kind">{kindLabel}</span>}
              {doc && (
                <span className="badge">
                  {doc.words} {t('docs.words')}
                </span>
              )}
            </>
          }
        />
        {doc && <Article html={doc.html} />}
        {entry && (
          <>
            {!doc && <UsageExamples examples={page.usage ?? []} />}
            {doc && (
              <h2 className="api-reference-heading" id="reference">
                {t('api.reference')}
              </h2>
            )}
            <ApiEntryView entry={entry} children={page.children} linkable={page.linkable ?? []} />
          </>
        )}
        {resolved.kind === 'special' && resolved.slug === 'types' && page.types && (
          <TypesIndex groups={page.types} />
        )}
        {resolved.kind === 'special' && resolved.slug === 'commands' && page.commands && (
          <CliCommands commands={page.commands} />
        )}
        {resolved.kind === 'special' && resolved.slug === 'options' && page.options && (
          <CliOptions options={page.options} />
        )}
        {resolved.kind === 'special' &&
          resolved.slug === 'css-properties' &&
          page.cssProperties && <CssProperties properties={page.cssProperties} />}
        <DocsPager section={resolved.section} previous={pager.previous} next={pager.next} />
      </article>
    </DocsShell>
  );
}

function NotFound() {
  const t = useMessages();

  return (
    <DocsShell wide>
      <div className="doc-page">
        <h1>{t('notFound.title')}</h1>
        <p className="page-lead">{t('notFound.lead')}</p>
        <DocLink section="guides">{t('notFound.docs')}</DocLink>
      </div>
    </DocsShell>
  );
}
