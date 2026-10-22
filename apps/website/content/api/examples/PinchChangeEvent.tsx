// Apply a pinch's change in scale.
import { Text, pinch, signal, type PinchChangeEvent } from 'kuito';

const fontSize = signal(17);

// Text size follows the pinch, between 12 and 34 points.
const resize = (event: PinchChangeEvent) => {
  fontSize.value = Math.min(34, Math.max(12, fontSize.value * event.scaleChange));
};

<Text fontSize={fontSize.value} gestures={[pinch({ onChange: resize })]}>
  Pinch to resize
</Text>;
