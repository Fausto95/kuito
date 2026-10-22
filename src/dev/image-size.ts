// The size an image file declares, read from its header: pixels for PNG and
// JPEG, points for SVG and PDF. Pure: bytes in, size out.

export interface Size {
  width: number;
  height: number;
}

/** The image types an app can import; each is bundled into both shells (docs/assets.md). */
export type ImageType = 'png' | 'jpeg' | 'svg' | 'pdf';

export const IMAGE_TYPES: Readonly<Record<string, ImageType>> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  svg: 'svg',
  pdf: 'pdf',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(bytes: Uint8Array): Size {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte))
    throw new Error('not a PNG file');

  // IHDR is always the first chunk: width and height follow its type.
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// Start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and CC (DAC) share the range.
const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(bytes: Uint8Array): Size {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG file');

  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('a malformed JPEG file');

    const marker = bytes[offset + 1];

    // Fill bytes before a marker.
    if (marker === 0xff) {
      offset++;
      continue;
    }

    if (isStartOfFrame(marker))
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };

    offset += 2 + view.getUint16(offset + 2);
  }

  throw new Error('a JPEG file with no frame');
}

const attribute = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`).exec(tag)?.[1];

/** A length in user units: a number, optionally in px. Percentages and other units have no size. */
function svgLength(value: string | undefined) {
  const match = value === undefined ? null : /^\s*([\d.]+)\s*(px)?\s*$/.exec(value);

  return match ? Number(match[1]) : null;
}

/** `width` and `height`, or the viewBox's when they are missing or relative. */
export function svgSize(text: string): Size {
  const tag = /<svg\b[^>]*>/.exec(text)?.[0];

  if (!tag) throw new Error('not an SVG file: no <svg> element');

  const box = attribute(tag, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = svgLength(attribute(tag, 'width')) ?? box?.[2];
  const height = svgLength(attribute(tag, 'height')) ?? box?.[3];

  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height))
    throw new Error('an SVG needs a width and height or a viewBox to have a size');

  return { width, height };
}

/** The first page's MediaBox, in points. */
function pdfSize(bytes: Uint8Array): Size {
  const text = Buffer.from(bytes).toString('latin1');

  if (!text.startsWith('%PDF-')) throw new Error('not a PDF file');

  const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(text);

  if (!box) throw new Error('a PDF whose page size is not readable (no plain /MediaBox)');

  const [left, bottom, right, top] = box.slice(1).map(Number);

  return { width: Math.abs(right - left), height: Math.abs(top - bottom) };
}

const READERS: Record<ImageType, (bytes: Uint8Array) => Size> = {
  png: pngSize,
  jpeg: jpegSize,
  svg: (bytes) => svgSize(Buffer.from(bytes).toString('utf8')),
  pdf: pdfSize,
};

export const imageSize = (type: ImageType, bytes: Uint8Array): Size => READERS[type](bytes);
