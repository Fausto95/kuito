// Read a long press location and duration.
import { Box, longPress, signal, type LongPressEvent } from 'kuito';

const menuAt = signal<{ x: number; y: number } | null>(null);

// Opens a menu where the finger rests, once it has been held.
const open = (event: LongPressEvent) => {
  menuAt.value = { x: event.absoluteX, y: event.absoluteY };
};

<Box gestures={[longPress({ after: 400, onStart: open })]} height={64} />;
