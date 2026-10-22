// Type a shared gesture callback.
import { Box, pan, tap, type GestureEvent } from 'kuito';

// Any gesture's event carries how many fingers it involves.
const logFingers = (event: GestureEvent) => console.log(`${event.numberOfPointers} finger(s)`);

<Box gestures={[tap({ onEnd: logFingers }), pan({ onStart: logFingers })]} />;
