// performance.now over the host's monotonic clock (native/shared/Standard.cpp):
// milliseconds since the runtime started, unaffected by wall-clock changes.
import { host } from './host';

export function installPerformance(): void {
  const now = host.__kuitoHostNow;

  if (typeof now !== 'function') return;

  const timeOrigin = Date.now() - now();

  host.performance = { now: () => now(), timeOrigin };
}
