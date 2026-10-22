import { makeDerived } from '../runtime/derived';
import { decodeValue, encodeValue } from '../runtime/thread-wire';
import { isPlainData } from '../runtime/values';
import { appFunction } from './budget';
import { host } from './host';
import { functions, madeFrom, making, motionRefs, motions } from './state';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

export function decode(value: unknown): unknown {
  return decodeValue(value, decodeSpecial);
}

function decodeSpecial(tag: string, value: Record<string, unknown>): unknown {
  switch (tag) {
    case '$m': {
      const id = String(value.$m);

      if (!motions[id]) throw new Error('Unknown motion value ' + id);

      return motions[id].ref;
    }
    case '$t': {
      const id = String(value.$t);
      const factory = functions[id];
      const frame = { id, fn: null as ((...args: unknown[]) => unknown) | null };

      if (!factory) throw new Error('Unknown UI-thread function ' + id + '; reload the app');

      making.push(frame);

      try {
        const captures = decode(value.c);

        if (!Array.isArray(captures)) throw new TypeError('Malformed captures for ' + id);

        frame.fn = factory(captures);

        if (__KUITO_DEV__) madeFrom.set(frame.fn, id);

        return frame.fn;
      } finally {
        making.splice(making.indexOf(frame), 1);
      }
    }
    case '$r': {
      const id = String(value.$r);
      let frame: (typeof making)[number] | undefined;

      for (let index = making.length - 1; index >= 0 && !frame; index--)
        if (making[index].id === id) frame = making[index];

      if (!frame) throw new TypeError('A function names ' + id + ', which is not being made');

      return (...args: unknown[]) => {
        if (!frame.fn) throw new Error(id + ' was called before it was made');

        return frame.fn(...args);
      };
    }
    case '$j':
      return jsFunction(Number(value.$j));
    case '$l':
      return linkedFunction(Number(value.$l));
    case '$s':
      return signal(Number(value.$s), decode(value.v));
    case '$d': {
      const spec = value.$d;

      if (
        !isPlainData(spec) ||
        !['compute', 'map', 'clamp', 'interpolate'].includes(String(spec.op))
      )
        throw new TypeError('Malformed derived value');

      if (spec.op === 'compute')
        return makeDerived({ op: 'compute', fn: appFunction(decode(spec.fn), 'compute') } as never);

      if (spec.op === 'map')
        return makeDerived({
          ...spec,
          from: decode(spec.from),
          fn: appFunction(decode(spec.fn), 'map'),
        } as never);

      return makeDerived({ ...spec, from: decode(spec.from) } as never);
    }
    default:
      throw new TypeError('Unknown thread value ' + tag);
  }
}

export function encodeForJs(value: unknown): unknown {
  return encodeValue(value, (item) => {
    if (typeof item === 'object' && item !== null) {
      const record = motionRefs.get(item);

      if (record) return { $m: record.id };
    }

    if (typeof item === 'function')
      throw new TypeError('A UI-thread function cannot be passed to the JS thread');

    return undefined;
  });
}

export function sendToJs(message: Record<string, unknown>): void {
  host.__kuitoUISendEvent(message);
}

/** Calls a JS-thread function asynchronously; the UI thread never waits for it. */
function jsFunction(id: number): (...args: unknown[]) => void {
  return function (...args: unknown[]) {
    sendToJs({ f: id, args: encodeForJs(args) });
  };
}

/**
 * A module's main-thread function, called on this thread: the platform runs
 * it at once (native/shared/UIRuntime.cpp), and it answers as a Promise, as
 * on the JS thread.
 */
function linkedFunction(id: number): (...args: unknown[]) => Promise<unknown> {
  return function (...args: unknown[]) {
    try {
      return Promise.resolve(host.__kuitoUIHostCall(id, ...args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
}

/** A JS-thread signal: reads see its value when the code was sent, writes go back. */
function signal(id: number, initial: unknown) {
  let current = initial;

  return {
    get value() {
      return current;
    },
    set value(next) {
      current = next;
      sendToJs({ s: id, value: encodeForJs(next) });
    },
  };
}
