import ActionSheet, {
  type ActionSheetRequest as Request,
} from '../../native/modules/action-sheet/action-sheet';
import type { AlertButtonStyle } from './dialog';
import { hexColor } from './system-ui';

export type ActionSheetButton = {
  text: string;
  /**
   * `cancel` is shown apart, at the bottom, and is what dismissing the sheet
   * picks; at most one button is `cancel`. `destructive` is drawn in red.
   */
  style?: AlertButtonStyle;
  /** Shown dimmed; it can't be picked. */
  disabled?: boolean;
};

export type ActionSheetOptions = {
  buttons: readonly ActionSheetButton[];
  title?: string;
  message?: string;
  /** iOS: the buttons' color; a hex color. */
  tintColor?: string;
  /**
   * iPad: where the popover points, in window coordinates, as a press event's
   * `pageX` and `pageY`. The middle of the window without one.
   */
  anchor?: { x: number; y: number };
  /** iOS: light or dark regardless of the app's appearance, as CSS's `color-scheme`. */
  colorScheme?: 'light' | 'dark';
};

/** The positions of the buttons that pass `test`. */
const indices = (
  buttons: readonly ActionSheetButton[],
  test: (button: ActionSheetButton) => boolean,
): number[] => buttons.flatMap((button, index) => (test(button) ? [index] : []));

function request(sheet: ActionSheetOptions): Request {
  const { buttons } = sheet;

  if (buttons.length === 0) throw new TypeError('actionSheet() needs at least one button');

  const cancel = indices(buttons, (button) => button.style === 'cancel');

  if (cancel.length > 1)
    throw new TypeError('actionSheet() takes at most one button with style "cancel"');

  return {
    options: buttons.map((button) => button.text),
    title: sheet.title ?? null,
    message: sheet.message ?? null,
    cancelButtonIndex: cancel[0] ?? null,
    destructiveButtonIndices: indices(buttons, (button) => button.style === 'destructive'),
    disabledButtonIndices: indices(buttons, (button) => button.disabled === true),
    tintColor:
      sheet.tintColor === undefined
        ? null
        : hexColor(sheet.tintColor, 'actionSheet() tintColor must be'),
    anchor: sheet.anchor ? { x: sheet.anchor.x, y: sheet.anchor.y } : null,
    userInterfaceStyle: sheet.colorScheme ?? 'unspecified',
  };
}

/**
 * Shows a list of actions from the bottom of the screen: UIAlertController's
 * action sheet on iOS (a popover on iPad), a Material bottom sheet on Android
 * (docs/action-sheet.md). Resolves with the button picked, the same object
 * the options hold; dismissing the sheet resolves the cancel button, or null
 * without one.
 */
export async function actionSheet(sheet: ActionSheetOptions): Promise<ActionSheetButton | null> {
  const wire = request(sheet);
  const { index } = await ActionSheet.show(wire);
  const picked = index ?? wire.cancelButtonIndex;

  if (picked === null) return null;

  const button = sheet.buttons[picked];

  if (!button)
    throw new Error('actionSheet(): the platform picked button ' + picked + ', which is not one');

  return button;
}
