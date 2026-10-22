import { defineModule, view } from '../../../src/native/define-module';
import type { SelectProps } from '../../../src/native/select';

// A native select: a button with a menu on iOS, a Material button
// with a popup menu on Android.
export default defineModule('Select', {
  view: view<SelectProps>({ events: ['change'] }),
  ios: { class: 'KuitoSelectModule' },
  android: { class: 'dev.kuito.runtime.modules.select.KuitoSelectModule' },
});
