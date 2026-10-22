import { Box, List, VStack, Text, signal } from 'kuito';
import type { Show } from '../api';
import { Loading, Message, Segments, ShowRow } from '../components';
import css from '../theme.css';

type Filter = 'all' | 'saved';

interface LibraryProps {
  hidden: boolean;
  shows: Show[];
  saved: Show[];
  refreshing: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  onOpen: (show: Show) => void;
}

/** Every show TVMaze has, a page at a time as you scroll, and your list. */
export function Library(props: LibraryProps) {
  const filter = signal<Filter>('all');
  const rows = () => (filter.value === 'saved' ? props.saved : props.shows);

  function more() {
    if (filter.value === 'all') props.onLoadMore();
  }

  return (
    <List
      class={css.screen}
      hidden={props.hidden}
      scrollbar={false}
      data={rows()}
      itemKey={(show) => filter.value + '-' + show.id}
      renderItem={({ item }) => (
        <ShowRow id={filter.value + '-' + item.id} show={item} onOpen={props.onOpen} />
      )}
      separator={() => (
        <VStack class={css.rowSeparator}>
          <Box class={css.separator} />
        </VStack>
      )}
      refreshing={props.refreshing}
      onRefresh={() => props.onRefresh()}
      reachEndThreshold={1}
      onReachEnd={more}
      header={
        <VStack class={css.listHeader}>
          <VStack class={css.header}>
            <Text class={css.brand}>Reel</Text>
            <Text class={css.title}>Library</Text>
            <Text class={css.subtitle}>
              {filter.value === 'saved'
                ? props.saved.length + ' saved'
                : props.shows.length + ' shows loaded · pull to refresh'}
            </Text>
          </VStack>
          <VStack class={css.inset}>
            <Segments
              id="segment"
              choices={[
                { value: 'all', label: 'All shows' },
                { value: 'saved', label: 'My List' },
              ]}
              selected={filter.value}
              onSelect={(value) => (filter.value = value)}
            />
          </VStack>
        </VStack>
      }
      footer={props.loadingMore ? <Loading label="Loading more…" /> : <Box height={24} />}
      empty={
        filter.value === 'saved' ? (
          <Message title="Nothing saved yet" body="Tap + My List on any show to keep it here." />
        ) : (
          <Loading label="Loading the catalog…" />
        )
      }
    />
  );
}
