import { show, type AlertButton, type AlertOptions } from './dialog';

export type { AlertButton, AlertButtonStyle, AlertOptions } from './dialog';

/**
 * Shows a native alert (docs/alert.md) and resolves with the button the user
 * picked, the same object the options hold, or null when they dismissed it.
 * One OK button by default.
 */
export async function alert(options: AlertOptions): Promise<AlertButton | null> {
  const picked = await show('alert()', options, options.buttons ?? [{ text: 'OK' }], null);

  return picked && picked.button;
}
