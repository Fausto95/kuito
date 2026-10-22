import { hasHostLog, log } from './console';
import { host } from './host';

export interface RefreshError extends Error {
  code: string;
  suggestion: string;
}

export function refreshError(code: string, message: string, suggestion: string): RefreshError {
  return Object.assign(
    new Error('[Kuito ' + code + '] ' + message + '\nSuggestion: ' + suggestion),
    {
      name: 'KuitoRefreshError',
      code,
      suggestion,
    },
  );
}

/** The single place runtime errors outside a caller's stack are reported. */
export function reportError(message: string, error: unknown): void {
  if (hasHostLog()) {
    log('error', [message + ':', error]);
  } else if (typeof host.console?.error === 'function') {
    host.console.error('[Kuito] ' + message, error);
  }
}

/** The single place runtime warnings go: the LogBox on a device, the console elsewhere. */
export function reportWarning(message: string): void {
  if (hasHostLog()) log('warn', [message]);
  else if (typeof host.console?.warn === 'function') host.console.warn('[Kuito] ' + message);
}
