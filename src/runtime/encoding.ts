// UTF-8 through the host (native/shared/Standard.cpp), which converts with
// JSI's own strings instead of a byte loop in the interpreter.
import { host } from './host';

function utf8Host() {
  const encode = host.__kuitoHostEncodeUtf8;
  const decode = host.__kuitoHostDecodeUtf8;

  if (typeof encode !== 'function' || typeof decode !== 'function')
    throw new Error('This Kuito host has no UTF-8 conversion (__kuitoHostEncodeUtf8)');

  return { encode, decode };
}

export function encodeUtf8(text: string): ArrayBuffer {
  return utf8Host().encode(text);
}

/** Invalid sequences decode as U+FFFD. */
export function decodeUtf8(view: ArrayBufferView | ArrayBuffer): string {
  if (ArrayBuffer.isView(view))
    return utf8Host().decode(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength);

  return utf8Host().decode(view, 0, view.byteLength);
}

export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  // By tag, not instanceof: buffers may come from another realm (tests, hosts).
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

class KuitoTextEncoder implements TextEncoder {
  readonly encoding = 'utf-8';

  encode(text = ''): Uint8Array {
    return new Uint8Array(encodeUtf8(String(text)));
  }

  /** Whole characters only: one that doesn't fit stops the write. */
  encodeInto(text: string, into: Uint8Array): { read: number; written: number } {
    let read = 0;
    let written = 0;

    for (const char of String(text)) {
      const bytes = new Uint8Array(encodeUtf8(char));

      if (written + bytes.byteLength > into.byteLength) break;

      into.set(bytes, written);
      written += bytes.byteLength;
      read += char.length;
    }

    return { read, written };
  }
}

const UTF8_LABELS = [
  'utf-8',
  'utf8',
  'unicode-1-1-utf-8',
  'unicode11utf8',
  'unicode20utf8',
  'x-unicode20utf8',
];

class KuitoTextDecoder implements TextDecoder {
  readonly encoding = 'utf-8';
  readonly fatal = false;
  readonly ignoreBOM: boolean;

  constructor(label = 'utf-8', options: { fatal?: boolean; ignoreBOM?: boolean } = {}) {
    if (UTF8_LABELS.indexOf(String(label).trim().toLowerCase()) === -1)
      throw RangeError(`TextDecoder decodes UTF-8 only, not "${label}"`);

    if (options.fatal)
      throw TypeError('TextDecoder has no fatal mode: invalid bytes always decode as U+FFFD');

    this.ignoreBOM = Boolean(options.ignoreBOM);
  }

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (input === undefined) return '';

    const bytes = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
    const bom = !this.ignoreBOM && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

    return decodeUtf8(bom ? bytes.subarray(3) : bytes);
  }
}

export function installEncoding(): void {
  if (typeof host.__kuitoHostEncodeUtf8 !== 'function') return;

  host.TextEncoder = KuitoTextEncoder;
  host.TextDecoder = KuitoTextDecoder;
}
