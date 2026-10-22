import { runInContext, type Context } from 'node:vm';

/** The array methods that may walk every element. */
const WALKS = [
  'concat',
  'every',
  'filter',
  'find',
  'findIndex',
  'forEach',
  'includes',
  'indexOf',
  'lastIndexOf',
  'map',
  'reduce',
  'slice',
  'some',
  'splice',
];

/**
 * How many elements `job` hands to array methods that may walk them all: a
 * count, so a quadratic path shows without timing anything. `realm` is a
 * kernel's context; without one, the count is of this realm's arrays.
 */
export function arrayWork(job: () => void, realm?: Context): number {
  const prototype: object = realm ? runInContext('Array.prototype', realm) : Array.prototype;
  const originals = WALKS.map((name): [string, unknown] => [name, Reflect.get(prototype, name)]);
  let elements = 0;

  originals.forEach(([name, original]) => {
    if (typeof original !== 'function')
      throw new TypeError('Array.prototype.' + name + ' is missing');

    Reflect.set(prototype, name, function (this: { length: number }, ...args: unknown[]): unknown {
      elements += this.length;

      return Reflect.apply(original, this, args);
    });
  });

  try {
    job();
  } finally {
    originals.forEach(([name, original]) => Reflect.set(prototype, name, original));
  }

  return elements;
}
