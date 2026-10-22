// structuredClone: the HTML structured clone algorithm for the types Hermes
// has. Cycles and shared references survive; prototypes don't, except the
// built-ins'. No `transfer`: buffers are always copied. Types are told apart
// by their tag, not instanceof, so values from another realm clone too.

type TypedArray = ArrayBufferView & { readonly length: number };
type Clone = (value: unknown) => unknown;
/** Makes the copy, records it (cycles reach it), then fills it. */
type Cloner = (value: never, keep: <T>(copy: T) => T, clone: Clone) => unknown;

const TYPED_ARRAYS: Record<
  string,
  new (buffer: ArrayBuffer, offset: number, length: number) => ArrayBufferView
> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
};

const ERRORS: Record<string, ErrorConstructor> = {
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
};

const boxed: Cloner = (value: { valueOf(): unknown }, keep) => keep(Object(value.valueOf()));

const CLONERS: Record<string, Cloner> = {
  Boolean: boxed,
  Number: boxed,
  String: boxed,
  BigInt: boxed,
  Date: (value: Date, keep) => keep(new Date(value.getTime())),
  RegExp: (value: RegExp, keep) => keep(new RegExp(value.source, value.flags)),
  ArrayBuffer: (value: ArrayBuffer, keep) => keep(value.slice(0)),
  DataView: (value: DataView, keep, clone) =>
    keep(new DataView(clone(value.buffer) as ArrayBuffer, value.byteOffset, value.byteLength)),
  Map: (value: Map<unknown, unknown>, keep, clone) => {
    const copy = keep(new Map<unknown, unknown>());

    value.forEach((entry, key) => copy.set(clone(key), clone(entry)));

    return copy;
  },
  Set: (value: Set<unknown>, keep, clone) => {
    const copy = keep(new Set<unknown>());

    value.forEach((entry) => copy.add(clone(entry)));

    return copy;
  },
  Error: (value: Error, keep) => {
    const copy = keep(new (ERRORS[value.name] ?? Error)(value.message));

    if (typeof value.stack === 'string') copy.stack = value.stack;

    return copy;
  },
  Array: (value: unknown[], keep, clone) =>
    fill(value, keep(Array.from<unknown>({ length: value.length })), clone),
  Object: (value: object, keep, clone) => fill(value, keep({}), clone),
};

Object.keys(TYPED_ARRAYS).forEach((name) => {
  const Type = TYPED_ARRAYS[name];

  CLONERS[name] = (value: TypedArray, keep, clone) =>
    keep(new Type(clone(value.buffer) as ArrayBuffer, value.byteOffset, value.length));
});

/** Own enumerable string keys, as the algorithm copies a plain object or array. */
function fill(source: object, copy: object, clone: Clone): unknown {
  Object.keys(source).forEach((key) => {
    Reflect.set(copy, key, clone(Reflect.get(source, key)));
  });

  return copy;
}

function dataCloneError(what: string): Error {
  const error = new Error(`${what} could not be cloned`);

  error.name = 'DataCloneError';

  return error;
}

export function structuredClone<T>(value: T): T {
  const seen = new Map<object, unknown>();
  const clone: Clone = (input) => {
    if (typeof input === 'function')
      throw dataCloneError(`The function ${input.name || '(anonymous)'}`);

    if (typeof input === 'symbol') throw dataCloneError(String(input));

    if (typeof input !== 'object' || input === null) return input;

    if (seen.has(input)) return seen.get(input);

    const tag = Object.prototype.toString.call(input).slice(8, -1);
    const cloner = CLONERS[tag];

    if (!cloner) throw dataCloneError(`A ${tag}`);

    return cloner(input as never, (copy) => (seen.set(input, copy), copy), clone);
  };

  return clone(value) as never;
}
