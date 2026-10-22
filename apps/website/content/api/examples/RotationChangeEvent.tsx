// React to incremental rotation.
import { Box, haptics, rotate, signal, type RotationChangeEvent } from 'kuito';

const turned = signal(0);

// A tick of haptic feedback every 30 degrees, like a dial's detents.
const tick = (event: RotationChangeEvent) => {
  const before = Math.floor(turned.value / 30);

  turned.value += event.rotationChange;
  if (Math.floor(turned.value / 30) !== before) void haptics.selection();
};

<Box gestures={[rotate({ onChange: tick })]} width={120} height={120} />;
