// `console` for UI-thread code, which the compiler lets use it: every level
// reaches the host log, formatted as the JS-thread kernel formats it.
import { formatValues } from '../runtime/console';
import { host } from './host';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

const LEVELS = ['log', 'info', 'debug', 'warn', 'error'] as const;

export function installConsole(): void {
  const console: Record<string, (...values: unknown[]) => void> = {};

  LEVELS.forEach((level) => {
    const method = (...values: unknown[]) =>
      host.__kuitoUILog(level, formatValues(values), new Error().stack ?? '');

    console[level] = __KUITO_DEV__ ? (host.__kuitoHostConsole?.(level, method) ?? method) : method;
  });

  Object.defineProperty(globalThis, 'console', {
    value: console,
    configurable: true,
    writable: true,
  });
}
