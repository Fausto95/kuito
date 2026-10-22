import { pageMetadata } from '../../../lib/metadata';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { DocsShell } from '../../../components/docs/DocsShell';
import { DocsHub } from '../../../components/docs/SectionPages';
import { messages } from '../../../i18n/messages';
import { useLocale } from '../../../i18n/locale';

const docsRoute = getRouteApi('/{-$locale}/docs');

export const Route = createFileRoute('/{-$locale}/docs/')({
  head: ({ params }) => {
    const locale =
      params.locale === 'fr' || params.locale === 'pt' || params.locale === 'de'
        ? params.locale
        : 'en';

    return pageMetadata({
      title: `${messages[locale]['docs.title']} — Kuito`,
      description: messages[locale]['docs.lead'],
      locale,
      segments: ['docs'],
    });
  },
  component: Hub,
});

function Hub() {
  const data = docsRoute.useLoaderData();

  useLocale();

  return (
    <DocsShell wide>
      <DocsHub data={data} />
    </DocsShell>
  );
}
