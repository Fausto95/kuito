import { Box, Pressable, Scroll, Text, inherit, inherited, motion, provide, signal } from 'kuito';
import type { Motion } from 'kuito';

/** How far the feed scrolled: a motion value, so what reads it binds on the UI thread. */
const Scrolled = inherited<Motion<number> | null>(null);
/** The screen's accent: a JS-thread signal. */
const Accent = inherited('gray');

function Header() {
  // A motion value never changes identity: read which one once, its value where it binds.
  const scrolled = inherit(Scrolled).value;

  return <Box id="header" opacity={scrolled ? 1 - scrolled.value / 200 : 1} />;
}

/** Placed whole: its signal lives on the UI thread; the inherited accent stays a JS-thread read. */
function Like() {
  const liked = signal(false);
  const accent = inherit(Accent);

  return (
    <Pressable
      id="like"
      label="Like"
      opacity={liked.value ? 1 : 0.6}
      onPress={() => (liked.value = !liked.value)}
    >
      <Text id="like-label">{accent.value}</Text>
    </Pressable>
  );
}

export default function App() {
  const offset = motion(0);
  const accent = signal('teal');

  provide(Scrolled, offset);
  provide(Accent, accent);

  return (
    <Scroll id="feed" onScroll={(event) => (offset.value = event.y)}>
      <Header />
      <Like />
      <Pressable id="recolor" label="Recolor" onPress={() => (accent.value = 'orange')} />
    </Scroll>
  );
}
