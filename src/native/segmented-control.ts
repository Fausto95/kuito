import SegmentedControlModule from '../../native/modules/segmented-control/segmented-control';
import type { SelectOption } from './select';

/** Props of `SegmentedControl`: a segment per option, and the chosen value. */
export type SegmentedControlProps = {
  /** A segment each, in order; each value names one option. */
  options: SelectOption[];
  /**
   * The chosen segment's value; none selected while it names no option.
   * Two-way when given a signal: the control writes it as the user picks.
   */
  value?: string;
  disabled?: boolean;
  /** The value of the segment the user picked. */
  onChange?: (value: string) => void;
};

/**
 * A row of exclusive choices, contributed by the SegmentedControl module
 * through the native views API: UISegmentedControl on iOS, Material's
 * segmented button on Android. Give it a height: a module's view is sized by
 * its style.
 */
export const SegmentedControl = SegmentedControlModule.view;
