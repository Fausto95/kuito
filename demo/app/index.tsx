import { SafeArea, navigate, resource, routes, signal, task, type RouteOptions } from 'kuito';
import { fetchShows, type Show as Series } from '../reel/api';
import { Discover } from '../reel/screens/discover';
import { Lab } from '../reel/screens/lab';
import { Library } from '../reel/screens/library';
import { Search } from '../reel/screens/search';
import { isSaved, openSheets, saved, shows, toggleSaved } from '../reel/store';
import { TabBar, type Tab } from '../reel/tab-bar';
import css from '../reel/theme.css';

// Reel draws edge to edge: --bg in reel/tokens.css, under the status bar and the home indicator.
export const options: RouteOptions = { header: false, backgroundColor: '#08080b' };

/**
 * Reel: a streaming catalog over the TVMaze API, and Kuito's showcase.
 * Screens stay mounted while hidden, so each keeps its scroll and state; a
 * show's details are a route of their own, show/[id].tsx, loaded when one
 * first opens.
 */
export default function Reel() {
  const tab = signal<Tab>('discover');

  const firstPage = resource(({ signal }) => fetchShows(0, signal));
  const later = signal<Series[]>([]);
  const nextPage = signal(1);
  const loadMore = task(
    async ({ signal }) => {
      const shows = await fetchShows(nextPage.value, signal);

      later.value = [...later.value, ...shows];
      nextPage.value++;
    },
    { policy: 'drop' },
  );

  const catalog = () => [...(firstPage.data.value ?? []), ...later.value];

  function openShow(show: Series) {
    shows.set(show.id, show);
    navigate(routes.show({ id: show.id }), { replace: openSheets.value > 0 });
  }

  function reload() {
    later.value = [];
    nextPage.value = 1;
    // Failures show through firstPage.error.
    void firstPage.refresh().catch(() => undefined);
  }

  return (
    <>
      {/* A solid band under the status bar; screens scroll beneath it. */}
      <SafeArea edges={['top']} class={css.statusBar} />
      <Discover
        hidden={tab.value !== 'discover'}
        shows={catalog()}
        loading={firstPage.running.value}
        failed={!!firstPage.error.value}
        isSaved={isSaved}
        onOpen={openShow}
        onToggleSaved={toggleSaved}
        onReload={reload}
      />
      <Search hidden={tab.value !== 'search'} onOpen={openShow} />
      <Library
        hidden={tab.value !== 'library'}
        shows={catalog()}
        saved={saved.value}
        refreshing={firstPage.running.value && catalog().length > 0}
        loadingMore={loadMore.running.value}
        onLoadMore={() => void loadMore.run().catch(() => undefined)}
        onRefresh={reload}
        onOpen={openShow}
      />
      <Lab hidden={tab.value !== 'lab'} />
      <TabBar tab={tab.value} onSelect={(next) => (tab.value = next)} />
    </>
  );
}
