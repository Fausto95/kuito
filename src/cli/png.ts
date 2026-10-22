/**
 * The PNG reading, writing and resampling app icons and splash screens need
 * (src/cli/app-icons.ts, src/cli/splash-screens.ts),
 * on node:zlib alone: the CLI runs wherever Gradle does, where macOS's `sips`
 * does not, and icons need no more than 8-bit RGBA.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** 8-bit RGBA, rows top to bottom, alpha not premultiplied. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

export type Rgb = readonly [number, number, number];

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Samples a pixel of each color type has. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

interface Header {
  width: number;
  height: number;
  depth: number;
  colorType: number;
}

interface Chunks {
  header: Header;
  palette: Uint8Array | null;
  transparency: Uint8Array | null;
  data: Uint8Array;
}

function readChunks(bytes: Uint8Array): Chunks {
  if (bytes.length < 8 || SIGNATURE.some((byte, i) => bytes[i] !== byte))
    throw new Error('not a PNG');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idat: Uint8Array[] = [];
  let header: Header | null = null;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;

  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);

    if (type === 'IHDR') {
      if (body[12] !== 0)
        throw new Error(
          'an interlaced PNG, which Kuito does not read: save it without interlacing',
        );

      header = {
        width: view.getUint32(at + 8),
        height: view.getUint32(at + 12),
        depth: body[8],
        colorType: body[9],
      };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;

    at += 12 + length;
  }

  if (!header || !(header.colorType in CHANNELS)) throw new Error('not a PNG');

  try {
    return { header, palette, transparency, data: inflateSync(Buffer.concat(idat)) };
  } catch (error) {
    throw new Error('not a PNG: its image data is corrupt', { cause: error });
  }
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);

  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Undoes each row's filter in place: `data` holds rows of `stride` bytes, each
 * after its filter type byte. Returns the unfiltered rows, without those bytes.
 */
function unfilter(data: Uint8Array, rows: number, stride: number, bpp: number) {
  const out = new Uint8Array(rows * stride);

  for (let y = 0; y < rows; y++) {
    const type = data[y * (stride + 1)];
    const row = y * stride;
    const up = row - stride;
    const source = y * (stride + 1) + 1;

    out.set(data.subarray(source, source + stride), row);

    // Bytes before the first full pixel have no left neighbor, rows at the top none above.
    if (type === 1) for (let x = bpp; x < stride; x++) out[row + x] += out[row + x - bpp];
    else if (type === 2 && y > 0) for (let x = 0; x < stride; x++) out[row + x] += out[up + x];
    else if (type === 3)
      for (let x = 0; x < stride; x++)
        out[row + x] += ((x >= bpp ? out[row + x - bpp] : 0) + (y > 0 ? out[up + x] : 0)) >> 1;
    else if (type === 4)
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? out[row + x - bpp] : 0;
        const b = y > 0 ? out[up + x] : 0;
        const c = x >= bpp && y > 0 ? out[up + x - bpp] : 0;

        out[row + x] += paeth(a, b, c);
      }
    else if (type > 4) throw new Error('not a PNG: unknown row filter');
  }

  return out;
}

