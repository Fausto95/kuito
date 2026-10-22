// TVMaze (https://www.tvmaze.com/api): a public catalog that needs no key.

const API = 'https://api.tvmaze.com';

export interface Show {
  id: number;
  name: string;
  genres: string[];
  rating: { average: number | null };
  image: { medium: string; original: string } | null;
  premiered: string | null;
  runtime: number | null;
  network: { name: string } | null;
  summary: string | null;
  status: string;
  language: string | null;
}

export interface CastMember {
  person: { id: number; name: string; image: { medium: string } | null };
  character: { id: number; name: string };
}

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(API + path, { signal });

  if (!response.ok) throw new Error(`TVMaze answered ${response.status} for ${path}`);

  return (await response.json()) as T;
}

/** 250 shows per page, by TVMaze id; an empty page past the end. */
export const fetchShows = (page: number, signal: AbortSignal) =>
  get<Show[]>(`/shows?page=${page}`, signal);

export const searchShows = (query: string, signal: AbortSignal) =>
  get<{ show: Show }[]>(`/search/shows?q=${encodeURIComponent(query)}`, signal).then((results) =>
    results.map((result) => result.show),
  );

export const fetchShow = (show: number, signal: AbortSignal) => get<Show>(`/shows/${show}`, signal);

export const fetchCast = (show: number, signal: AbortSignal) =>
  get<CastMember[]>(`/shows/${show}/cast`, signal);
