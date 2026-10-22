// What alert() and prompt() share: one native call, its request and its answer.
import Alert, {
  type AlertAnswer,
  type AlertButtonStyle as SpecButtonStyle,
  type AlertPrompt,
} from '../../native/modules/alert/alert';

export type AlertButtonStyle = SpecButtonStyle;

export type AlertButton = {
  text?: string;
  /** At most one button is `cancel`. */
  style?: AlertButtonStyle;
  /** iOS: the button Return picks, shown in bold. */
  preferred?: boolean;
};

export type AlertOptions = {
  title: string;
  message?: string;
  buttons?: readonly AlertButton[];
  /** Android: tapping outside or Back dismisses the alert. False by default. */
  cancelable?: boolean;
  /** iOS: light or dark regardless of the app's appearance, as CSS's `color-scheme`. */
  colorScheme?: 'light' | 'dark';
};

/** Shows the dialog; resolves the button picked and the answer, or null when dismissed. */
export async function show(
  what: string,
  options: AlertOptions,
  buttons: readonly AlertButton[],
  prompt: AlertPrompt | null,
): Promise<{ button: AlertButton; answer: AlertAnswer } | null> {
  if (buttons.filter((button) => button.style === 'cancel').length > 1)
    throw new TypeError(what + ' takes at most one button with style "cancel"');

  const answer = await Alert.alert({
    title: options.title,
    message: options.message ?? null,
    buttons: buttons.map((button) => ({
      text: button.text ?? '',
      style: button.style ?? 'default',
      preferred: button.preferred === true,
    })),
    cancelable: options.cancelable === true,
    userInterfaceStyle: options.colorScheme ?? 'unspecified',
    prompt,
  });
  const button = answer.index === null ? undefined : buttons[answer.index];

  if (answer.index !== null && !button)
    throw new Error(what + ': the platform picked button ' + answer.index + ', which is not one');

  return button ? { button, answer } : null;
}
