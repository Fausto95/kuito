// keyboard.frame on the UI thread: moved from the keyboard's own app events,
// as src/runtime/keyboard.ts moves the JS thread's copy from the same events.
import { writeMotion } from './motion';
import { handlers, motions } from './state';
import { isPlainData } from '../runtime/values';

const FIELDS = ['screenX', 'screenY', 'width', 'height'];

/** The frame an event says the keyboard ends at. */
function frameOf(event: unknown): Record<string, number> | null {
  if (!isPlainData(event)) return null;

  const frame: Record<string, number> = {};

  for (const field of FIELDS) {
    const value = event[field];

    if (typeof value !== 'number') return null;

    frame[field] = value;
  }

  return frame;
}

/** Handlers for the app's keyboard events that move motion value `id`, then let them go on. */
export function followKeyboard(id: string): void {
  const move = (shown: (current: unknown) => boolean, hidden: boolean) => (event: unknown) => {
    const record = motions[id];

    if (!record) return;

    if (hidden) writeMotion(record, null);
    else if (shown(record.value)) writeMotion(record, frameOf(event));
  };

  handlers['0.keyboard.didshow'] = { fn: move(() => true, false), field: null, passes: true };
  // A frame change moves it only while the keyboard shows.

  handlers['0.keyboard.didchangeframe'] = {
    fn: move((current) => current !== null, false),
    field: null,
    passes: true,
  };

  handlers['0.keyboard.didhide'] = { fn: move(() => false, true), field: null, passes: true };
}
