import { Image, Pressable, HStack, Scroll, VStack, Symbol, Text, Match, Switch } from 'kuito';
import type { Show } from '../api';
import { details, featured, plainText, rails, score } from '../catalog';
import { Loading, Message, RailView } from '../components';
import logo from '../assets/logo.png';
import css from '../theme.css';

interface DiscoverProps {
  hidden: boolean;
  shows: Show[];
  loading: boolean;
  failed: boolean;
  isSaved: (show: Show) => boolean;
  onOpen: (show: Show) => void;
  onToggleSaved: (show: Show) => void;
  onReload: () => void;
}

/** The ratings' gold, as tokens.css has it: a Symbol's tint is a prop, not a class. */
const GOLD = '#f5c451';

/** The front page: the best rated show, then rails by rating and genre. */
export function Discover(props: DiscoverProps) {
  return (
    <Scroll
      class={css.screen}
      hidden={props.hidden}
      scrollbar={false}
      refreshing={props.loading && props.shows.length > 0}
      onRefresh={() => props.onReload()}
    >
      <VStack class={css.content}>
        <VStack class={css.header}>
          <HStack class={css.brandRow}>
            <Image id="reel-logo" src={logo} />
            <Text class={css.brand}>Reel</Text>
          </HStack>
          <Text class={css.title}>Tonight</Text>
          <Text class={css.subtitle}>The best of TVMaze, live from its API.</Text>
        </VStack>
        <Switch>
          <Match when={props.failed}>
            <Message
              title="Couldn't reach TVMaze"
              body="Check the connection, then try again."
              action={{ id: 'retry', label: 'Try again', onPress: () => props.onReload() }}
            />
          </Match>
          <Match when={props.shows.length === 0}>
            <Loading label="Finding something good…" />
          </Match>
          <Match when={featured(props.shows)}>
            {(show) => (
              <VStack gap={30}>
                <Hero
                  show={show}
                  saved={props.isSaved(show)}
                  onOpen={props.onOpen}
                  onToggleSaved={props.onToggleSaved}
                />
                {rails(props.shows).map((rail) => (
                  <RailView key={rail.id} rail={rail} onOpen={props.onOpen} />
                ))}
              </VStack>
            )}
          </Match>
        </Switch>
      </VStack>
    </Scroll>
  );
}

interface HeroProps {
  show: Show;
  saved: boolean;
  onOpen: (show: Show) => void;
  onToggleSaved: (show: Show) => void;
}

function Hero(props: HeroProps) {
  return (
    <VStack class={css.inset}>
      <Pressable
        id={'hero-' + props.show.id}
        class={css.hero}
        pressedScale={0.98}
        onPress={() => props.onOpen(props.show)}
      >
        <HStack class={css.heroTop}>
          <Image
            class={css.heroPoster}
            src={props.show.image?.medium ?? ''}
            aspectRatio={680 / 1000}
            placeholder="#1c1c25"
            fadeDuration={260}
          />
          <VStack class={css.heroBody}>
            <HStack class={css.kickerRow}>
              <Text class={css.kicker}>{'#1 tonight · '}</Text>
              <Symbol id="hero-rating" name="star" size={12} weight="bold" tintColor={GOLD} />
              <Text class={css.kicker}>{score(props.show)}</Text>
            </HStack>
            <Text class={css.heroTitle}>{props.show.name}</Text>
            <Text class={css.meta}>{details(props.show)}</Text>
            <Text class={css.summary}>{plainText(props.show.summary)}</Text>
          </VStack>
        </HStack>
        <HStack class={css.actions}>
          <Pressable
            class={css.primary}
            pressedScale={0.96}
            haptic="light"
            onPress={() => props.onOpen(props.show)}
          >
            <Text class={css.primaryText}>Details</Text>
          </Pressable>
          <Pressable
            class={css.ghost}
            pressedScale={0.96}
            haptic="selection"
            onPress={() => props.onToggleSaved(props.show)}
          >
            <Text class={css.ghostText}>{props.saved ? '✓ In My List' : '+ My List'}</Text>
          </Pressable>
        </HStack>
      </Pressable>
    </VStack>
  );
}
