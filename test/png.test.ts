import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { crc32, deflateSync } from 'node:zlib';
import {
  decodePng,
  encodePng,
  flatten,
  hasTransparency,
  resize,
  type Image,
} from '../src/cli/png.ts';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function chunk(type: string, data: Uint8Array) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

interface Raw {
  width: number;
  height: number;
  depth: number;
  colorType: number;
  interlace?: number;
  /** Each row's filtered bytes, filter type first. */
  rows: number[][];
  before?: [string, number[]][];
}

/** A PNG written by hand, so the decoder is checked against more than its own encoder. */
function png({ width, height, depth, colorType, interlace = 0, rows, before = [] }: Raw) {
  const header = Buffer.alloc(13);

  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([depth, colorType, 0, 0, interlace], 8);

  return new Uint8Array(
    Buffer.concat([
      Buffer.from(SIGNATURE),
      chunk('IHDR', header),
      ...before.map(([type, data]) => chunk(type, Uint8Array.from(data))),
      chunk('IDAT', deflateSync(Uint8Array.from(rows.flat()))),
      chunk('IEND', new Uint8Array()),
    ]),
  );
}

const pixel = (image: Image, x: number, y: number) => [
  ...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
];

const solid = (width: number, height: number, rgba: number[]): Image => {
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);

  return { width, height, data };
};

test('an encoded image decodes to the same pixels', () => {
  const image = solid(3, 2, [10, 20, 30, 255]);

  image.data.set([200, 100, 0, 128], 4 * 4);

  assert.deepEqual(decodePng(encodePng(image)), image);
});

test('RGB rows undo every filter type', () => {
  // Two pixels a row: [10,20,30] [40,50,60] on row 0, [11,22,33] [44,55,66] after.
  const decoded = decodePng(
    png({
      width: 2,
      height: 5,
      depth: 8,
      colorType: 2,
      rows: [
        [0, 10, 20, 30, 40, 50, 60],
        // Sub: each byte minus the one a pixel to its left.
        [1, 11, 22, 33, 33, 33, 33],
        // Up: minus the byte above.
        [2, 0, 0, 0, 0, 0, 0],
        // Average of left and up: row 3 = row 2.
        [3, 11 - 5, 22 - 11, 33 - 16, 44 - 27, 55 - 38, 66 - 49],
        // Paeth: with equal rows above, the predictor is the byte above.
        [4, 0, 0, 0, 0, 0, 0],
      ],
    }),
  );

  assert.deepEqual(pixel(decoded, 0, 0), [10, 20, 30, 255]);
  assert.deepEqual(pixel(decoded, 1, 0), [40, 50, 60, 255]);

  for (const y of [1, 2, 3, 4]) {
    assert.deepEqual(pixel(decoded, 0, y), [11, 22, 33, 255], `row ${y}`);
    assert.deepEqual(pixel(decoded, 1, y), [44, 55, 66, 255], `row ${y}`);
  }
});

test('palettes, their transparency and packed bit depths decode to RGBA', () => {
  const decoded = decodePng(
    png({
      width: 4,
      height: 1,
      depth: 2,
      colorType: 3,
      // Indices 0 1 2 3, two bits each.
      rows: [[0, 0b00_01_10_11]],
      before: [
        ['PLTE', [255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]],
        ['tRNS', [0, 128]],
      ],
    }),
  );

  assert.deepEqual(
    [0, 1, 2, 3].map((x) => pixel(decoded, x, 0)),
    [
      [255, 0, 0, 0],
      [0, 255, 0, 128],
      [0, 0, 255, 255],
      [9, 9, 9, 255],
    ],
  );
});

test('16-bit grayscale with alpha keeps the high byte of each sample', () => {
  const decoded = decodePng(
    png({ width: 1, height: 1, depth: 16, colorType: 4, rows: [[0, 0x80, 0xff, 0x40, 0x01]] }),
  );

  assert.deepEqual(pixel(decoded, 0, 0), [0x80, 0x80, 0x80, 0x40]);
});

test('files that are not PNGs, or interlaced ones, are refused with what to do', () => {
  assert.throws(() => decodePng(new TextEncoder().encode('GIF89a')), /not a PNG/);

  assert.throws(
    () => decodePng(png({ width: 1, height: 1, depth: 8, colorType: 2, interlace: 1, rows: [] })),
    /interlaced.*save it without interlacing/i,
  );
});

test('resizing averages the source pixels each output pixel covers, weighting by alpha', () => {
  const image = solid(2, 2, [255, 0, 0, 255]);

  image.data.set([0, 0, 255, 255], 4);
  image.data.set([0, 0, 0, 0], 8);
  image.data.set([0, 0, 0, 0], 12);

  // Red and blue average to purple; the transparent half only lowers coverage.
  assert.deepEqual(pixel(resize(image, 1, 1), 0, 0), [128, 0, 128, 128]);
  assert.deepEqual(resize(image, 2, 2), image, 'the same size is a copy');

  const large = resize(solid(1024, 1024, [30, 60, 90, 255]), 432, 432);

  assert.equal(large.width, 432);
  assert.deepEqual(pixel(large, 431, 431), [30, 60, 90, 255]);
});

test('transparency is found and flattened onto a background color', () => {
  const image = solid(2, 1, [0, 0, 0, 255]);

  assert.equal(hasTransparency(image), false);

  image.data.set([255, 0, 0, 128], 4);

  assert.equal(hasTransparency(image), true);

  const flat = flatten(image, [255, 255, 255]);

  assert.equal(hasTransparency(flat), false);
  assert.deepEqual(pixel(flat, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(pixel(flat, 1, 0), [255, 127, 127, 255]);
});
