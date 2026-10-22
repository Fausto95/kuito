import { createFileRoute, redirect } from '@tanstack/react-router';

/** The reference moved under the documentation; this keeps the PR's `/api` address working. */
export const Route = createFileRoute('/api/')({
  beforeLoad: () => {
    throw redirect({
      to: '/{-$locale}/docs/$section',
      params: { locale: undefined, section: 'apis' },
    });
  },
});
