import { defineModule, fn, live } from '../../../src/native/define-module';

// Opening URLs in other apps, and the links that open this one
// (docs/linking.md), from the links the shell reports to KuitoLinks, its
// own state.
export default defineModule('Linking', {
  /** Opens `url` in the app that handles it; rejects with `ERR_URL` when none does. */
  openURL: fn.main.callback<(url: string) => Promise<void>>(),
  canOpenURL: fn.main<(url: string) => Promise<boolean>>(),
  /**
   * The URL that last opened the app, starting with the one it launched
   * with; null when no link opened it. Watched, it follows each link.
   */
  url: live<string | null>(),
  ios: { class: 'KuitoLinkingModule' },
  android: { class: 'dev.kuito.runtime.modules.linking.KuitoLinkingModule' },
});
