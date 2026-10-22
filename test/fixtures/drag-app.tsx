import { Box, interpolate, motion, pan, spring } from 'kuito';

export default function App() {
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  return (
    <Box>
      <Box
        id="card"
        translateX={x}
        opacity={interpolate(x, [0, 200], [1, 0.5])}
        rotate={x.map((v) => v / 10)}
        gestures={[drag]}
      />
    </Box>
  );
}
