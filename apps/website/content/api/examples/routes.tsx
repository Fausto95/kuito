import { Link, navigate, present, routes, type RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    library: RouteTo;
    album: RouteTo<{ id: number }>;
    rating: RouteTo<{ album: number }, number>;
  }
}

<Link to={routes.album({ id: 42 })}>Album 42</Link>;

navigate(routes.library());

// Resolves with what the rating screen dismisses with.
const stars = await present(routes.rating({ album: 42 }));
