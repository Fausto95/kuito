import { Box, motion, rotate, spring, type RotationEvent } from 'kuito';

function Dial(props: { onSet: (degrees: number) => void }) {
  const turn = rotate().release(spring());
  const angle = motion(0).follows(turn.rotation);

  const settle = (event: RotationEvent) => props.onSet(Math.round(event.rotation / 15) * 15);

  return (
    <Box rotate={angle} gestures={[rotate({ onEnd: settle }), turn]} width={120} height={120} />
  );
}
