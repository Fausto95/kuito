export type CaptureUse = 'read' | 'write' | 'call' | 'callResult';

export interface ThreadCapture {
  /** `name` or a member path, `props.style.opacity`. Never includes `.value`. */
  path: string;
  uses: CaptureUse[];
}

/** One place a function reads, writes or calls a value from outside it. */
export interface Occurrence {
  path: string;
  /** Per segment after the first, whether it is read with `?.`. */
  optional: boolean[];
  start: number;
  end: number;
  use: CaptureUse;
}

/** Merges occurrences into captures in source order. */
export function captures(occurrences: Occurrence[]): ThreadCapture[] {
  const byPath = new Map<string, ThreadCapture>();

  for (const occurrence of [...occurrences].sort((a, b) => a.start - b.start)) {
    const entry = byPath.get(occurrence.path) ?? { path: occurrence.path, uses: [] };

    if (!entry.uses.includes(occurrence.use)) entry.uses.push(occurrence.use);

    byPath.set(occurrence.path, entry);
  }

  return [...byPath.values()];
}

/** The UI copy's local for a captured path: `props.style` → `props$style`. */
export const localName = (path: string) => path.replaceAll('.', '$');

/**
 * How the capture thunk reads `path`: optional wherever any occurrence reads
 * it with `?.`, so the thunk short-circuits where the function would.
 */
export function captureRead(path: string, occurrences: readonly Occurrence[]): string {
  const [root, ...segments] = path.split('.');
  const optional = segments.map((_, index) =>
    occurrences.some((each) => each.path === path && each.optional[index]),
  );

  return root + segments.map((segment, index) => (optional[index] ? '?.' : '.') + segment).join('');
}
