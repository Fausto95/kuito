// Keep a drag-driven opacity inside its visible range.
import { Box, clamp, motion, pan } from 'kuito';

export function Draggable() {
  const drag = pan({ axis: 'x' });
  const x = motion(0).follows(drag.x);
  return (
    <Box
      gestures={[drag]}
      translateX={x}
      opacity={clamp(
        x.map((value) => 1 - Math.abs(value) / 240),
        0.2,
        1,
      )}
      width={100}
      height={100}
      backgroundColor="#2563eb"
    />
  );
}
