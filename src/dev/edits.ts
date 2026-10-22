import MagicString from 'magic-string';

/**
 * One change a compiler pass makes to a module's source, as data: passes
 * return edits, and one MagicString applies them all, so the module gets one
 * source map. The insert operations are MagicString's: text inserted "left"
 * of an offset belongs to the code before it, "right" to the code after it,
 * which decides where it goes when that code moves or is wrapped twice.
 */
export type Edit =
  | { op: 'appendLeft' | 'prependLeft' | 'appendRight' | 'prependRight'; at: number; text: string }
  | { op: 'overwrite'; start: number; end: number; text: string }
  | { op: 'move'; start: number; end: number; to: number }
  | { op: 'append'; text: string };

export function applyEdits(code: MagicString, edits: readonly Edit[], offset = 0): MagicString {
  for (const edit of edits) {
    switch (edit.op) {
      case 'appendLeft':
      case 'prependLeft':
      case 'appendRight':
      case 'prependRight':
        code[edit.op](edit.at - offset, edit.text);
        break;
      case 'overwrite':
        code.overwrite(edit.start - offset, edit.end - offset, edit.text);
        break;
      case 'move':
        code.move(edit.start - offset, edit.end - offset, edit.to - offset);
        break;
      case 'append':
        code.append(edit.text);
        break;
    }
  }

  return code;
}

/** The edits strictly inside `start`–`end`: what a copy of that range must keep. */
export function editsWithin(edits: readonly Edit[], start: number, end: number): Edit[] {
  return edits.filter((edit) => {
    switch (edit.op) {
      case 'appendLeft':
      case 'prependLeft':
      case 'appendRight':
      case 'prependRight':
        return edit.at > start && edit.at < end;
      case 'overwrite':
      case 'move':
        return edit.start >= start && edit.end <= end;
      case 'append':
        return false;
    }
  });
}

/** `source` with `edits`, and its source map. */
export function render(source: string, filename: string, edits: readonly Edit[]) {
  const code = applyEdits(new MagicString(source), edits);

  return {
    code: code.toString(),
    map: code.generateMap({ hires: true, source: filename, includeContent: true }),
  };
}
