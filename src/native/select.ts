import SelectModule from '../../native/modules/select/select';

/** An option, as HTML's `<option>`: the value the app keeps, and the label the user reads. */
export type SelectOption = { value: string; label: string };

/** Props of `Select`: the options, the chosen value, and a placeholder. */
export type SelectProps = {
  /** In the order the menu lists them; each value names one option. */
  options: SelectOption[];
  /**
   * The chosen option's value; none while it names no option. Two-way when
   * given a signal: the select writes it as the user picks.
   */
  value?: string;
  /** What it shows while no option is chosen. */
  placeholder?: string;
  disabled?: boolean;
  /** The value of the option the user picked. */
  onChange?: (value: string) => void;
};

/**
 * A native select, contributed by the Select module through the native views
 * API: a button that lists the options in its menu on iOS, a Material
 * button that opens a popup menu on Android. Give it a height: a module's
 * view is sized by its style.
 */
export const Select = SelectModule.view;
