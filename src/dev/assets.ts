// Images an app imports (docs/assets.md): `import cover from './cover.png'`
// resolves to a bundled source with the image's size in points, and the
// compile result lists every image so the CLI writes it into both shells.
// `cover@2x.png` and `cover@3x.png` beside it are the same image at those
// scales; the import names the 1x file, which may be missing. An SVG
// imported with `?drawing` is its shapes instead, which a Drawing draws
// (docs/drawing.md): read here, and bundled into no shell.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'rolldown';
import { IMAGE_TYPES, imageSize, type ImageType } from './image-size.ts';
import { svgDrawing } from './svg-drawing.ts';

const DRAWING = '?drawing';

export type Scale = 1 | 2 | 3;

export interface ImageVariant {
  scale: Scale;
  file: string;
}

/** An image the bundle imports, as the shells bundle it. */
export interface BundledAsset {
  /** The name both shells know it by: an asset catalog entry, an Android resource. */
  name: string;
  /** The file the import names. */
  file: string;
  type: ImageType;
  /** Raster scales present; a vector image is its one file at scale 1. */
  variants: ImageVariant[];
  /** In points. */
  width: number;
  height: number;
  /** Of every variant's bytes: a shell built with another hash shows stale pixels. */
  hash: string;
}

const SCALES: readonly Scale[] = [1, 2, 3];

/** `cover.png` → `cover@2x.png`. */
const variantFile = (file: string, scale: Scale) => {
  if (scale === 1) return file;

  const extension = extname(file);

  return file.slice(0, -extension.length) + `@${scale}x` + extension;
};

export const imageType = (file: string): ImageType | null =>
  IMAGE_TYPES[extname(file).slice(1).toLowerCase()] ?? null;

/**
 * Android resource names allow only `[a-z0-9_]` and must start with a letter;
 * the name is the image's path from the app's root with everything else an
 * underscore, so it reads back to its file.
 */
export function assetName(root: string, file: string) {
  const path = relative(root, file);
  const withoutExtension = path.slice(0, -extname(path).length);
  const segments = withoutExtension
    .split(sep)
    .map((segment) => (segment === '..' ? 'up' : segment));

  return (
    'asset_' +
    segments
      .join('_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
  );
}

function variantsOf(file: string, type: ImageType): ImageVariant[] {
  const scales = type === 'png' || type === 'jpeg' ? SCALES : [1 as const];

  return scales
    .map((scale) => ({ scale, file: variantFile(file, scale) }))
    .filter((variant) => existsSync(variant.file));
}

/** The image an import names, read from its files. */
export function readAsset(root: string, file: string): BundledAsset {
  const type = imageType(file);

  if (!type) throw new Error(`${file} is not an image Kuito bundles (png, jpg, svg or pdf)`);

  const variants = variantsOf(file, type);
  const largest = variants.at(-1);

  if (!largest) throw new Error(`${file}: no such image, at any scale`);

  const hash = createHash('sha256');
  let size = { width: 0, height: 0 };

  for (const variant of variants) {
    const bytes = readFileSync(variant.file);

    hash.update(String(variant.scale)).update(bytes);

    // The largest scale is the sharpest measure of the size in points.
    if (variant === largest) {
      try {
        size = imageSize(type, bytes);
      } catch (error) {
        throw new Error(
          `${variant.file}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
  }

  return {
    name: assetName(root, file),
    file,
    type,
    variants,
    width: Math.round((size.width / largest.scale) * 100) / 100,
    height: Math.round((size.height / largest.scale) * 100) / 100,
    hash: hash.digest('hex').slice(0, 16),
  };
}

interface AssetPluginOptions {
  /** The app's root: asset names are paths from it. */
  root: string;
  /** Filled with the bundle's images, by name. */
  assets: BundledAsset[];
  /** Every file an image is read from, for the watcher. */
  onFile: (file: string) => void;
}

export function createAssetPlugin({ root, assets, onFile }: AssetPluginOptions): Plugin {
  return {
    name: 'kuito-assets',
    buildStart() {
      assets.length = 0;
    },
    resolveId(id: string, importer: string | undefined) {
      if (id.endsWith('.svg' + DRAWING) && importer && (id.startsWith('.') || isAbsolute(id))) {
        const file = resolve(dirname(importer), id.slice(0, -DRAWING.length));

        return existsSync(file) ? file + DRAWING : null;
      }

      const type = imageType(id);

      if (!type || !importer || !(id.startsWith('.') || isAbsolute(id))) return null;

      const file = resolve(dirname(importer), id);

      // Only @2x or @3x may exist: the import still names the image.
      return variantsOf(file, type).length > 0 ? file : null;
    },
    load(id: string) {
      if (!id.startsWith('\0') && id.endsWith('.svg' + DRAWING)) {
        const file = id.slice(0, -DRAWING.length);

        onFile(file);

        try {
          const drawing = svgDrawing(readFileSync(file, 'utf8'));

          return { code: `export default ${JSON.stringify(drawing)};`, moduleType: 'js' };
        } catch (error) {
          throw new Error(
            `${relative(root, file)}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }

      if (id.startsWith('\0') || !imageType(id)) return null;

      const asset = readAsset(root, id);
      const clash = assets.find(({ name, file }) => name === asset.name && file !== id);

      if (clash)
        throw new Error(
          `${relative(root, id)} and ${relative(root, clash.file)} are both bundled as ` +
            `${asset.name}: rename one (docs/assets.md)`,
        );

      asset.variants.forEach(({ file }) => onFile(file));
      assets.push(asset);
      // Modules load in parallel: the order is the names'.
      assets.sort((a, b) => a.name.localeCompare(b.name));

      const source = { asset: asset.name, width: asset.width, height: asset.height };

      return { code: `export default ${JSON.stringify(source)};`, moduleType: 'js' };
    },
  };
}
