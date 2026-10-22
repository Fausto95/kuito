// Text measured from a font table the test declares (docs/testing.md#fonts):
// every glyph's advance and the line height of each face, so a layout comes
// out the same on every machine. Lines wrap at spaces as UIKit's labels do,
// and sizes round up to the device's pixels as `sizeThatFits` does.
import type { MeasureMode, Size } from './layout.ts';

/** One face at one size: the advances a glyph moves the pen by, in points. */
export interface FontFace {
  /** The family a view's `fontFamily` names; absent for the system font. */
  family?: string;
  /** 100 to 900, as CSS numbers weights. */
  weight: number;
  italic?: boolean;
  /** The point size the advances and line height are for; other sizes scale them. */
  size: number;
  lineHeight: number;
  advances: Readonly<Record<string, number>>;
  /** The advance of a glyph `advances` does not list. */
  fallback: number;
  /** What the font's kerning adds between two glyphs, by the pair: `To` is T then o. */
  kerning?: Readonly<Record<string, number>>;
}

export interface FontTable {
  faces: readonly FontFace[];
}

/**
 * The table a test gets when it declares none: one face, every glyph half
 * its size wide and lines 1.2 times its size tall.
 */
export const DEFAULT_FONTS: FontTable = {
  faces: [{ weight: 400, size: 10, lineHeight: 12, advances: {}, fallback: 5 }],
};

/** What a Text's props say about its font, as the renderers read them. */
export interface TextStyle {
  fontSize: number;
  weight: number;
  italic: boolean;
  family: string | null;
  letterSpacing: number;
  lineHeight: number | null;
  lines: number;
}

/** fontWeight's values, as KuitoTextStyle.swift reads them; normal when reset. */
const WEIGHTS: Readonly<Record<string, number>> = {
  normal: 400,
  bold: 700,
  ...Object.fromEntries([100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => [String(w), w])),
};

export function textStyle(props: Readonly<Record<string, unknown>>): TextStyle {
  const number = (name: string) => (typeof props[name] === 'number' ? props[name] : null);
  const text = (name: string) => (typeof props[name] === 'string' ? props[name] : null);

  return {
    fontSize: number('fontSize') ?? 17,
    weight: WEIGHTS[text('fontWeight') ?? String(number('fontWeight') ?? 'normal')] ?? 400,
    italic: text('fontStyle') === 'italic',
    family: text('fontFamily'),
    letterSpacing: number('letterSpacing') ?? 0,
    lineHeight: number('lineHeight'),
    lines: number('lineClamp') ?? 0,
  };
}

/** `text` as the label shows it: textTransform applied. */
export function transformed(text: string, transform: unknown): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      // As Foundation's `capitalized`: each word's first letter up, the rest down.
      return text
        .toLowerCase()
        .replace(
          /(^|[^\p{L}\p{N}'’])(\p{L})/gu,
          (_, before: string, letter: string) => before + letter.toUpperCase(),
        );
    default:
      return text;
  }
}

/** The face nearest `style`: its family, then the closest weight, then the closest size. */
function faceOf(fonts: FontTable, style: TextStyle): FontFace {
  const family = fonts.faces.filter((face) => (face.family ?? null) === style.family);
  const candidates = family.length
    ? family
    : fonts.faces.filter((face) => face.family === undefined);
  const ranked = (candidates.length ? candidates : fonts.faces)
    .slice()
    .sort(
      (a, b) =>
        Number(!!a.italic !== style.italic) - Number(!!b.italic !== style.italic) ||
        Math.abs(a.weight - style.weight) - Math.abs(b.weight - style.weight) ||
        Math.abs(a.size - style.fontSize) - Math.abs(b.size - style.fontSize),
    );
  const face = ranked[0];

  if (!face) throw new Error('The font table has no faces: declare at least one');

  return face;
}

/** Up to the next device pixel, as UIKit sizes a label. */
const ceilToPixel = (value: number, scale: number) =>
  scale > 0 ? Math.ceil(value * scale - 1e-6) / scale : value;

/** Measures text with a face: the width of a run, its lines and their height. */
class Pen {
  private readonly scale: number;
  private readonly face: FontFace;
  private readonly style: TextStyle;

  constructor(fonts: FontTable, style: TextStyle) {
    this.style = style;
    this.face = faceOf(fonts, style);
    this.scale = style.fontSize / this.face.size;
  }

  get lineHeight(): number {
    return this.style.lineHeight ?? this.face.lineHeight * this.scale;
  }

  width(run: string): number {
    // The iOS renderer always sets the label's kern to its letterSpacing,
    // and UIKit reads a kern of zero as kerning off.
    const kerning = this.style.letterSpacing === 0 ? {} : (this.face.kerning ?? {});
    let width = 0;
    let previous = '';

    for (const glyph of run) {
      width +=
        (this.face.advances[glyph] ?? this.face.fallback) * this.scale + this.style.letterSpacing;

      width += (kerning[previous + glyph] ?? 0) * this.scale;
      previous = glyph;
    }

    return width;
  }

  /**
   * `text`'s lines within `limit`: broken at spaces, and inside a word only
   * when it alone is wider. A line broken at a space hangs it; the last line
   * keeps its trailing spaces, as a label measures them.
   */
  lines(text: string, limit: number): string[] {
    const lines: string[] = [];

    for (const paragraph of text.split('\n')) {
      let line = '';

      for (const word of paragraph.split(/(?<= )/)) {
        const candidate = line + word;

        if (line === '' || this.width(candidate.trimEnd()) <= limit) {
          line = candidate;
          continue;
        }

        lines.push(line.trimEnd());
        line = word;
      }

      // A word wider than the limit breaks between glyphs.
      while (this.width(line.trimEnd()) > limit && line.length > 1) {
        let fits = 1;

        while (fits < line.length && this.width(line.slice(0, fits + 1)) <= limit) fits++;

        lines.push(line.slice(0, fits));
        line = line.slice(fits);
      }

      lines.push(line);
    }

    return lines;
  }
}

/**
 * A label's size for the engine's measure call, as KuitoRootView.swift asks
 * UIKit for it: a min-content width is the widest word, an undefined one
 * unbounded, and the height is never a limit unless it is exact.
 */
export function measureText(
  fonts: FontTable,
  scale: number,
  text: string,
  style: TextStyle,
  width: number,
  widthMode: MeasureMode,
  height: number,
  heightMode: MeasureMode,
): Size {
  if (text === '') return { width: 0, height: heightMode === 'exactly' ? height : 0 };

  const pen = new Pen(fonts, style);
  const widest = Math.max(...text.split(/\s+/).map((word) => ceilToPixel(pen.width(word), scale)));
  const limit =
    widthMode === 'minContent' ? widest : widthMode === 'undefined' ? Infinity : Math.max(width, 0);
  const all = pen.lines(text, limit);
  const lines = style.lines > 0 ? all.slice(0, style.lines) : all;
  const measured = {
    width: Math.min(ceilToPixel(Math.max(...lines.map((line) => pen.width(line))), scale), limit),
    height: ceilToPixel(lines.length * pen.lineHeight, scale),
  };

  return {
    width: widthMode === 'exactly' ? width : measured.width,
    height: heightMode === 'exactly' ? height : measured.height,
  };
}
