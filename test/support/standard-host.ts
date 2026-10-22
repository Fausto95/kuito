// The platform half of the standard library (native/shared/Standard.cpp) for
// kernel tests: UTF-8, random bytes and a monotonic clock, from Node.
import { randomFillSync } from 'node:crypto';
import { textHost } from './fake-http.ts';

export function standardHost(clock = { now: 0 }) {
  return {
    ...textHost,
    __kuitoHostFillRandom(buffer: ArrayBuffer, offset: number, length: number) {
      randomFillSync(new Uint8Array(buffer, offset, length));
    },
    __kuitoHostNow: () => clock.now,
  };
}
