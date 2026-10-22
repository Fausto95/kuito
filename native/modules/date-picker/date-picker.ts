import { defineModule, view } from '../../../src/native/define-module';
import type { DatePickerProps } from '../../../src/native/date-picker';

// A native date and time picker: UIDatePicker on iOS, a button that opens
// the platform's date and time dialogs on Android.
export default defineModule('DatePicker', {
  view: view<DatePickerProps>({ events: ['change'] }),
  ios: { class: 'KuitoDatePickerModule' },
  android: { class: 'dev.kuito.runtime.modules.datepicker.KuitoDatePickerModule' },
});
