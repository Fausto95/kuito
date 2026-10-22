import {
  Box,
  Pressable,
  HStack,
  SafeArea,
  Scroll,
  VStack,
  Text,
  easing,
  motion,
  repeat,
  sequence,
  spring,
  signal,
  timing,
} from 'kuito';

const ROWS = Array.from({ length: 40 }, (_, index) => `Episode ${index + 1}`);

/**
 * A header that fades and slides as the feed scrolls, and a badge that pops and
 * spins. The scroll handler, the header's props and every animation frame run
 * on the UI thread; the JS thread hears about the title change and the spins.
 */
export default function App() {
  const offset = motion(0);
  const title = signal('Top of the feed');
  const pop = motion(1);
  const turn = motion(0);
  const spins = signal(0);
  const spinning = signal(false);

  const spin = () => {
    if (spinning.value) {
      turn.value = spring().to(0);
      spinning.value = false;

      return;
    }

    spinning.value = true;

    turn.value = repeat(
      timing({
        duration: 900,
        easing: easing.linear,
        onEnd: (finished) => finished && spins.value++,
      }).to(360),
    );
  };

  return (
    <SafeArea flex={1} backgroundColor="#0b0b10">
      <Box
        id="header"
        height={120}
        backgroundColor="#e50914"
        justifyContent="flex-end"
        padding={16}
        opacity={Math.max(0, 1 - offset.value / 160)}
        translateY={Math.max(-60, -offset.value / 2)}
      >
        <HStack justifyContent="space-between" alignItems="center">
          <Text color="#ffffff" fontSize={28} fontWeight={700}>
            Motion
          </Text>
          <Box
            id="badge"
            width={44}
            height={44}
            borderRadius={10}
            backgroundColor="#ffffff"
            scale={pop}
            rotate={turn}
          />
        </HStack>
      </Box>
      <HStack gap={12} padding={12}>
        <Pressable
          id="pop"
          onPress={() => {
            pop.value = sequence(timing({ duration: 120 }).to(1.4), spring({ damping: 6 }).to(1));
          }}
        >
          <Text color="#ffffff">Pop</Text>
        </Pressable>
        <Pressable id="spin" onPress={spin}>
          <Text color="#ffffff">{spinning.value ? `Stop (${spins.value} spins)` : 'Spin'}</Text>
        </Pressable>
      </HStack>
      <Text id="title" color="#ffffff" padding={12}>
        {title.value}
      </Text>
      <Scroll
        id="feed"
        flex={1}
        onScroll={(event) => {
          offset.value = event.y;

          const next = event.y > 160 ? 'Scrolled past the header' : 'Top of the feed';

          if (title.value !== next) title.value = next;
        }}
      >
        <VStack gap={8} padding={16}>
          {ROWS.map((row) => (
            <Box key={row} height={64} backgroundColor="#1c1c24" borderRadius={12} padding={16}>
              <Text color="#d0d0dc">{row}</Text>
            </Box>
          ))}
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
