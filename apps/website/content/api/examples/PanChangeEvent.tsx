import { Box, pan, signal, type PanChangeEvent } from 'kuito';

const scrubbed = signal(0);

// Moves the playhead 50 ms for each point the finger moved since the last move.
const scrub = (event: PanChangeEvent) => {
  scrubbed.value = Math.max(0, scrubbed.value + event.changeX * 50);
};

<Box gestures={[pan({ axis: 'x', onChange: scrub })]} height={44} />;
