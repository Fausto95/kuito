# WebView

`WebView` shows a web page: `WKWebView` on iOS and the system
`android.webkit.WebView` on Android, with no added dependency. It follows
react-native-webview's core API. It is a [native view](native-modules.md#views), so
it takes style and layout props and needs a size.

```tsx
import { Button, HStack, VStack, WebView, webViewRef } from 'kuito';

export function Browser() {
  const page = webViewRef(); // while the component sets up, like ref()

  return (
    <VStack flex={1}>
      <WebView
        ref={page}
        flex={1}
        src="https://example.com"
        onMessage={(event) => console.log('page says', event.data)}
      />
      <HStack>
        <Button onPress={() => void page.current?.goBack()}>
          {page.canGoBack.value ? 'Back' : 'No back'}
        </Button>
        <Button onPress={() => void page.current?.reload()}>Reload</Button>
      </HStack>
    </VStack>
  );
}
```

`webViewRef()` makes a ref that also holds the page's state as signals, kept
by its load and navigation events: `url`, `title`, `loading`, `canGoBack` and
`canGoForward`. A plain `ref<WebViewHandle>()` works for the methods alone.

## Props

| Prop                 | Default                     | What it does                                                                                 |
| -------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `src`                | blank page                  | A URL, or `{ uri, headers? }` to send request headers.                                       |
| `html`               | none                        | Inline HTML, or `{ html, baseUrl? }` to resolve it against a base URL. Set `src` or `html`.  |
| `allowedOrigins`     | `["http://*", "https://*"]` | Where the page may navigate, as wildcard patterns. See [Navigation](#navigation).            |
| `injectedJavaScript` | none                        | Runs in the main frame each time a document loads.                                           |
| `javaScriptEnabled`  | `true`                      | The page's own scripts. Off, iOS still runs the app's (bridge, injected); Android runs none. |
| `swipeNavigation`    | `false`                     | iOS: swipe from an edge to go back or forward. Android has no such gesture and ignores it.   |
| `userAgent`          | the platform's              | Replaces the user agent.                                                                     |

A new `src` or `html` loads only when it differs from the current one, so a
reactive one that recomputes the same value doesn't reload the page.

`injectedJavaScript` runs when the document is parsed on iOS (a document-end
user script) and when the page finishes loading on Android
(`onPageFinished`).

## Events

The handler receives the event with its fields on it: `event.url`, not
react-native-webview's `event.nativeEvent.url`.

| Event         | When                                               | Fields                                                 |
| ------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `onLoadStart` | A main-frame load starts.                          | `url`, `title`, `loading`, `canGoBack`, `canGoForward` |
| `onLoad`      | It loaded.                                         | the same                                               |
| `onLoadEnd`   | It ended, loaded or failed.                        | the same                                               |
| `onError`     | It failed.                                         | the same, with the platform's `code` and `description` |
| `onNavigate`  | The URL, title, loading state or history changed.  | the same                                               |
| `onMessage`   | The page called `window.KuitoWebView.postMessage`. | `data`, the string it posted; `url`, the page's URL    |

`onNavigate` also fires for a same-document navigation
(`history.pushState`, a `#fragment`), which has no load events. On iOS, an
inline `html` makes no history entry: `canGoBack` stays false until
the page navigates on to a URL. On Android, an inline HTML page's `url` stays
its `baseUrl` through `history.pushState`, and Chromium skips history
entries a page left on its own, without a tap: after a script sets
`location`, `canGoBack` can be false there while iOS says true.

`onLoad` can carry an empty `title` on iOS: WebKit sets the title after the
load finishes, and `onNavigate` reports it. A load
another load replaces doesn't report an error. `code` is an `NSURLError`
code on iOS and a `WebViewClient.ERROR_*` code on Android.

## Ref methods

| Method                     | What it does                                                                |
| -------------------------- | --------------------------------------------------------------------------- |
| `goBack()`, `goForward()`  | Through the page's history.                                                 |
| `reload()`, `stop()`       |                                                                             |
| `injectJavaScript(script)` | Runs `script` in the main frame. Its result and errors stay in the page.    |
| `postMessage(data)`        | Dispatches a `MessageEvent` on the page's `window`, with the string `data`. |

They are the view's [methods](native-modules.md#how-views-work): each returns a
Promise that resolves once the platform has started the work, not when the
page has finished it, and rejects with `ERR_VIEW_NOT_FOUND` once the WebView
is unmounted. Wait for `onLoad` or a message from the page before posting to
a page that is still loading.

## Messages

The page talks to the app through one object, `window.KuitoWebView`, with
one method:

```js
// In the page
window.KuitoWebView.postMessage(JSON.stringify({ type: 'ready' }));
window.addEventListener('message', (event) => console.log(event.data));
```

```tsx
// In the app
import { Button, VStack, WebView, webViewRef } from 'kuito';

declare function handle(message: { type: string }): void;

export function Bridge() {
  const page = webViewRef();

  return (
    <VStack flex={1}>
      <WebView
        ref={page}
        flex={1}
        src="https://example.com"
        onMessage={(event) => handle(JSON.parse(event.data))}
      />
      <Button onPress={() => void page.current?.postMessage(JSON.stringify({ type: 'hello' }))}>
        Say hello
      </Button>
    </VStack>
  );
}
```

Messages are strings: post JSON for structured data. `postMessage` coerces
anything else to a string. On iOS only the main frame gets the bridge; on
Android, `addJavascriptInterface` puts it in every frame, iframes included.
Check `event.url` before trusting a message, and keep untrusted origins out
with `allowedOrigins`.

## Navigation

`allowedOrigins` decides each main-frame navigation synchronously, on the
platform, against the URL's origin (`scheme://host[:port]`): `*` matches any
run of characters, case-insensitively. `https://*.example.com` allows every
subdomain, not `example.com` itself. `about:` pages always load.

A navigation outside the whitelist is cancelled. When the user followed a
link to it, the URL opens through [Linking](linking.md), in the browser or
the app that handles it; a page that redirects or sets `location` on its own
is only stopped, so it can't open other apps without a tap. The `src` you
pass, back/forward and reload always load. Frames inside the page aren't
checked. `target="_blank"` links and `window.open` load in the same view,
through the whitelist.

### Why there is no `onShouldStartLoadWithRequest`

react-native-webview's `onShouldStartLoadWithRequest` asks JavaScript
whether to load each URL. Android's `shouldOverrideUrlLoading` must answer
on the UI thread before it returns, so a JavaScript answer means blocking the
UI thread on the JS thread. react-native-webview does that, with a timeout.
The alternative, cancel every navigation and load the allowed ones again,
drops POST bodies and history. Kuito runs no JavaScript for the decision:
the whitelist is data the platform matches on its own. iOS could ask
asynchronously, but both platforms keep the same API.

## Security

- **One bridge object.** The page sees `window.KuitoWebView` with
  `postMessage` and nothing else: no module, no native object, no file or
  network access through the app.
- **No file access.** File and content URLs don't load: Android turns off
  `allowFileAccess` and `allowContentAccess`, and iOS loads a `file:` URL only
  through `loadFileURL`, which Kuito doesn't call.
- **No mixed content.** Android uses `MIXED_CONTENT_NEVER_ALLOW`: an https page
  loads nothing over http. WebKit blocks mixed active content (scripts,
  stylesheets, frames, requests) and has no switch to allow it.
- **No new windows, no file uploads.** `window.open` and `target="_blank"`
  stay in the view; `<input type="file">` does nothing. Downloads aren't handled either:
  a link to a file does nothing on Android and shows the file, if WebKit can,
  on iOS.

- **Location only with the app's permission.** On Android a page asking for
  the location is denied. On iOS WebKit asks the user, under the app's own
  location permission, only when the app declares one (the Location module's
  `NSLocationWhenInUseUsageDescription`); otherwise the page is denied.

## Cookies and storage

A WebView keeps the platform's default store, shared by every WebView in the
app and kept across launches:

- **iOS:** `WKWebsiteDataStore.default()`: cookies, local storage and
  caches. It isn't shared with Safari or with `URLSession`, so `fetch` from
  the app doesn't send the page's cookies, and the other way round.
- **Android:** `CookieManager.getInstance()`, with DOM storage on. Third-party
  cookies are off, the platform default. The app's own `fetch` doesn't share
  it either.

There is no API to read or clear cookies yet.

## Debugging

In a development build, pages are inspectable: Safari's Develop menu lists
the simulator's or device's WebViews (`isInspectable`, iOS 16.4 and later),
and Chrome's `chrome://inspect` lists an Android device's
(`setWebContentsDebuggingEnabled`). They aren't part of `kuito dev`'s
debugger, which attaches to Hermes: a page runs in the platform's JavaScript
engine, not in Hermes.

## Layout and scrolling

A WebView has no intrinsic size: give it a `height`, or `flex` in a sized
parent. Inside a `Scroll`, the page scrolls first; on Android the
`Scroll` takes the gesture once the page reaches its edge, and on iOS
UIKit's nested scroll views do the same.
