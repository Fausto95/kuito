import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router';
import { DocsShell } from '../../../../components/docs/DocsShell';
import { SectionLanding } from '../../../../components/docs/SectionPages';
import { isSectionId } from '../../../../content/section-ids';
import { messages } from '../../../../i18n/messages';

const docsRoute = getRouteApi('/{-$locale}/docs');

export const Route = createFileRoute('/{-$locale}/docs/$section/')({
  beforeLoad: ({ params }) => {
    if (!isSectionId(params.section)) throw notFound();
  },
  head: ({ params }) => {
    const locale =
      params.locale === 'fr' || params.locale === 'pt' || params.locale === 'de'
        ? params.locale
        : 'en';
    const section = isSectionId(params.section) ? params.section : 'guides';

    return {
      meta: [
        { title: `${messages[locale][`section.${section}.title`]} — Kuito` },
        { name: 'description', content: messages[locale][`section.${section}.lead`] },
      ],
    };
  },
  component: Landing,
});

function Landing() {
  const { section } = Route.useParams();
  const data = docsRoute.useLoaderData();
  const nav = data.sections.find((item) => item.id === section)!;

  return (
    <DocsShell section={nav.id} nav={nav} wide>
      <SectionLanding nav={nav} />
    </DocsShell>
  );
}
