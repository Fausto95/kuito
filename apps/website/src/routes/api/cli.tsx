import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/api/cli')({
  beforeLoad: () => {
    throw redirect({
      to: '/{-$locale}/docs/$section/$slug',
      params: { locale: undefined, section: 'cli', slug: 'commands' },
    });
  },
});
