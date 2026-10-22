import { Outlet, createFileRoute, notFound } from '@tanstack/react-router';
import { SiteFooter } from '../../components/SiteFooter';
import { SiteHeader } from '../../components/SiteHeader';
import { isLocale } from '../../i18n/messages';

/** Every page lives under an optional locale prefix: `/docs/...` is English, `/fr/docs/...` French. */
export const Route = createFileRoute('/{-$locale}')({
  beforeLoad: ({ params }) => {
    if (params.locale !== undefined && !isLocale(params.locale)) throw notFound();
  },
  component: Layout,
});

function Layout() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </div>
  );
}
