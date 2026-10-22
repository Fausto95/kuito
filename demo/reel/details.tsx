import {
  Box,
  List,
  Image,
  Pressable,
  HStack,
  Scroll,
  VStack,
  Text,
  clamp,
  interpolate,
  motion,
  onMount,
  pinch,
  scrollMotion,
  spring,
  task,
  watch,
  Match,
  Switch,
} from 'kuito';
import { fetchCast, type Show } from './api';
import { details, plainText, score } from './catalog';
import { Loading } from './components';
import css from './theme.css';

/** A cast member's width and the rail's gap: where each face sits along the row. */
const PERSON_STEP = 84 + 12;

interface DetailsProps {
  show: Show;
  saved: boolean;
  onToggleSaved: (show: Show) => void;
}

/**
 * A show in full, inside the details sheet: what it is, its story and its
 * cast. The header collapses as the page scrolls and stretches when pulled
 * past the top; the faces drift against the cast row's scrolling. All of it
 * moves on the UI thread, from the scroll views' motion sources.
 */
export function Details(props: DetailsProps) {
  const cast = task(({ signal }, id: number) => fetchCast(id, signal));
  // Opening another show cancels this one; failures show through cast.error.
  const load = (id: number) => void cast.run(id).catch(() => undefined);

  // Pinch the poster to look closer; it springs back when let go, inside the sheet.
  const zoom = pinch().release(spring());
  const scale = motion(1).follows(zoom.scale);
  const page = scrollMotion();
  const rail = scrollMotion();

  onMount(() => load(props.show.id));
  watch(() => props.show.id, load);

  return (
    <Scroll flex={1} scrollbar={false} motion={page}>
      <VStack gap={22}>
        <HStack
          class={css.sheetHeader}
          // Half pinned while it scrolls away, fading and shrinking toward its top.
          translateY={page.offset.map((offset) => offset / 2)}
          opacity={interpolate(page.offset, [0, 160], [1, 0])}
          scale={page.overscroll.map((pulled) => 1 + Math.max(-pulled, 0) / 400)}
        >
          <Image
            id="sheet-poster"
            class={css.sheetPoster}
            scale={clamp(scale, 1, 3)}
            gestures={[zoom]}
            src={props.show.image?.medium ?? ''}
            aspectRatio={680 / 1000}
            placeholder="#1c1c25"
            fadeDuration={220}
          />
          <VStack class={css.heroBody}>
            <Text class={css.kicker}>{'★ ' + score(props.show) + ' · ' + props.show.status}</Text>
            <Text class={css.sheetTitle}>{props.show.name}</Text>
            <Text class={css.meta}>{details(props.show)}</Text>
            <Text class={css.meta}>{props.show.genres.slice(0, 3).join(' · ')}</Text>
          </VStack>
        </HStack>
        <VStack class={css.inset}>
          <Pressable
            id="save"
            class={css.primary}
            pressedScale={0.97}
            haptic="medium"
            opacity={props.saved ? 0.85 : 1}
            onPress={() => props.onToggleSaved(props.show)}
          >
            <Text class={css.primaryText}>{props.saved ? '✓ In My List' : '+ Add to My List'}</Text>
          </Pressable>
          <Text class={css.sheetSummary}>{plainText(props.show.summary)}</Text>
        </VStack>
        <VStack class={css.section}>
          <HStack class={css.sectionHeader}>
            <Text class={css.sectionTitle}>Cast</Text>
          </HStack>
          <Switch fallback={<Loading label="Loading the cast…" />}>
            <Match when={cast.error.value}>
              <VStack class={css.inset}>
                <Text class={css.cardBody}>The cast is unavailable right now.</Text>
              </VStack>
            </Match>
            <Match when={cast.data.value}>
              {(people) => (
                <List
                  horizontal
                  class={css.rail}
                  scrollbar={false}
                  motion={rail}
                  data={people}
                  itemKey={(member) => member.person.id + '-' + member.character.id}
                  empty={<Text class={css.cardBody}>No cast listed.</Text>}
                  renderItem={({ item, index }) => (
                    <VStack class={css.person}>
                      <Box class={css.face}>
                        <Image
                          class={css.faceImage}
                          // Parallax: the photo drifts against the row as it passes.
                          translateX={interpolate(
                            rail.offset,
                            [index.value * PERSON_STEP - 360, index.value * PERSON_STEP + 360],
                            [12, -12],
                          )}
                          src={item.person.image?.medium ?? ''}
                          objectFit="cover"
                          placeholder="#1c1c25"
                          fadeDuration={200}
                        />
                      </Box>
                      <Text class={css.personName}>{item.person.name}</Text>
                      <Text class={css.personRole}>{item.character.name}</Text>
                    </VStack>
                  )}
                />
              )}
            </Match>
          </Switch>
        </VStack>
        <Box height={8} />
      </VStack>
    </Scroll>
  );
}
