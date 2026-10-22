// A field's text after an edit and what its `format` makes of it
// (docs/keyboard.md#formatting). Pure: both kernels run it, the UI thread
// before the frame and the JS thread when the format could not move there.

/** A field's text and selection, in UTF-16 offsets as HTML counts them. */
export interface TextEdit {
  text: string;
  start: number;
  end: number;
}

/**
 * Beyond this many character pairs, the changed middle of a text is not
 * aligned character by character: a caret in it keeps its offset there.
 * Typing changes a few characters around the caret, so only a format that
 * rewrites a long text whole comes near it.
 */
const ALIGNED_PAIRS = 1 << 16;

/** An edit as a `format` event carries it, checked: a native payload is untrusted. */
export function textEditOf(value: unknown): TextEdit {
  if (typeof value !== 'object' || value === null)
    throw new TypeError('A format event carries the text and selection');

  const { text, start, end } = value as Partial<Record<keyof TextEdit, unknown>>;

  if (typeof text !== 'string' || !isOffset(start) || !isOffset(end))
    throw new TypeError('A format event carries the text and selection');

  return { text, start, end };
}

const isOffset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** What `format` shows for the user's edit, with the selection moved along. */
export function formatEdit(format: (text: string) => unknown, edit: TextEdit): TextEdit {
  const text = format(edit.text);

  if (typeof text !== 'string')
    throw new TypeError(
      'format returned ' + describe(text) + '; it returns the text the field shows',
    );

  if (text === edit.text) return edit;

  const start = placeCaret(edit.text, edit.start, text);

  return {
    text,
    start,
    end: edit.end === edit.start ? start : placeCaret(edit.text, edit.end, text),
  };
}

function describe(value: unknown): string {
  if (value === null) return 'null';

  if (value === undefined) return 'undefined';

  return /^[aeiou]/.test(typeof value) ? 'an ' + typeof value : 'a ' + typeof value;
}

const same = (a: string, b: string) => a === b || a.toLowerCase() === b.toLowerCase();

/**
 * Where `offset` in `before` goes in `after`: after the same character it
 * followed among those both share, letters matched whatever their case.
 * Shared starts and ends hold their place; a caret right before the shared
 * end stays before it, so a character the format replaced leaves the caret
 * after what replaced it.
 */
export function placeCaret(before: string, offset: number, after: string): number {
  const shortest = Math.min(before.length, after.length);
  let prefix = 0;

  while (prefix < shortest && same(before[prefix], after[prefix])) prefix++;

  if (offset <= prefix) return offset;

  let suffix = 0;

  while (
    suffix < shortest - prefix &&
    same(before[before.length - 1 - suffix], after[after.length - 1 - suffix])
  )
    suffix++;

  if (offset >= before.length - suffix)
    return whole(after, after.length - (before.length - offset));

  const from = before.slice(prefix, before.length - suffix);
  const to = after.slice(prefix, after.length - suffix);

  return whole(after, prefix + alignedCaret(from, offset - prefix, to));
}

/**
 * The caret at `offset` in `from`, carried to `to` along their longest
 * common subsequence: after the match of the last character before it that
 * has one. Letters and digits weigh more than the rest, so a tie keeps
 * what the user typed rather than a separator the format moved.
 */
function alignedCaret(from: string, offset: number, to: string): number {
  const rows = from.length + 1;
  const columns = to.length + 1;

  if (from.length * to.length > ALIGNED_PAIRS) return Math.min(offset, to.length);

  // best[i * columns + j]: the heaviest common subsequence of from[i..] and to[j..].
  const best = new Uint32Array(rows * columns);

  for (let i = from.length - 1; i >= 0; i--)
    for (let j = to.length - 1; j >= 0; j--) {
      const skip = Math.max(best[(i + 1) * columns + j], best[i * columns + j + 1]);
      const match = same(from[i], to[j]) ? weight(from[i]) + best[(i + 1) * columns + j + 1] : 0;

      best[i * columns + j] = Math.max(skip, match);
    }

  let caret = 0;

  for (let i = 0, j = 0; i < offset && j < to.length;) {
    const here = best[i * columns + j];

    if (same(from[i], to[j]) && here === weight(from[i]) + best[(i + 1) * columns + j + 1]) {
      caret = j + 1;
      i++;
      j++;
    } else if (best[(i + 1) * columns + j] >= best[i * columns + j + 1]) i++;
    else j++;
  }

  return caret;
}

/** Letters that have a case, and digits: what a user types, more than what a format adds. */
const weight = (character: string) =>
  character.toLowerCase() !== character.toUpperCase() || (character >= '0' && character <= '9')
    ? 2
    : 1;

/** `offset`, moved past the second half of a character made of two code units. */
function whole(text: string, offset: number): number {
  const code = text.charCodeAt(offset);

  return code >= 0xdc00 && code <= 0xdfff && offset > 0 ? offset + 1 : offset;
}
