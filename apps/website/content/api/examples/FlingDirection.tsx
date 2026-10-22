// Limit a flick to one direction.
import { Box, fling, signal, type FlingDirection } from 'kuito';

const page = signal(0);

// The next page is to the right in a left-to-right language, to the left otherwise.
function Pages(props: { rightToLeft: boolean }) {
  const next: FlingDirection = props.rightToLeft ? 'right' : 'left';
  const back: FlingDirection = props.rightToLeft ? 'left' : 'right';

  return (
    <Box
      gestures={[
        fling({ direction: next, onEnd: (_, success) => success && (page.value += 1) }),
        fling({ direction: back, onEnd: (_, success) => success && (page.value -= 1) }),
      ]}
    />
  );
}
