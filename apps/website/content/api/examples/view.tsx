import { defineModule, view } from 'kuito';

type SliderProps = {
  value: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
};

export default defineModule('Slider', {
  view: view<SliderProps>({ events: ['change'] }),
  ios: { class: 'KuitoSliderModule' },
  android: { class: 'dev.kuito.runtime.modules.slider.KuitoSliderModule' },
});
