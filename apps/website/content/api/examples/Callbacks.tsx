// Add haptic feedback to a gesture.
import { Box, haptics, pan, type Callbacks, type PanChangeEvent, type PanEvent } from 'kuito';

// Shared feedback for every draggable in the app.
const feedback: Callbacks<PanEvent, PanChangeEvent> = {
  onStart: () => void haptics.selection(),
  onEnd: (_, success) => void (success && haptics.impact('light')),
};

<Box gestures={[pan({ axis: 'x', ...feedback })]} />;
