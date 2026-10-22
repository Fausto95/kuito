import { defineModule, fn, live } from '../../../src/native/define-module';

// The system clipboard: UIPasteboard on iOS, ClipboardManager on Android.
export default defineModule('Clipboard', {
  /**
   * Whether the clipboard holds text, without reading it, so iOS shows no
   * paste prompt. Followed while watched, in this app and others.
   */
  hasText: live<boolean>(),
  /** The clipboard's text, or `''`. iOS may ask the user to allow the paste. */
  readText: fn.main<() => Promise<string>>(),
  writeText: fn.main<(text: string) => Promise<void>>(),
  ios: { class: 'KuitoClipboardModule' },
  android: { class: 'dev.kuito.runtime.modules.clipboard.KuitoClipboardModule' },
});
