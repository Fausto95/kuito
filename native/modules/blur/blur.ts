import { defineModule, view } from '../../../src/native/define-module';
import type { BlurProps } from '../../../src/native/blur';

// What is behind the view, blurred, under its children: a visual effect
// view on iOS, a blurred backdrop drawn by the view on Android.
export default defineModule('Blur', {
  view: view<BlurProps>({ children: true }),
  ios: { class: 'KuitoBlurModule' },
  android: { class: 'dev.kuito.runtime.modules.blur.KuitoBlurModule' },
});
