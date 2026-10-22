import { defineModule, view } from '../../../src/native/define-module';
import type { SliderProps } from '../../../src/native/slider';

// A native slider: UISlider on iOS, SeekBar on Android.
export default defineModule('Slider', {
  view: view<SliderProps>({ events: ['change', 'changeEnd'] }),
  ios: { class: 'KuitoSliderModule' },
  android: { class: 'dev.kuito.runtime.modules.slider.KuitoSliderModule' },
});
