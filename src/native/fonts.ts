import Fonts, { type FontFace } from '../../native/modules/fonts/fonts';

export type FontWeight = 'normal' | 'bold' | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

/** A font file: a `file://` URI, or one with the weight and style it draws. */
export type FontSource = string | { uri: string; weight?: FontWeight; style?: 'normal' | 'italic' };

const WEIGHTS: Record<string, number> = { normal: 400, bold: 700 };

function face(family: string, source: FontSource): FontFace {
  const {
    uri,
    weight = 400,
    style = 'normal',
  } = typeof source === 'string' ? { uri: source } : source;
  const number = typeof weight === 'string' ? WEIGHTS[weight] : weight;

  if (typeof uri !== 'string' || uri.indexOf('file://') !== 0)
    throw new TypeError(
      `fonts.load: ${family}'s '${String(uri)}' is not a file:// URI; download it with fileSystem.download first`,
    );

  if (typeof number !== 'number' || number % 100 !== 0 || number < 100 || number > 900)
    throw new TypeError(
      `fonts.load: ${family}'s weight must be normal, bold or 100 to 900 in hundreds, not ${String(weight)}`,
    );

  if (style !== 'normal' && style !== 'italic')
    throw new TypeError(
      `fonts.load: ${family}'s style must be normal or italic, not ${String(style)}`,
    );

  return { family, uri, weight: number, style };
}

// Fonts registered at run time (docs/fonts.md). Once `load` resolves,
// `fontFamily` takes each family, and `fontWeight` and `fontStyle` pick among
// its files.

/** Registers each family's files, by the name `fontFamily` uses. */
export function load(fonts: Record<string, FontSource | readonly FontSource[]>): Promise<void> {
  try {
    const faces = Object.keys(fonts).flatMap((family) => {
      const sources = fonts[family];
      const list: readonly FontSource[] = Array.isArray(sources) ? sources : [sources];

      if (family === '') throw new TypeError('fonts.load: a family needs a name');
      if (list.length === 0) throw new TypeError(`fonts.load: ${family} has no files`);

      return list.map((source) => face(family, source));
    });

    return Fonts.load(faces);
  } catch (error) {
    return Promise.reject(error);
  }
}

/** Whether `fontFamily` takes `family`: bundled, or loaded by `load`. */
export const loaded = (family: string): boolean => Fonts.isLoaded(family);
