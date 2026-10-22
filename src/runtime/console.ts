// `console` for Hermes. Every level reaches the host log with a stack, so the
// LogBox can show the entry and the dev server can name its source line.
import { host } from './host';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

export type LogLevel = 'log' | 'info' | 'debug' | 'warn' | 'error';

declare global {
  var __kuitoHostLog: ((level: LogLevel, message: string, stack: string) => void) | undefined;
  /**
   * An attached inspector (docs/devtools.md) wraps each console method in a
   * host function, which records the values themselves for DevTools: being
   * native, its caller is the top of the stack DevTools links the entry to.
   */
  var __kuitoHostConsole:
    | ((level: LogLevel, method: (...values: unknown[]) => void) => (...values: unknown[]) => void)
    | undefined;
  var HermesInternal:
    | {
        enablePromiseRejectionTracker?: (options: {
          allRejections: boolean;
          onUnhandled: (id: number, rejection: unknown) => void;
        }) => void;
      }
    | undefined;
}

/** Nesting shown before an object prints as `[Object]`. */
const DEPTH = 3;

interface ErrorLike {
  name?: unknown;
  message: string;
  stack?: unknown;
}

/** Errors from any realm: the kernel and app code may not share `Error`. */
function isError(value: unknown): value is ErrorLike {
  return (
    value instanceof Error ||
    (typeof value === 'object' &&
      value !== null &&
      'message' in value &&
      typeof value.message === 'string' &&
      'stack' in value &&
      typeof value.stack === 'string')
  );
}

function describeError(error: ErrorLike): string {
  const name = typeof error.name === 'string' && error.name ? error.name : 'Error';

  return error.message ? name + ': ' + error.message : name;
}

function inspect(value: unknown, depth: number, ancestors: object[]): string {
  if (typeof value === 'string') return depth === 0 ? value : "'" + value + "'";

  if (typeof value === 'function')
    return value.name ? '[Function ' + value.name + ']' : '[Function]';

  if (typeof value === 'symbol') return value.toString();

  if (typeof value !== 'object' || value === null) return String(value);

  if (isError(value)) return describeError(value);

  if (ancestors.includes(value)) return '[Circular]';

  if (depth >= DEPTH) return Array.isArray(value) ? '[Array]' : '[Object]';

  const inner = [...ancestors, value];

  if (Array.isArray(value))
    return '[' + value.map((item) => inspect(item, depth + 1, inner)).join(', ') + ']';

  const fields = Object.keys(value).map(
    (key) => key + ': ' + inspect((value as Record<string, unknown>)[key], depth + 1, inner),
  );

  return fields.length ? '{ ' + fields.join(', ') + ' }' : '{}';
}

/** Console arguments as one line, the way Node and browsers print them. */
export function formatValues(values: unknown[]): string {
  return values.map((value) => inspect(value, 0, [])).join(' ');
}

/** An error among the values brings its own stack; otherwise the call site's. */
function stackFor(values: unknown[]): string {
  const error = values.find(isError);

  if (error && typeof error.stack === 'string') return error.stack;

  return new Error().stack ?? '';
}

/** Whether entries reach a host log, rather than a console the host provides. */
export function hasHostLog(): boolean {
  return typeof host.__kuitoHostLog === 'function';
}

export function log(level: LogLevel, values: unknown[]): void {
  host.__kuitoHostLog?.(level, formatValues(values), stackFor(values));
}

/** The console method for `level`, wrapped by an attached inspector. */
function inspected(level: LogLevel): (...values: unknown[]) => void {
  const method = (...values: unknown[]) => log(level, values);

  return __KUITO_DEV__ ? (host.__kuitoHostConsole?.(level, method) ?? method) : method;
}

export function installConsole(): void {
  if (!hasHostLog()) return;

  host.console = {
    log: inspected('log'),
    info: inspected('info'),
    debug: inspected('debug'),
    warn: inspected('warn'),
    error: inspected('error'),
  };

  host.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, rejection) => log('error', ['Uncaught (in promise)', rejection]),
  });
}
