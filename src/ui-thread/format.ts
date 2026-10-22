import { queueProp } from './bindings';
import { formatEdit, textEditOf } from '../runtime/text-edits';

/**
 * A field's `format` as the handler of its `format` events: the text it
 * shows, then the caret, are written before the event returns, so the field
 * never draws what the user typed unformatted (docs/keyboard.md#formatting).
 */
export function formatHandler(
  view: number,
  format: (text: string) => unknown,
): (event: unknown) => void {
  return (event) => {
    const edit = textEditOf(event);
    const shown = formatEdit(format, edit);

    if (shown === edit) return;

    queueProp(view, 'text', shown.text);
    queueProp(view, 'selection', { start: shown.start, end: shown.end });
  };
}
