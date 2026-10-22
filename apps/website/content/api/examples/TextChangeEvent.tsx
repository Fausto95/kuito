// Share a text-event handler between low-level native integrations.
import { signal, type TextChangeEvent } from 'kuito';

export const query = signal('');
export function receiveText(event: TextChangeEvent) {
  query.value = event.text;
}
// TextField's onChange receives the string directly, not this event object.
