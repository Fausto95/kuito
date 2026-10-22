import { defineModule, fn } from '../../../src/native/define-module';

export type ImpactStyle = 'light' | 'medium' | 'heavy';
export type NotificationType = 'success' | 'warning' | 'error';

// Haptic feedback: UIFeedbackGenerator on iOS, View haptics on Android.
export default defineModule('Haptics', {
  isSupported: fn.sync<() => boolean>(),
  selection: fn.main<() => Promise<void>>(),
  impact: fn.main<(style: ImpactStyle) => Promise<void>>(),
  notification: fn.main<(type: NotificationType) => Promise<void>>(),
  ios: { class: 'KuitoHapticsModule', frameworks: ['CoreHaptics'] },
  android: { class: 'dev.kuito.runtime.modules.haptics.KuitoHapticsModule' },
});
