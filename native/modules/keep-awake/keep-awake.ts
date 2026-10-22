import { defineModule, fn } from '../../../src/native/define-module';

// The screen kept on while any tag holds it: the idle timer on iOS, the
// window's keep-screen-on flag on Android. A reload gives it back.
export default defineModule('KeepAwake', {
  activate: fn.main<(tag: string) => Promise<void>>(),
  deactivate: fn.main<(tag: string) => Promise<void>>(),
  ios: { class: 'KuitoKeepAwakeModule' },
  android: { class: 'dev.kuito.runtime.modules.keepawake.KuitoKeepAwakeModule' },
});
