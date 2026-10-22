import {
  Box,
  TextField,
  Pressable,
  HStack,
  Scroll,
  Spacer,
  VStack,
  Toggle,
  Text,
  clamp,
  fade,
  interpolate,
  motion,
  onMount,
  pan,
  pinch,
  signal,
  spring,
  timing,
  zoom,
  Show,
  audio,
  clipboard,
  haptics,
  type KuitoNode,
} from 'kuito';
import css from '../theme.css';

/** What Kuito does under the app: signals, animation, native APIs, the LogBox. */
export function Lab(props: { hidden: boolean }) {
  return (
    <Scroll class={css.screen} hidden={props.hidden} scrollbar={false}>
      <VStack class={css.content}>
        <VStack class={css.header}>
          <Text class={css.brand}>Reel</Text>
          <Text class={css.title}>Lab</Text>
          <Text class={css.subtitle}>The machinery under the catalog, one card each.</Text>
        </VStack>
        <VStack class={css.inset}>
          <Signals />
          <Motion />
          <Gestures />
          <Arrivals />
          <Keyboard />
          <Rating />
          <NativeApis />
          <Listen />
          <Diagnostics />
        </VStack>
      </VStack>
    </Scroll>
  );
}

function Card(props: { title: string; body: string; children?: KuitoNode }) {
  return (
    <VStack class={css.card}>
      <Text class={css.cardTitle}>{props.title}</Text>
      <Text class={css.cardBody}>{props.body}</Text>
      {props.children}
    </VStack>
  );
}

function Action(props: { id?: string; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable
      id={props.id}
      class={props.primary ? css.primary : css.ghost}
      pressedScale={0.96}
      haptic="light"
      onPress={() => props.onPress()}
    >
      <Text class={props.primary ? css.primaryText : css.ghostText}>{props.label}</Text>
    </Pressable>
  );
}

function Signals() {
  const likes = signal(0);

  return (
    <Card
      title="Signals"
      body="Only the number below updates when you tap — turn on Highlight updates in the devtools to watch."
    >
      <HStack gap={16}>
        <Text class={css.counter}>{String(likes.value)}</Text>
        <Action label="+1" primary onPress={() => likes.value++} />
        <Action label="Reset" onPress={() => (likes.value = 0)} />
      </HStack>
    </Card>
  );
}

function Motion() {
  const turned = signal(false);
  const calm = signal(false);

  return (
    <Card
      title="Motion"
      body="Springs and timing curves run on the UI thread; JavaScript only sends the target."
    >
      <HStack gap={20}>
        <Box
          class={css.orb}
          animate={{ rotate: turned.value ? 180 : 0, scale: turned.value ? 1.25 : 1 }}
          transition={{
            transform: calm.value ? timing(400) : spring({ damping: 9, stiffness: 120 }),
          }}
        />
        <Action
          label={turned.value ? 'Back' : 'Spin'}
          primary
          onPress={() => (turned.value = !turned.value)}
        />
      </HStack>
      <HStack class={css.toggleRow}>
        <Text class={css.cardBody}>Calm motion</Text>
        <Spacer />
        <Toggle checked={calm} />
      </HStack>
    </Card>
  );
}

/** A card to swipe away and a poster to pinch: declarations the UI thread runs, no handler. */
function Gestures() {
  const swipe = pan({ axis: 'x' }).release(spring().to([-420, 0, 420]));
  const x = motion(0).follows(swipe.x);
  const zoom = pinch().release(spring());
  const scale = motion(1).follows(zoom.scale);

  return (
    <Card
      title="Gestures"
      body="Swipe the card away, pinch the poster. The UI thread follows the finger; JavaScript never hears of it."
    >
      <Box
        id="lab-swipe"
        class={css.swipeCard}
        translateX={x}
        rotate={x.map((value) => value / 24)}
        opacity={interpolate(x, [-300, 0, 300], [0, 1, 0])}
        gestures={[swipe]}
      >
        <Text class={css.cardTitle}>Swipe me away</Text>
      </Box>
      <HStack gap={10}>
        <Box id="lab-zoom" class={css.orb} scale={clamp(scale, 1, 3)} gestures={[zoom]} />
        <Action label="Bring the card back" onPress={() => (x.value = spring().to(0))} />
      </HStack>
    </Card>
  );
}

function Arrivals() {
  const tags = signal<number[]>([1, 2, 3]);
  const next = signal(4);

  return (
    <Card title="Enter and exit" body="Views animate in when they mount and out before they go.">
      <HStack class={css.chips}>
        {tags.value.map((tag) => (
          <Box
            key={String(tag)}
            class={css.chip}
            enter={zoom().and(fade)}
            exit={fade}
            transition={{ transform: spring({ damping: 14 }), opacity: timing(180) }}
          >
            <Text class={css.chipText}>{'#' + tag}</Text>
          </Box>
        ))}
      </HStack>
      <HStack gap={10}>
        <Action
          label="Add"
          primary
          onPress={() => {
            if (tags.value.length >= 5) return;

            tags.value = [...tags.value, next.value];
            next.value++;
          }}
        />
        <Action label="Remove" onPress={() => (tags.value = tags.value.slice(1))} />
      </HStack>
    </Card>
  );
}

