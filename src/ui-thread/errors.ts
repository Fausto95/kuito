import { host } from './host';
import { describeValue } from '../runtime/values';

/** UI-thread failures reach the LogBox through the host log, naming what failed. */
export function report(where: string, error: unknown): void {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : describeValue(error);
  const stack =
    typeof error === 'object' && error !== null && 'stack' in error ? String(error.stack) : '';

  host.__kuitoUILog('error', where + ': ' + message, stack);
}
