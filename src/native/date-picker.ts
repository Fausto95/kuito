import DatePickerModule from '../../native/modules/date-picker/date-picker';

/** What the picker picks, as HTML's date and time inputs' `type`: `datetime` is `datetime-local`. */
export type DatePickerType = 'date' | 'time' | 'datetime';

/** Props of `DatePicker`: the moment picked, what it picks, and its bounds. */
export type DatePickerProps = {
  /**
   * The moment shown, in milliseconds since 1970 (`date.getTime()`); now
   * when unset. Two-way when given a signal: the picker writes it as the
   * user picks.
   */
  value?: number;
  /** `date` by default. A pick keeps the part of the moment its type doesn't show. */
  type?: DatePickerType;
  /** The earliest moment the user can pick, in milliseconds. */
  min?: number;
  /** The latest moment the user can pick, in milliseconds. */
  max?: number;
  disabled?: boolean;
  /** The moment the user picked, in milliseconds. */
  onChange?: (value: number) => void;
};

/**
 * A native date and time picker, contributed by the DatePicker module
 * through the native views API: UIDatePicker's compact style on iOS, a
 * button that opens the platform's date and time dialogs on Android. Give
 * it a height: a module's view is sized by its style.
 */
export const DatePicker = DatePickerModule.view;
