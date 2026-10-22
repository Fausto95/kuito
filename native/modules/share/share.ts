import { defineModule, fn } from '../../../src/native/define-module';

export type ShareRequest = {
  message?: string;
  /** iOS shares it as a URL; Android appends it to the message. */
  url?: string;
  /** Android: the subject, as an email's. */
  title?: string;
  /** Android: the chooser's title. */
  dialogTitle?: string;
  /** iOS: the subject, as an email's. */
  subject?: string;
  /** iOS: activity types to leave out, as `com.apple.UIKit.activity.AirDrop`. */
  excludedActivityTypes?: string[];
};

export type ShareAction = 'shared' | 'dismissed';

export type ShareResult = {
  action: ShareAction;
  /** The activity or app the user shared with: an activity type on iOS, a component on Android. */
  activityType?: string;
};

// The system share sheet: UIActivityViewController on iOS, the Android
// Sharesheet on Android (docs/share.md). Settles when the sheet closes.
export default defineModule('Share', {
  share: fn.main.callback<(request: ShareRequest) => Promise<ShareResult>>(),
  ios: { class: 'KuitoShareModule' },
  android: { class: 'dev.kuito.runtime.modules.share.KuitoShareModule' },
});
