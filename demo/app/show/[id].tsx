import {
  Match,
  Switch,
  Text,
  VStack,
  onCleanup,
  onMount,
  resource,
  type RouteOptions,
  type ScreenProps,
} from 'kuito';
import { fetchShow } from '../../reel/api';
import { Loading } from '../../reel/components';
import { Details } from '../../reel/details';
import { isSaved, openSheets, shows, toggleSaved } from '../../reel/store';
import css from '../../reel/theme.css';

export type Params = { id: number };

export const options: RouteOptions<Params> = { presentation: 'sheet', snapPoints: ['72%', '100%'] };

/**
 * A show's details, in a sheet over Reel: the one the catalog listed, or
 * fetched by id when the list has none of it (a deep link, or a Live Patch
 * that started the store over).
 */
export default function ShowDetails({ id }: ScreenProps<Params>) {
  const show = resource(({ signal }) => shows.get(id) ?? fetchShow(id, signal));

  onMount(() => {
    openSheets.value++;
  });

  onCleanup(() => openSheets.value--);

  return (
    <VStack id="details" class={css.sheet} flex={1}>
      <Switch fallback={<Loading label="Loading the show…" />}>
        <Match when={show.error.value}>
          <Text class={css.cardBody}>This show is unavailable right now.</Text>
        </Match>
        <Match when={show.data.value}>
          {(found) => <Details show={found} saved={isSaved(found)} onToggleSaved={toggleSaved} />}
        </Match>
      </Switch>
    </VStack>
  );
}
