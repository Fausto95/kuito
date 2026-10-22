// Plain functions over TVMaze shows: what the screens list, and how a show reads.
import type { Show } from './api';

export interface Rail {
  id: string;
  title: string;
  shows: Show[];
}

const RAIL_LENGTH = 12;
const GENRES = ['Drama', 'Science-Fiction', 'Comedy', 'Crime', 'Action', 'Thriller'];

const rating = (show: Show) => show.rating.average ?? 0;
const withPoster = (shows: readonly Show[]) => shows.filter((show) => show.image);

/** The best rated show with a poster. */
export function featured(shows: readonly Show[]): Show | undefined {
  return [...withPoster(shows)].sort((a, b) => rating(b) - rating(a))[0];
}

/** Top rated first, then one rail per genre with enough shows to scroll. */
export function rails(shows: readonly Show[]): Rail[] {
  const posters = withPoster(shows);
  const top = [...posters].sort((a, b) => rating(b) - rating(a)).slice(0, RAIL_LENGTH);
  const genres = GENRES.map((genre) => ({
    id: genre.toLowerCase().replace(/[^a-z]/g, ''),
    title: genre.replace('-', ' '),
    shows: posters.filter((show) => show.genres.includes(genre)).slice(0, RAIL_LENGTH),
  }));

  return [{ id: 'top', title: 'Top rated', shows: top }, ...genres].filter(
    (rail) => rail.shows.length >= 3,
  );
}

export const year = (show: Show) => show.premiered?.slice(0, 4) ?? '';

/** "2008 · AMC · 60 min" */
export function details(show: Show): string {
  return [year(show), show.network?.name, show.runtime ? `${show.runtime} min` : null]
    .filter(Boolean)
    .join(' · ');
}

export const score = (show: Show) => (show.rating.average ? show.rating.average.toFixed(1) : '–');

const ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  '#39': "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

/** TVMaze summaries are HTML paragraphs. */
export function plainText(html: string | null): string {
  return (html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|quot|#39|lt|gt|nbsp);/g, (_, name: string) => ENTITIES[name] ?? '')
    .trim();
}
