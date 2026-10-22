import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/api/css')({
  beforeLoad: () => {
    throw redirect({
      to: '/{-$locale}/docs/$section/$slug',
      params: { locale: undefined, section: 'language', slug: 'css-properties' },
    });
  },
});
