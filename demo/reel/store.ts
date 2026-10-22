import { signal } from 'kuito';
import type { Show } from './api';

/**
 * What Reel's two routes share: the shows it has listed, which the details
 * sheet looks up by id, and My List. Module signals, so a Live Patch starts
 * them over.
 */
export const shows = new Map<number, Show>();

/** My List, the last saved first. */
export const saved = signal<Show[]>([]);

/** How many details sheets are open: opening a show while one is replaces it. */
export const openSheets = signal(0);

export const isSaved = (show: Show) => saved.value.some((item) => item.id === show.id);

export function toggleSaved(show: Show) {
  saved.value = isSaved(show)
    ? saved.value.filter((item) => item.id !== show.id)
    : [show, ...saved.value];
}
