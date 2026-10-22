import { defineModule, fn } from '../../../src/native/define-module';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

/** iOS: light or dark regardless of the app's appearance. */
export type AlertInterfaceStyle = 'unspecified' | 'light' | 'dark';

/** One text field, a password, or a login's username and password. */
export type AlertPromptType = 'text' | 'password' | 'login';

/** A prompt's keyboard, by HTML's `inputmode` values. */
export type AlertInputMode = 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';

export type AlertAction = { text: string; style: AlertButtonStyle; preferred: boolean };

export type AlertPrompt = {
  type: AlertPromptType;
  value: string;
  inputMode: AlertInputMode;
};

export type AlertRequest = {
  title: string;
  message: string | null;
  buttons: AlertAction[];
  /** Android: tapping outside or Back dismisses the alert. */
  cancelable: boolean;
  userInterfaceStyle: AlertInterfaceStyle;
  prompt: AlertPrompt | null;
};

/** The button picked, null when dismissed, and the fields' text for a prompt. */
export type AlertAnswer = { index: number | null; text?: string; password?: string };

// UIAlertController on iOS, a Material dialog on Android (docs/alert.md),
// with text fields for a prompt. A reload closes the ones still open.
export default defineModule('Alert', {
  alert: fn.main.callback<(request: AlertRequest) => Promise<AlertAnswer>>(),
  ios: { class: 'KuitoAlertModule' },
  android: { class: 'dev.kuito.runtime.modules.alert.KuitoAlertModule' },
});
