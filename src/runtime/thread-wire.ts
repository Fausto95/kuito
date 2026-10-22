// How values cross between the JS-thread kernel and the UI-thread kernel. Both
// bundle this module. Plain data crosses as it is (the host batch's Struct and
// List, native/shared/PlainValue.h); a few tagged objects carry what it cannot:
//   { $u: 1 }             undefined
//   { $n: 'NaN' }         a non-finite number
//   { $o: { … } }         a plain object with a key starting with `$`
//   { $m: id }            a motion value
//   { $t: id, c: [ … ] }  a UI-thread function and its captures
//   { $j: id }            a JS-thread function, called from the UI thread
//   { $s: id, v: … }      a signal: its value now, writes go to the JS thread
//   { $d: { from, op } }  a value derived from another (src/runtime/derived.ts)
import { isPlainData } from './values';

/**
 * Encodes what plain data cannot express; undefined means "not special".
 * `parent` is the object or array holding the value: a method's receiver.
 */
export type EncodeSpecial = (value: unknown, parent?: unknown) => unknown;

/** Decodes a tagged object; `tag` is its first key starting with `$`. */
export type DecodeSpecial = (tag: string, value: Record<string, unknown>) => unknown;

export function encodeValue(value: unknown, special: EncodeSpecial, path: unknown[] = []): unknown {
  const encoded = special(value, path[path.length - 1]);

  if (encoded !== undefined) return encoded;

  if (value === undefined) return { $u: 1 };

  if (typeof value === 'number') return isFinite(value) ? value : { $n: String(value) };

  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (path.indexOf(value) !== -1) throw new TypeError('A cyclic value cannot cross threads');

  if (Array.isArray(value)) {
    const items: unknown[] = value;

    return items.map((item) => encodeValue(item, special, path.concat([value])));
  }

  if (isPlainData(value)) {
    const object: Record<string, unknown> = {};
    let escaped = false;

    Object.keys(value).forEach((key) => {
      if (key.charAt(0) === '$') escaped = true;

      object[key] = encodeValue(value[key], special, path.concat([value]));
    });

    return escaped ? { $o: object } : object;
  }

  throw new TypeError(
    (typeof value === 'object' ? 'An object with a prototype' : 'A ' + typeof value) +
      ' cannot cross threads',
  );
}

export function decodeValue(value: unknown, special: DecodeSpecial): unknown {
  if (Array.isArray(value)) {
    const items: unknown[] = value;

    return items.map((item) => decodeValue(item, special));
  }

  if (!isPlainData(value)) return value;

  if ('$o' in value) return decodeObject(value.$o, special);

  if ('$u' in value) return undefined;

  if ('$n' in value) return Number(value.$n);

  const keys = Object.keys(value);

  for (let index = 0; index < keys.length; index++)
    if (keys[index].charAt(0) === '$') return special(keys[index], value);

  return decodeObject(value, special);
}

function decodeObject(value: unknown, special: DecodeSpecial): Record<string, unknown> {
  if (!isPlainData(value)) throw new TypeError('Malformed thread value');

  const object: Record<string, unknown> = {};

  Object.keys(value).forEach((key) => {
    object[key] = decodeValue(value[key], special);
  });

  return object;
}
