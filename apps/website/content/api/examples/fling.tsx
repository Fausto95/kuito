import { Box, fling, signal } from 'kuito';

const page = signal(0);

const swipe = fling({
  direction: ['left', 'right'],
  onEnd: (event, success) => {
    if (success) page.value += 1;
  },
});

<Box gestures={[swipe]} />;
