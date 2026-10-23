/**
 * The images an app imports (docs/assets.md), written into each shell under
 * the name the compiler gave them: an asset catalog on iOS, resources on
 * Android. iOS draws SVG and PDF from the catalog as vectors; Android draws
 * SVG converted to a VectorDrawable and PDF with its PdfRenderer. The
 * generators are pure; `writeImages` reads and writes, and only when an
 * image's bytes changed (src/cli/generated.ts).
 */
import { relative } from 'node:path';
import type { BundledAsset } from '../dev/assets.ts';
import type { Platform } from './config.ts';
import { writeStamped, type Generated, type Read } from './generated.ts';
import { vectorDrawable } from './vector-drawable.ts';

/** The catalog the iOS shell's spec adds when the app bundles images. */
export const IMAGE_CATALOG = 'Assets.xcassets';

/** The resource directory the Android shell adds (`kuito.imagesRes`). */
export const IMAGE_RESOURCES = 'images';

/** An image as the generators read it: each variant's bytes through `read`. */
interface ImageSettings {
  name: string;
  type: BundledAsset['type'];
  variants: { scale: number; source: { path: string; origin: string } }[];
}

const catalog = (value: object) => JSON.stringify(value, null, 2) + '\n';

const INFO = { author: 'xcode', version: 1 };

const EXTENSIONS: Record<BundledAsset['type'], string> = {
  png: 'png',
  jpeg: 'jpg',
  svg: 'svg',
  pdf: 'pdf',
};

function iosImages(images: ImageSettings[], read: Read): Generated {
  const files: Generated['files'] = { 'Contents.json': catalog({ info: INFO }) };

  for (const { name, type, variants } of images) {
    const vector = type === 'svg' || type === 'pdf';
    const entries = variants.map(({ scale, source }) => {
      const filename = `${name}${vector ? '' : `@${scale}x`}.${EXTENSIONS[type]}`;

      files[`${name}.imageset/${filename}`] = read(source);

      return vector
        ? { idiom: 'universal', filename }
        : { idiom: 'universal', filename, scale: `${scale}x` };
    });

    files[`${name}.imageset/Contents.json`] = catalog({
      images: entries,
      info: INFO,
      // Drawn from the vector at any size, not from a 1x rendering of it.
      ...(vector && { properties: { 'preserves-vector-representation': true } }),
    });
  }

  return { files, warnings: [] };
}

const DENSITIES: Readonly<Record<number, string>> = { 1: 'mdpi', 2: 'xhdpi', 3: 'xxhdpi' };

/** Per type, how a variant becomes resource files. */
const ANDROID: Record<
  BundledAsset['type'],
  (name: string, scale: number, bytes: Uint8Array, origin: string) => Generated['files']
> = {
  png: (name, scale, bytes) => ({ [`drawable-${DENSITIES[scale]}/${name}.png`]: bytes }),
  jpeg: (name, scale, bytes) => ({ [`drawable-${DENSITIES[scale]}/${name}.jpg`]: bytes }),
  svg: (name, _scale, bytes, origin) => {
    try {
      return { [`drawable/${name}.xml`]: vectorDrawable(Buffer.from(bytes).toString('utf8')) };
    } catch (error) {
      throw new Error(`${origin}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  },
  // Raw: PdfRenderer reads the file itself (KuitoPdfDrawable).
  pdf: (name, _scale, bytes) => ({ [`raw/${name}.pdf`]: bytes }),
};

function androidImages(images: ImageSettings[], read: Read): Generated {
  const files: Generated['files'] = {};

  for (const { name, type, variants } of images)
    for (const { scale, source } of variants)
      Object.assign(files, ANDROID[type](name, scale, read(source), source.origin));

  return { files, warnings: [] };
}

const GENERATORS: Record<Platform, (images: ImageSettings[], read: Read) => Generated> = {
  ios: iosImages,
  android: androidImages,
};

/** Bump when the generated files change for the same images. */
const FORMAT = 2;

const settings = (assets: readonly BundledAsset[], root: string): ImageSettings[] =>
  assets.map(({ name, type, variants }) => ({
    name,
    type,
    variants: variants.map(({ scale, file }) => ({
      scale,
      source: { path: file, origin: relative(root, file) },
    })),
  }));

/** The images for `platform`, by path under its directory. */
export const bundledImages = (
  platform: Platform,
  assets: readonly BundledAsset[],
  root: string,
  read: Read,
) => GENERATORS[platform](settings(assets, root), read);

/**
 * Writes `platform`'s images into `directory` when they changed since the
 * last build, and removes it when the app bundles none.
 */
export function writeImages(
  platform: Platform,
  assets: readonly BundledAsset[],
  root: string,
  directory: string,
) {
  const images = settings(assets, root);

  return writeStamped(directory, { FORMAT, platform, images }, (read) =>
    images.length ? GENERATORS[platform](images, read) : null,
  );
}
