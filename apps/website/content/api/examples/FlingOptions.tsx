// Configure a directional flick.
import { Box, fling, haptics, type FlingOptions } from 'kuito';

function swipeTo(direction: 'left' | 'right', action: () => void): FlingOptions {
  return {
    direction,
    hitArea: { horizontal: 20 },
    onEnd: (_, success) => {
      if (!success) return;
      void haptics.impact('light');
      action();
    },
  };
}

<Box
  gestures={[
    fling(swipeTo('left', () => console.log('archive'))),
    fling(swipeTo('right', () => console.log('pin'))),
  ]}
/>;