function Keyboard() {
  const sent = signal('');

  return (
    <Card
      title="Keyboard"
      body="Next moves between fields natively; the screen scrolls each one clear of the keyboard, in step with it."
    >
      <TextField
        id="lab-name"
        class={css.field}
        placeholder="Name"
        placeholderColor="#8a8a96"
        enterKeyHint="next"
      />
      <TextField
        id="lab-email"
        class={css.field}
        placeholder="Email"
        placeholderColor="#8a8a96"
        enterKeyHint="next"
      />
      <TextField
        id="lab-note"
        class={css.field}
        placeholder="A note for the team"
        placeholderColor="#8a8a96"
        enterKeyHint="send"
        onSubmit={(event) => (sent.value = event.text ? 'Sent “' + event.text + '”' : '')}
      />
      <Text class={css.cardBody} live="polite">
        {sent.value}
      </Text>
    </Card>
  );
}

/** A custom control VoiceOver adjusts by swiping up and down, TalkBack by its scroll actions. */
function Rating() {
  const stars = signal(3);
  const change = (by: number) => (stars.value = Math.min(5, Math.max(0, stars.value + by)));

  return (
    <Card title="Accessibility" body="With a screen reader on, swipe up or down on the stars.">
      <HStack
        id="lab-rating"
        gap={6}
        accessible
        role="slider"
        label="Rating"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={stars.value}
        aria-valuetext={stars.value + ' of 5 stars'}
        actions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAction={(event) => change(event.actionName === 'increment' ? 1 : -1)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={String(star)} onPress={() => (stars.value = star)} aria-hidden>
            <Text class={css.counter} color={star <= stars.value ? '#ffcc4d' : '#3a3a46'}>
              ★
            </Text>
          </Pressable>
        ))}
      </HStack>
    </Card>
  );
}

function NativeApis() {
  const copied = signal(false);
  const pasted = signal('');
  const feedback = haptics.supported ? 'Haptics ready.' : 'No haptics on this device.';

  return (
    <Card
      title="Native APIs"
      body={'Typed modules in Swift and Kotlin: the clipboard and haptics. ' + feedback}
    >
      <Text class={css.subtitle}>{'Clipboard: ' + (pasted.value || '—')}</Text>
      <Text class={css.subtitle}>
        {'Clipboard holds text: ' + (clipboard.hasText.value ? 'yes' : 'no')}
      </Text>
      <HStack gap={10}>
        <Action
          id="lab-copy"
          label={copied.value ? 'Copied ✓' : 'Copy TVMaze link'}
          onPress={() => {
            void clipboard.writeText('https://www.tvmaze.com').then(() => {
              copied.value = true;
            });
          }}
        />
        <Action
          id="lab-paste"
          label="Paste"
          onPress={() => {
            void clipboard.readText().then((text) => {
              pasted.value = text;
            });
          }}
        />
        <Action id="lab-tick" label="Tick" onPress={() => void haptics.selection()} />
      </HStack>
    </Card>
  );
}

const THEME = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

/** The progress bar's width, in points. */
const BAR = 280;

/** A player of its own: made when it mounts, released when it unmounts. */
function ThemeSong() {
  const song = audio.player(THEME);
  const { time, duration } = song;

  onMount(() => {
    song.playing.value = true;
  });

  return (
    <VStack gap={10}>
      <Text id="lab-song" class={css.subtitle}>
        {song.error.value ??
          (!song.loaded.value || song.buffering.value
            ? 'Loading…'
            : song.playing.value
              ? 'Playing'
              : 'Paused')}
      </Text>
      <Box width={BAR} height={4} borderRadius={2} backgroundColor="#2a2a36" overflow="hidden">
        {/* Bound to time on the UI thread: playing costs the JS thread nothing. */}
        <Box
          id="lab-progress"
          width={BAR}
          height={4}
          backgroundColor="#e50914"
          translateX={duration.value > 0 ? (time.value / duration.value - 1) * BAR : -BAR}
        />
      </Box>
      <HStack gap={10}>
        <Action
          id="lab-play"
          label={song.playing.value ? 'Pause' : 'Play'}
          onPress={() => (song.playing.value = !song.playing.value)}
        />
        <Action
          label="+30s"
          onPress={() => void song.seek(Math.min(time.value + 30, duration.value))}
        />
      </HStack>
    </VStack>
  );
}

function Listen() {
  const open = signal(false);

  return (
    <Card title="Audio" body="A player owned by its view, its progress moved by the UI thread.">
      <Show
        when={open.value}
        fallback={
          <Action id="lab-listen" label="Listen" primary onPress={() => (open.value = true)} />
        }
      >
        <ThemeSong />
        <Action label="Close" onPress={() => (open.value = false)} />
      </Show>
    </Card>
  );
}

function Diagnostics() {
  return (
    <Card
      title="LogBox"
      body="Logs land in the terminal at their source line; warnings and errors open here with the code that raised them."
    >
      <HStack gap={10}>
        <Action label="Warn" onPress={() => console.warn('Poster cache is 92% full')} />
        <Action
          id="lab-throw"
          label="Throw"
          onPress={() => {
            throw new Error('Something broke in a press handler');
          }}
        />
      </HStack>
      <Text class={css.code}>Devtools: m in the terminal · ⌘D iOS · ⌘M Android</Text>
    </Card>
  );
}
