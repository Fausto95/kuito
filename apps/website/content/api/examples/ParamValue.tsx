// Type values passed between routes.
import type { ParamValue, RouteParams } from 'kuito';

// Builds the query part of a share link from a route's params.
function query(params: RouteParams): string {
  const pairs = Object.entries(params).map(
    ([name, value]: [string, ParamValue]) =>
      `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`,
  );

  return pairs.length ? `?${pairs.join('&')}` : '';
}

query({ id: 42, autoplay: true }); // '?id=42&autoplay=true'
