import {
  Box,
  List,
  Pressable,
  HStack,
  VStack,
  Text,
  TextField,
  signal,
  task,
  onCleanup,
  watch,
  accessibility,
  Match,
  Switch,
} from 'kuito';
import { searchShows, type Show } from '../api';
import { Loading, Message, ShowRow } from '../components';
import css from '../theme.css';

const SUGGESTIONS = ['girls', 'star trek', 'the office', 'detective', 'anime'];
/** Typing pauses this long before a search goes out. */
const DEBOUNCE_MS = 300;

interface SearchProps {
  hidden: boolean;
  onOpen: (show: Show) => void;
}

/** Search as you type: one request once typing pauses, the previous one cancelled. */
export function Search(props: SearchProps) {
  const query = signal('');
  const typing = signal(false);
  const pending = signal<number | undefined>(undefined);
  const results = task(({ signal }, text: string) => searchShows(text, signal));

  function search(text: string) {
    clearTimeout(pending.value);
    typing.value = false;

    if (!text.trim()) return results.cancel();

    // A newer search cancels this one; failures show through results.error.
    void results.run(text.trim()).catch(() => undefined);
  }

  // The field writes `query` as the user types; a suggestion writes it too.
  watch(query, (text) => {
    clearTimeout(pending.value);
    typing.value = !!text.trim();

    if (!text.trim()) return results.cancel();

    pending.value = setTimeout(() => search(text), DEBOUNCE_MS);
  });

  onCleanup(() => clearTimeout(pending.value));

  // The list changes out of sight of a screen reader user still in the field.
  watch(
    () => results.data.value,
    (shows) => {
      if (shows)
        accessibility.announce(shows.length === 1 ? '1 show found' : shows.length + ' shows found');
    },
  );

  return (
    <List
      class={css.screen}
      hidden={props.hidden}
      scrollbar={false}
      keyboard={{ dismiss: 'on-drag', persistTaps: 'handled' }}
      data={query.value.trim() ? (results.data.value ?? []) : []}
      itemKey={(show) => 'result-' + show.id}
      renderItem={({ item }) => (
        <ShowRow id={'result-' + item.id} show={item} onOpen={props.onOpen} />
      )}
      separator={() => (
        <VStack class={css.rowSeparator}>
          <Box class={css.separator} />
        </VStack>
      )}
      header={
        <VStack class={css.listHeader}>
          <VStack class={css.header}>
            <Text class={css.brand}>Reel</Text>
            <Text class={css.title}>Search</Text>
          </VStack>
          <VStack class={css.inset}>
            <TextField
              id="search"
              class={css.field}
              placeholder="Shows, like “girls”"
              placeholderColor="#8a8a96"
              selectionColor="#ff5a5f"
              label="Search shows"
              enterKeyHint="search"
              value={query}
              onSubmit={(event) => search(event.text)}
            />
          </VStack>
        </VStack>
      }
      empty={
        <Switch>
          <Match when={!query.value.trim()}>
            <VStack class={css.inset}>
              <Text class={css.sectionNote}>Try</Text>
              <HStack class={css.chips}>
                {SUGGESTIONS.slice(0, 3).map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    class={css.chip}
                    pressedScale={0.95}
                    haptic="selection"
                    onPress={() => (query.value = suggestion)}
                  >
                    <Text class={css.chipText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </HStack>
            </VStack>
          </Match>
          <Match when={results.error.value}>
            <Message title="Search failed" body="TVMaze didn't answer. Try again in a moment." />
          </Match>
          <Match when={typing.value || results.running.value}>
            <Loading label="Searching…" />
          </Match>
          <Match when={true}>
            <Message title="Nothing found" body={'No show matches “' + query.value.trim() + '”.'} />
          </Match>
        </Switch>
      }
    />
  );
}
