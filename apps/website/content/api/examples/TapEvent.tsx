import { Box, motion, tap, timing, type TapEvent } from 'kuito';

function Ripple() {
  const x = motion(0);
  const y = motion(0);
  const grow = motion(0);

  // Start the ripple where the finger landed.
  const startAt = (event: TapEvent) => {
    x.value = event.x;
    y.value = event.y;
    grow.value = 0;
    grow.value = timing(250).to(1);
  };

  return (
    <Box gestures={[tap({ onEnd: startAt })]} width={200} height={56}>
      <Box position="absolute" translateX={x} translateY={y} scale={grow} width={8} height={8} />
    </Box>
  );
}
