import { defineModule, fn } from '../../../src/native/define-module';

/** The status bar's content: `default` is the style the app launched with. */
export type StatusBarStyle = 'default' | 'light-content' | 'dark-content';

/** iOS: how the status bar shows and hides. */
export type StatusBarTransition = 'none' | 'fade' | 'slide';

/** `default` is the shell's own, for a SystemBars that gives the prop back. */
export type NavigationBarButtonStyle = 'light' | 'dark' | 'default';

// The status bar, navigation bar and root view, for SystemBars
// (docs/system-ui.md). A function for chrome a platform doesn't have
// resolves without effect there. The shell reads the bars' state, so every
// shell includes the module.
export default defineModule('SystemUI', {
  setStatusBarStyle: fn.main<(style: StatusBarStyle, animated: boolean) => Promise<void>>(),
  setStatusBarHidden:
    fn.main<(hidden: boolean, transition: StatusBarTransition) => Promise<void>>(),
  setStatusBarBackgroundColor: fn.main<(color: string, animated: boolean) => Promise<void>>(),
  setStatusBarTranslucent: fn.main<(translucent: boolean) => Promise<void>>(),
  /** Android's status bar height in dp, read from resources; null on iOS. */
  statusBarHeight: fn.sync<() => number | null>(),
  /** Whether kuito.config.ts launched the app with the status bar hidden. */
  statusBarHiddenAtLaunch: fn.sync<() => boolean>(),
  /** Null gives the root view the shell's own color back. */
  setBackgroundColor: fn.main<(color: string | null) => Promise<void>>(),
  setNavigationBarColor: fn.main<(color: string) => Promise<void>>(),
  setNavigationBarButtonStyle: fn.main<(style: NavigationBarButtonStyle) => Promise<void>>(),
  setNavigationBarHidden: fn.main<(hidden: boolean) => Promise<void>>(),
  /** iOS: edge swipes reach the app before the system's gestures. Hiding the bars is SystemBars'. */
  setScreenEdgesDeferred: fn.main<(deferred: boolean) => Promise<void>>(),
  setHomeIndicatorAutoHidden: fn.main<(hidden: boolean) => Promise<void>>(),
  ios: { class: 'KuitoSystemUIModule' },
  android: { class: 'dev.kuito.runtime.modules.systemui.KuitoSystemUIModule' },
});
