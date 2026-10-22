import { defineModule, fn } from '../../../src/native/define-module';

/** iOS: light or dark regardless of the app's appearance. */
export type ActionSheetInterfaceStyle = 'unspecified' | 'light' | 'dark';

/** iPad: where the popover points, in window coordinates. */
export type ActionSheetAnchor = { x: number; y: number };

export type ActionSheetRequest = {
  options: string[];
  title: string | null;
  message: string | null;
  cancelButtonIndex: number | null;
  destructiveButtonIndices: number[];
  disabledButtonIndices: number[];
  /** A hex color. */
  tintColor: string | null;
  anchor: ActionSheetAnchor | null;
  userInterfaceStyle: ActionSheetInterfaceStyle;
};

/** The option picked; null when the sheet was dismissed. */
export type ActionSheetAnswer = { index: number | null };

// UIAlertController's action sheet on iOS (a popover on iPad), a Material
// bottom sheet on Android (docs/action-sheet.md). A reload closes the open ones.
export default defineModule('ActionSheet', {
  show: fn.main.callback<(request: ActionSheetRequest) => Promise<ActionSheetAnswer>>(),
  ios: { class: 'KuitoActionSheetModule' },
  android: { class: 'dev.kuito.runtime.modules.actionsheet.KuitoActionSheetModule' },
});
