import { createFileRoute, redirect } from '@tanstack/react-router';
import componentCategories from '../../content/categories.json' with { type: 'json' };

const COMPONENTS = new Set(Object.keys(componentCategories));

/** `/api/<export>` from before the six sections: components and everything else now have their own section. */
export const Route = createFileRoute('/api/$name')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/{-$locale}/docs/$section/$slug',
      params: {
        locale: undefined,
        section: COMPONENTS.has(params.name) ? 'components' : 'apis',
        slug: params.name,
      },
    });
  },
});