/** A row's `count` samples at 8 bits; 16-bit samples keep their high byte. */
function samples(raw: Uint8Array, start: number, count: number, depth: number, indexed: boolean) {
  if (depth === 8) return raw.subarray(start, start + count);

  const out = new Uint8Array(count);

  if (depth === 16) {
    for (let i = 0; i < count; i++) out[i] = raw[start + i * 2];

    return out;
  }

  const max = (1 << depth) - 1;

  for (let i = 0; i < count; i++) {
    const bit = i * depth;
    const value = (raw[start + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;

    out[i] = indexed ? value : Math.round((value * 255) / max);
  }

  return out;
}

interface Palette {
  colors: Uint8Array | null;
  alphas: Uint8Array | null;
}

/** Writes one row of samples as RGBA at `at`, by color type. */
const TO_RGBA: Readonly<
  Record<number, (row: Uint8Array, out: Uint8Array, at: number, palette: Palette) => void>
> = {
  0: (row, out, at) => {
    for (let x = 0; x < row.length; x++) out.set([row[x], row[x], row[x], 255], at + x * 4);
  },
  2: (row, out, at) => {
    for (let x = 0; x * 3 < row.length; x++)
      out.set([row[x * 3], row[x * 3 + 1], row[x * 3 + 2], 255], at + x * 4);
  },
  3: (row, out, at, { colors, alphas }) => {
    for (let x = 0; x < row.length; x++) {
      const index = row[x];

      if (!colors || index * 3 + 2 >= colors.length)
        throw new Error('not a PNG: palette index out of range');

      out.set(colors.subarray(index * 3, index * 3 + 3), at + x * 4);
      out[at + x * 4 + 3] = alphas && index < alphas.length ? alphas[index] : 255;
    }
  },
  4: (row, out, at) => {
    for (let x = 0; x * 2 < row.length; x++)
      out.set([row[x * 2], row[x * 2], row[x * 2], row[x * 2 + 1]], at + x * 4);
  },
  6: (row, out, at) => out.set(row, at),
};

export function decodePng(bytes: Uint8Array): Image {
  const { header, palette, transparency, data } = readChunks(bytes);
  const { width, height, depth, colorType } = header;
  const channels = CHANNELS[colorType];
  const stride = Math.ceil((width * channels * depth) / 8);

  if (data.length < height * (stride + 1))
    throw new Error('not a PNG: its image data is cut short');

  const raw = unfilter(data, height, stride, Math.max(1, (channels * depth) / 8));
  const out = new Uint8Array(width * height * 4);
  const write = TO_RGBA[colorType];

  for (let y = 0; y < height; y++)
    write(samples(raw, y * stride, width * channels, depth, colorType === 3), out, y * width * 4, {
      colors: palette,
      alphas: transparency,
    });

  return { width, height, data: out };
}

function chunk(type: string, body: Uint8Array) {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);

  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(body.length + 8, crc32(out.subarray(4, body.length + 8)));

  return out;
}

/** RGBA, 8-bit; every row Paeth-filtered, which suits icons' smooth fills. */
export function encodePng({ width, height, data }: Image): Uint8Array {
  const stride = width * 4;
  const filtered = new Uint8Array(height * (stride + 1));

  for (let y = 0; y < height; y++) {
    const row = y * stride;

    filtered[y * (stride + 1)] = 4;

    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[row + x - 4] : 0;
      const b = y > 0 ? data[row - stride + x] : 0;
      const c = x >= 4 && y > 0 ? data[row - stride + x - 4] : 0;

      filtered[y * (stride + 1) + 1 + x] = data[row + x] - paeth(a, b, c);
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);

  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(filtered, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

/**
 * For each output index, the first source index it covers and each covered
 * index's share of it: `taps` weights per output, zero past its last source.
 */
function coverage(from: number, to: number) {
  const scale = from / to;
  const taps = Math.ceil(scale) + 1;
  const first = new Int32Array(to);
  const weights = new Float64Array(to * taps);

  for (let i = 0; i < to; i++) {
    const start = i * scale;
    const end = (i + 1) * scale;

    first[i] = Math.floor(start);

    for (let j = first[i]; j < Math.min(from, Math.ceil(end)); j++)
      weights[i * taps + j - first[i]] = (Math.min(j + 1, end) - Math.max(j, start)) / scale;
  }

  return { first, weights, taps };
}

/**
 * Area-averaged resampling: each output pixel is the mean of the source area
 * it covers, weighted by alpha so transparent pixels lend no color. Icons are
 * only ever scaled down, where this is as sharp as a box filter gets. Runs as
 * two passes, across then down, over premultiplied channels.
 */
export function resize(image: Image, width: number, height: number): Image {
  if (width === image.width && height === image.height)
    return { width, height, data: image.data.slice() };

  const across = coverage(image.width, width);
  const down = coverage(image.height, height);
  const rows = new Float64Array(width * image.height * 4);
  const { data } = image;

  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;

      for (let t = 0; t < across.taps; t++) {
        const weight = across.weights[x * across.taps + t];

        if (weight === 0) continue;

        const from = (y * image.width + across.first[x] + t) * 4;
        const alpha = data[from + 3] * weight;

        rows[at] += data[from] * alpha;
        rows[at + 1] += data[from + 1] * alpha;
        rows[at + 2] += data[from + 2] * alpha;
        rows[at + 3] += alpha;
      }
    }

  const out = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let t = 0; t < down.taps; t++) {
        const weight = down.weights[y * down.taps + t];

        if (weight === 0) continue;

        const from = ((down.first[y] + t) * width + x) * 4;

        r += rows[from] * weight;
        g += rows[from + 1] * weight;
        b += rows[from + 2] * weight;
        a += rows[from + 3] * weight;
      }

      const at = (y * width + x) * 4;

      if (a > 0) out.set([Math.round(r / a), Math.round(g / a), Math.round(b / a)], at);

      out[at + 3] = Math.round(a);
    }

  return { width, height, data: out };
}

export function hasTransparency({ data }: Image) {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;

  return false;
}

/** `top` drawn over `bottom`, both the same size. */
export function composite(bottom: Image, top: Image): Image {
  const data = bottom.data.slice();

  for (let i = 0; i < data.length; i += 4) {
    const a = top.data[i + 3] / 255;
    const b = (data[i + 3] / 255) * (1 - a);
    const alpha = a + b;

    for (let c = 0; c < 3; c++)
      data[i + c] = alpha === 0 ? 0 : Math.round((top.data[i + c] * a + data[i + c] * b) / alpha);

    data[i + 3] = Math.round(alpha * 255);
  }

  return { ...bottom, data };
}

export function solid(width: number, height: number, [r, g, b]: Rgb): Image {
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);

  return { width, height, data };
}

export const flatten = (image: Image, background: Rgb) =>
  composite(solid(image.width, image.height, background), image);

/** `image` in the middle of a transparent `width`×`height` canvas, unscaled. */
export function pad(image: Image, width: number, height: number): Image {
  const data = new Uint8Array(width * height * 4);
  const left = Math.round((width - image.width) / 2);
  const top = Math.round((height - image.height) / 2);

  for (let y = 0; y < image.height; y++)
    data.set(
      image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4),
      ((y + top) * width + left) * 4,
    );

  return { width, height, data };
}

/** `image` drawn at `inner`×`inner` in the middle of a transparent `size`×`size` canvas. */
export const inset = (image: Image, size: number, inner: number): Image =>
  pad(resize(image, inner, inner), size, size);

/** `image` scaled to fit `width`×`height`, keeping its shape, in the middle of a canvas that size. */
export function contain(image: Image, width: number, height: number): Image {
  const scale = Math.min(width / image.width, height / image.height);

  return pad(
    resize(image, Math.round(image.width * scale), Math.round(image.height * scale)),
    width,
    height,
  );
}

/** The `inner`×`inner` square in the middle of `image`. */
export function crop(image: Image, inner: number): Image {
  const offset = Math.round((image.width - inner) / 2);
  const data = new Uint8Array(inner * inner * 4);

  for (let y = 0; y < inner; y++) {
    const from = ((y + offset) * image.width + offset) * 4;

    data.set(image.data.subarray(from, from + inner * 4), y * inner * 4);
  }

  return { width: inner, height: inner, data };
}
