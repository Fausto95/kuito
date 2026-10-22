import { Box, easing, Text, motion, onMount, repeat, signal, timing } from 'kuito';

export default function App() {
  const turn = motion(0);
  const laps = signal(0);
  const spinning = signal(false);

  onMount(() => {
    spinning.value = true;

    turn.value = repeat(
      timing({
        duration: 100,
        easing: easing.linear,
        onEnd: (finished) => finished && laps.value++,
      }).to(360),
    );
  });

  return (
    <Box>
      <Box id="badge" rotate={turn} />
      <Text id="laps">{spinning.value ? `${laps.value} laps` : 'idle'}</Text>
    </Box>
  );
}
