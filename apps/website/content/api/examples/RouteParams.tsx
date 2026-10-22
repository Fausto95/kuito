import { navigate, routes, type RouteParams, type RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    episode: RouteTo<{ show: number; season: number }>;
  }
}

// Logs every navigation with its params before it happens.
function track(route: string, params: RouteParams) {
  console.log('open', route, JSON.stringify(params));
}

const destination = routes.episode({ show: 7, season: 2 });

track(destination.route, destination.params);
navigate(destination);
