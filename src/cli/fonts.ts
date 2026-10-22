/**
 * Bundled fonts (docs/fonts.md): the config's .ttf and .otf files, copied
 * into each shell with a manifest of the face each one is. The face comes
 * from the file's own tables unless the config names it. `fontFace` and
 * `bundledFonts` are pure; `writeFonts` reads and writes.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig, FontSource } from './kuito-config.ts';

export type FontStyle = 'normal' | 'italic';

export interface FontFace {
  family: string;
  weight: number;
  style: FontStyle;
}

/** One row of `fonts.json`, which both renderers read at startup. */
export interface BundledFace extends FontFace {
  file: string;
}

/** The manifest beside the font files in each shell. */
export const FONT_MANIFEST = 'fonts.json';

/** Where the fonts land: a folder in the iOS bundle, a directory of Android's assets. */
export const FONT_DIRECTORY = 'fonts';

// sfnt versions: TrueType outlines, CFF outlines (OTTO), and Apple's 'true'.
const SFNT_VERSIONS = new Set([0x00010000, 0x4f54544f, 0x74727565]);
const COLLECTION = 0x74746366;

// Name IDs: the typographic family groups every weight; the legacy family
// splits them into families of four (regular, bold and their italics).
const TYPOGRAPHIC_FAMILY = 16;
const FAMILY = 1;

/** The file's name in the shell: the source's own. */
export const fontFileName = ({ path }: { path: string }) =>
  path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);

function tables(view: DataView) {
  const count = view.getUint16(4);
  const found = new Map<string, { offset: number; length: number }>();

  for (let index = 0; index < count; index++) {
    const record = 12 + 16 * index;
    const tag = String.fromCharCode(...[0, 1, 2, 3].map((byte) => view.getUint8(record + byte)));

    found.set(tag, { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) });
  }

  return found;
}

/** UTF-16BE for the Unicode and Windows platforms; Mac Roman's ASCII range otherwise. */
function decodeName(bytes: Uint8Array, platform: number) {
  if (platform === 1) return String.fromCharCode(...bytes);

  let text = '';

  for (let index = 0; index + 1 < bytes.length; index += 2)
    text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);

  return text;
}

function familyName(view: DataView, table: { offset: number }) {
  const count = view.getUint16(table.offset + 2);
  const strings = table.offset + view.getUint16(table.offset + 4);
  const names = new Map<number, string>();

  for (let index = 0; index < count; index++) {
    const record = table.offset + 6 + 12 * index;
    const platform = view.getUint16(record);
    const id = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const start = strings + view.getUint16(record + 10);

    // The first record of each name wins, except that Windows (3) beats the others.
    if (names.has(id) && platform !== 3) continue;

    names.set(
      id,
      decodeName(new Uint8Array(view.buffer, view.byteOffset + start, length), platform),
    );
  }

  return names.get(TYPOGRAPHIC_FAMILY) || names.get(FAMILY) || null;
}

/** The face a font file is: its family, its OS/2 weight class, and whether it is italic. */
export function fontFace(bytes: Uint8Array): FontFace {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes.length >= 4 ? view.getUint32(0) : 0;

  if (version === COLLECTION)
    throw new Error('a font collection (.ttc); bundle its fonts one by one');

  if (!SFNT_VERSIONS.has(version)) throw new Error('not a TrueType or OpenType font');

  try {
    const found = tables(view);
    const name = found.get('name');
    const os2 = found.get('OS/2');
    const family = name ? familyName(view, name) : null;

    if (!family) throw new Error('no family name');

    // OS/2's usWeightClass, and fsSelection's ITALIC bit.
    const weightClass = os2 ? view.getUint16(os2.offset + 4) : 400;
    const italic = os2 ? (view.getUint16(os2.offset + 62) & 1) === 1 : false;
    // Some old fonts use 1 to 9.
    const weight = weightClass < 10 ? weightClass * 100 : weightClass;

    return {
      family,
      weight: Math.min(900, Math.max(100, Math.round(weight / 100) * 100)),
      style: italic ? 'italic' : 'normal',
    };
  } catch (error) {
    throw new Error('not a TrueType or OpenType font', { cause: error });
  }
}

const describe = ({ family, weight, style }: FontFace) => `${family} ${weight} ${style}`;

/**
 * The font files and their manifest, by file name, or null when the config
 * bundles no fonts. Two files of one face would make `fontWeight` ambiguous,
 * so they are an error.
 */
export function bundledFonts(
  config: AppConfig,
  read: (source: FontSource) => Uint8Array,
): { files: Record<string, Uint8Array | string>; faces: BundledFace[] } | null {
  if (config.fonts.length === 0) return null;

  const files: Record<string, Uint8Array | string> = {};
  const faces: BundledFace[] = [];
  const origins = new Map<string, string>();

  for (const source of config.fonts) {
    const bytes = read(source);
    let face: FontFace;

    try {
      face = fontFace(bytes);
    } catch (error) {
      throw new Error(
        `${source.origin} is ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    const declared: FontFace = {
      family: source.family ?? face.family,
      weight: source.weight ?? face.weight,
      style: source.style ?? face.style,
    };
    const key = describe(declared);
    const twin = origins.get(key);

    if (twin)
      throw new Error(
        `${source.origin} is ${key}, like ${twin.slice(twin.indexOf(': ') + 2)}; set weight or style on one`,
      );

    origins.set(key, source.origin);
    files[fontFileName(source)] = bytes;
    faces.push({ ...declared, file: fontFileName(source) });
  }

  files[FONT_MANIFEST] = JSON.stringify(faces, null, 2) + '\n';

  return { files, faces };
}

async function readSource(source: FontSource) {
  try {
    return new Uint8Array(await readFile(source.path));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new Error(`${source.origin} does not exist`, { cause: error });

    throw error;
  }
}

/** Replaces `directory` with the config's fonts and their manifest, or removes it without fonts. */
export async function writeFonts(config: AppConfig, directory: string) {
  const bytes = new Map<string, Uint8Array>();

  for (const source of config.fonts) bytes.set(source.path, await readSource(source));

  const output = bundledFonts(config, (source) => bytes.get(source.path) ?? new Uint8Array());

  await rm(directory, { recursive: true, force: true });

  if (!output) return;

  await mkdir(directory, { recursive: true });

  for (const [file, contents] of Object.entries(output.files))
    await writeFile(join(directory, file), contents);
}
