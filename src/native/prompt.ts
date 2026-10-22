import type { InputMode } from '../ui/primitives';
import { show, type AlertButton, type AlertOptions } from './dialog';

/** What the user typed: the text, or a login's username and password. */
export type PromptValue = string | { username: string; password: string };

/** One text field, a password, or a login's username and password, as TextField's `type` names them. */
export type PromptType = 'text' | 'password' | 'login';

export type PromptOptions = AlertOptions & {
  type?: PromptType;
  /** The field's starting text, as TextField's `value`; a login's username. */
  value?: string;
  /** The keyboard, as TextField's `inputMode`; a password's too, for a PIN. */
  inputMode?: Exclude<InputMode, 'none'>;
};

/**
 * Shows an alert with a text field (docs/alert.md) and resolves with the
 * button the user picked and what they typed, or null when they dismissed
 * it. Cancel and OK by default.
 */
export async function prompt(
  options: PromptOptions,
): Promise<{ button: AlertButton; value: PromptValue } | null> {
  const type = options.type ?? 'text';
  const picked = await show(
    'prompt()',
    options,
    options.buttons ?? [{ text: 'Cancel', style: 'cancel' }, { text: 'OK' }],
    { type, value: options.value ?? '', inputMode: options.inputMode ?? 'text' },
  );

  if (!picked) return null;

  const text = picked.answer.text ?? '';

  return {
    button: picked.button,
    value: type === 'login' ? { username: text, password: picked.answer.password ?? '' } : text,
  };
}
