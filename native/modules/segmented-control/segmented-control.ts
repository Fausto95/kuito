import { defineModule, view } from '../../../src/native/define-module';
import type { SegmentedControlProps } from '../../../src/native/segmented-control';

// A row of exclusive choices: UISegmentedControl on iOS, Material's
// segmented button on Android.
export default defineModule('SegmentedControl', {
  view: view<SegmentedControlProps>({ events: ['change'] }),
  ios: { class: 'KuitoSegmentedControlModule' },
  android: { class: 'dev.kuito.runtime.modules.segmentedcontrol.KuitoSegmentedControlModule' },
});
