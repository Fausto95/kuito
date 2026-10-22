import { Box, easing, Pressable, Text, motion, repeat, signal, timing } from 'kuito';

export default function App() {
  const turn = motion(0);
  const laps = signal(0);

  return (
    <Box>
      <Box id="badge" rotate={turn} />
      <Pressable
        id="spin"
        onPress={() => {
          turn.value = repeat(
            timing({
              duration: 100,
              easing: easing.linear,
              onEnd: (finished) => finished && laps.value++,
            }).to(360),
          );
        }}
      >
        <Text id="laps">{`${laps.value} laps`}</Text>
      </Pressable>
    </Box>
  );
}
