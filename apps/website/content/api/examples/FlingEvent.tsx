// Read where a flick started.
import { Box, fling, signal, type FlingEvent } from 'kuito';

const dismissed = signal<'top' | 'bottom' | null>(null);

// A fling started near the top dismisses upward, else downward.
const dismiss = (event: FlingEvent) => {
  dismissed.value = event.y < 100 ? 'top' : 'bottom';
};

<Box gestures={[fling({ direction: ['up', 'down'], onStart: dismiss })]} height={200} />;
