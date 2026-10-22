import SliderModule from '../../native/modules/slider/slider';
import type { NativeViewEvent } from './views';

export type SliderEvent = NativeViewEvent<'changeEnd', { value: number }>;

/** Props of `Slider`: its value and range, colors, and the events of a drag. */
export type SliderProps = {
  /** Two-way when given a signal: the slider writes it as the user drags. */
  value?: number;
  /** 0 by default. */
  min?: number;
  /** 1 by default. */
  max?: number;
  /** The value snaps to multiples of `step` from `min`; 0 slides freely. */
  step?: number;
  disabled?: boolean;
  /** The track before the thumb. */
  fillColor?: string;
  /** The track after the thumb. */
  trackColor?: string;
  /** The value, while the user drags. */
  onChange?: (value: number) => void;
  /** When the user lets go. */
  onChangeEnd?: (event: SliderEvent) => void;
};

/**
 * A native slider (UISlider on iOS, SeekBar on Android), contributed by the
 * Slider module through the native views API. Give it a height: a module's
 * view is sized by its style.
 */
export const Slider = SliderModule.view;
