import { Spinner, Box, List, Image, Pressable, HStack, Spacer, VStack, Text } from 'kuito';
import type { Show } from './api';
import { details, score, year, type Rail } from './catalog';
import css from './theme.css';

const PLACEHOLDER = '#1c1c25';
const POSTER_RATIO = 680 / 1000;

interface PosterProps {
  id: string;
  show: Show;
  onOpen: (show: Show) => void;
}

/** A poster card that springs under the finger and opens the show. */
export function Poster(props: PosterProps) {
  return (
    <Pressable
      id={props.id}
      class={css.poster}
      pressedScale={0.95}
      haptic="selection"
      onPress={() => props.onOpen(props.show)}
    >
      <VStack>
        <Image
          class={css.posterImage}
          src={props.show.image?.medium ?? ''}
          aspectRatio={POSTER_RATIO}
          objectFit="cover"
          placeholder={PLACEHOLDER}
          fadeDuration={220}
        />
        <Box class={css.badge}>
          <Text class={css.rating} label={'Rated ' + score(props.show)}>
            {'★ ' + score(props.show)}
          </Text>
        </Box>
      </VStack>
      <Text class={css.posterTitle}>{props.show.name}</Text>
      <Text class={css.posterMeta}>
        {year(props.show) + ' · ' + props.show.genres.slice(0, 2).join(', ')}
      </Text>
    </Pressable>
  );
}

interface RailProps {
  rail: Rail;
  onOpen: (show: Show) => void;
}

/** A titled, horizontally scrolling row of posters. */
export function RailView(props: RailProps) {
  return (
    <VStack class={css.section}>
      <HStack class={css.sectionHeader}>
        <Text class={css.sectionTitle}>{props.rail.title}</Text>
        <Spacer />
        <Text class={css.sectionNote}>{props.rail.shows.length + ' shows'}</Text>
      </HStack>
      <List
        horizontal
        class={css.rail}
        scrollbar={false}
        data={props.rail.shows}
        itemKey={(show) => props.rail.id + '-' + show.id}
        renderItem={({ item }) => (
          <Poster id={props.rail.id + '-' + item.id} show={item} onOpen={props.onOpen} />
        )}
      />
    </VStack>
  );
}

interface ShowRowProps {
  id: string;
  show: Show;
  onOpen: (show: Show) => void;
}

/** A show as a list row: thumbnail, title, and what it is. */
export function ShowRow(props: ShowRowProps) {
  return (
    <Pressable
      id={props.id}
      class={css.listRow}
      pressedOpacity={0.6}
      hint="Opens the show"
      onPress={() => props.onOpen(props.show)}
    >
      <HStack gap={14}>
        <Image
          class={css.thumb}
          src={props.show.image?.medium ?? ''}
          aspectRatio={POSTER_RATIO}
          placeholder={PLACEHOLDER}
          fadeDuration={180}
        />
        <VStack class={css.rowBody}>
          <Text class={css.rowTitle}>{props.show.name}</Text>
          <Text class={css.rowMeta}>{details(props.show)}</Text>
          <Text class={css.rowMeta}>{props.show.genres.join(' · ')}</Text>
        </VStack>
        <Spacer />
        <Text class={css.rating} label={'Rated ' + score(props.show)}>
          {'★ ' + score(props.show)}
        </Text>
      </HStack>
    </Pressable>
  );
}

interface Choice<T extends string> {
  value: T;
  label: string;
}

interface SegmentsProps<T extends string> {
  id: string;
  choices: Choice<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

/** Filter pills; the selected one turns light. */
export function Segments<T extends string>(props: SegmentsProps<T>) {
  return (
    <HStack class={css.segments}>
      {props.choices.map((choice) => (
        <Pressable
          id={props.id + '-' + choice.value}
          key={choice.value}
          class={css.segment}
          haptic="selection"
          backgroundColor={props.selected === choice.value ? '#f5f5f7' : '#1c1c25'}
          onPress={() => props.onSelect(choice.value)}
        >
          <Text
            class={css.segmentText}
            color={props.selected === choice.value ? '#08080b' : '#a1a1aa'}
          >
            {choice.label}
          </Text>
        </Pressable>
      ))}
    </HStack>
  );
}

export function Loading(props: { label: string }) {
  return (
    <VStack class={css.state}>
      <Spinner />
      <Text class={css.stateBody}>{props.label}</Text>
    </VStack>
  );
}

interface MessageProps {
  title: string;
  body: string;
  action?: { id: string; label: string; onPress: () => void };
}

/** An empty or failed state, with the one thing to do next. */
export function Message(props: MessageProps) {
  return (
    <VStack class={css.state}>
      <Text class={css.stateTitle}>{props.title}</Text>
      <Text class={css.stateBody}>{props.body}</Text>
      {props.action ? (
        <Pressable
          id={props.action.id}
          class={css.ghost}
          pressedScale={0.96}
          onPress={() => props.action?.onPress()}
        >
          <Text class={css.ghostText}>{props.action.label}</Text>
        </Pressable>
      ) : null}
    </VStack>
  );
}
