import { defineModule, fn, view } from '../../../src/native/define-module';
import type { WebViewMethods, WebViewProps } from '../../../src/native/webview';

// A web page in the app: WKWebView on iOS, WebView on Android.
export default defineModule('WebView', {
  view: view<WebViewProps, WebViewMethods>({
    events: ['loadStart', 'load', 'loadEnd', 'error', 'navigate', 'message'],
    methods: {
      goBack: fn.main<() => Promise<void>>(),
      goForward: fn.main<() => Promise<void>>(),
      reload: fn.main<() => Promise<void>>(),
      stop: fn.main<() => Promise<void>>(),
      injectJavaScript: fn.main<(script: string) => Promise<void>>(),
      postMessage: fn.main<(data: string) => Promise<void>>(),
    },
  }),
  ios: { class: 'KuitoWebViewModule' },
  android: { class: 'dev.kuito.runtime.modules.webview.KuitoWebViewModule' },
});
