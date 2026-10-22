import { createFileRoute, getRouteApi, notFound, redirect } from '@tanstack/react-router';
import { DocsShell } from '../../../../components/docs/DocsShell';
import { SectionLanding } from '../../../../components/docs/SectionPages';
import { isSectionId } from '../../../../content/section-ids';
import { legacyRedirects } from '../../../../content/legacy-redirects';
import { messages } from '../../../../i18n/messages';

const docsRoute = getRouteApi('/{-$locale}/docs');

export const Route = createFileRoute('/{-$locale}/docs/$section/')({
  beforeLoad: ({ params }) => {
    if (isSectionId(params.section)) return;

    // `/docs/<slug>` addresses from before the six sections.
    const target = legacyRedirects[params.section];

    if (!target) throw notFound();

    const [path, hash] = target.split('#');
    const [section, slug] = path.split('/');

    throw redirect({
      to: '/{-$locale}/docs/$section/$slug',
      params: { locale: params.locale, section, slug },
      hash,
    });
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
