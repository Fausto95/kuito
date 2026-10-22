// crypto.getRandomValues and randomUUID over the platform's CSPRNG
// (arc4random_buf, native/shared/Standard.cpp). No SubtleCrypto.
import { host } from './host';

/** Error-shaped, as Hermes has no DOMException: callers check `name`. */
function domError(name: string, message: string): Error {
  const error = new Error(message);

  error.name = name;

  return error;
}

const INTEGER_ARRAYS = [
  '[object Int8Array]',
  '[object Uint8Array]',
  '[object Uint8ClampedArray]',
  '[object Int16Array]',
  '[object Uint16Array]',
  '[object Int32Array]',
  '[object Uint32Array]',
  '[object BigInt64Array]',
  '[object BigUint64Array]',
];

/** The Web Crypto limit on one call. */
const MAX_BYTES = 65536;

export function installCrypto(): void {
  const fill = host.__kuitoHostFillRandom;

  if (typeof fill !== 'function') return;

  const getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    if (
      !ArrayBuffer.isView(array) ||
      INTEGER_ARRAYS.indexOf(Object.prototype.toString.call(array)) === -1
    )
      throw domError('TypeMismatchError', 'getRandomValues takes an integer typed array');

    if (array.byteLength > MAX_BYTES)
      throw domError('QuotaExceededError', `getRandomValues fills at most ${MAX_BYTES} bytes`);

    fill(array.buffer as ArrayBuffer, array.byteOffset, array.byteLength);

    return array;
  };

  const randomUUID = () => {
    const bytes = getRandomValues(new Uint8Array(16));

    // RFC 9562 version 4, variant 10.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => (byte + 0x100).toString(16).slice(1)).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  host.crypto = { getRandomValues, randomUUID };
}
