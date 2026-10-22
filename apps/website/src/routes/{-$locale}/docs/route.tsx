import { Outlet, createFileRoute } from '@tanstack/react-router';
import { defaultLocale, isLocale } from '../../../i18n/messages';
import { getDocsNav } from '../../../server/docs';

/** Loads the navigation of every section once per locale; the pages underneath read it from this route. */
export const Route = createFileRoute('/{-$locale}/docs')({
  loader: ({ params }) =>
    getDocsNav({ data: { locale: isLocale(params.locale) ? params.locale : defaultLocale } }),
  component: Outlet,
});
