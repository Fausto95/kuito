import type { ElementRef } from '../ui/refs';
import { field, signal, stateRef, type ReadonlySignal } from './scope';
import WebViewModule from '../../native/modules/webview/webview';
import type { NativeViewEvent, NativeViewHandle } from './views';

/** The URL a WebView loads (`src`), with its request headers if it needs any. */
export type WebViewSource = string | { uri: string; headers?: Record<string, string> };

/** The page's state, on every load and navigation event. */
export type WebViewNavigation = {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type WebViewNavigationEvent = NativeViewEvent<
  'loadStart' | 'load' | 'loadEnd' | 'navigate',
  WebViewNavigation
>;

/** `code` and `description` are the platform's: an NSURLError code on iOS, a WebViewClient one on Android. */
export type WebViewErrorEvent = NativeViewEvent<
  'error',
  WebViewNavigation & { code: number; description: string }
>;

/** `data` is the string the page passed to `window.KuitoWebView.postMessage`; `url` is the page's. */
export type WebViewMessageEvent = NativeViewEvent<'message', { data: string; url: string }>;

/** Props of `WebView`: the page to load, where it may navigate, and its events. */
export type WebViewProps = {
  /** The page to load. Set `src` or `html`, not both. */
  src?: WebViewSource;
  /** Inline HTML, resolved against `baseUrl` when given. */
  html?: string | { html: string; baseUrl?: string };
  /**
   * Origins the WebView navigates to, as wildcard patterns (`https://*`).
   * The main frame's navigations elsewhere open through Linking instead.
   * `["http://*", "https://*"]` by default.
   */
  allowedOrigins?: string[];
  /** Runs in the main frame each time a document finishes loading. */
  injectedJavaScript?: string;
  /** True by default. */
  javaScriptEnabled?: boolean;
  /** iOS only: swipe from an edge to go back or forward. False by default. */
  swipeNavigation?: boolean;
  /** Replaces the platform's user agent. */
  userAgent?: string;
  onLoadStart?: (event: WebViewNavigationEvent) => void;
  /** The page loaded. */
  onLoad?: (event: WebViewNavigationEvent) => void;
  /** The load ended, loaded or failed. */
  onLoadEnd?: (event: WebViewNavigationEvent) => void;
  onError?: (event: WebViewErrorEvent) => void;
  /** The URL, title, loading state or history changed. */
  onNavigate?: (event: WebViewNavigationEvent) => void;
  onMessage?: (event: WebViewMessageEvent) => void;
};

/** Each resolves once the platform has started it, not when the page has done it. */
export type WebViewMethods = {
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  stop(): Promise<void>;
  /** Runs `script` in the main frame; its result and errors stay in the page. */
  injectJavaScript(script: string): Promise<void>;
  /** Dispatches a `message` event on the page's `window`, with `data` as `event.data`. */
  postMessage(data: string): Promise<void>;
};

/** What a WebView's ref holds. */
export type WebViewHandle = NativeViewHandle<WebViewMethods>;

/**
 * A WebView's ref that also holds the page's state as signals, kept by its
 * load and navigation events. Called while a component sets up, which owns
 * it, like `ref()`.
 */
export type WebViewRef = ElementRef<WebViewHandle> & {
  readonly url: ReadonlySignal<string>;
  readonly title: ReadonlySignal<string>;
  readonly loading: ReadonlySignal<boolean>;
  readonly canGoBack: ReadonlySignal<boolean>;
  readonly canGoForward: ReadonlySignal<boolean>;
};

export function webViewRef(): WebViewRef {
  return stateRef<WebViewHandle, Omit<WebViewRef, 'current'>>('webview.ref', () => {
    const url = signal('');
    const title = signal('');
    const loading = signal(false);
    const canGoBack = signal(false);
    const canGoForward = signal(false);
    const navigated = (event: object) => {
      const text = (key: string, current: string) => {
        const value = field(event, key);

        return typeof value === 'string' ? value : current;
      };

      url.value = text('url', url.value);
      title.value = text('title', title.value);
      loading.value = field(event, 'loading') === true;
      canGoBack.value = field(event, 'canGoBack') === true;
      canGoForward.value = field(event, 'canGoForward') === true;
    };

    return {
      state: { url, title, loading, canGoBack, canGoForward },
      listeners: {
        loadStart: navigated,
        load: navigated,
        loadEnd: navigated,
        navigationStateChange: navigated,
        error: navigated,
      },
      release() {},
    };
  });
}

/**
 * A web page: WKWebView on iOS, the system WebView on Android, contributed
 * by the WebView module. Give it a size: a module's view is sized by its
 * style. See docs/webview.md.
 */
export const WebView = WebViewModule.view;
