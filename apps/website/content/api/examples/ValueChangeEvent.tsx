// Read the boolean payload of a native control event.
import { signal, type ValueChangeEvent } from 'kuito';

export const enabled = signal(false);
export function receiveValue(event: ValueChangeEvent) {
  enabled.value = event.value;
}
// Toggle's onChange receives the boolean directly, not this event object.
