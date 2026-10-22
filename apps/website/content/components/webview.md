# WebView

`WebView` shows a web page: `WKWebView` on iOS and the system `android.webkit.WebView` on Android, with no added dependency. It takes style and layout props and needs a size: a `height`, or `flex` in a sized parent.

Use it for:

- a help center, terms or a page the app doesn't rebuild natively;
- a sign-in or a payment page from another service;
- HTML the app renders itself, such as an article's body.

```tsx
import { WebView } from 'kuito';

export default function Help() {
  return <WebView flex={1} src="https://example.com/help" />;
}
```

`src` takes a URL, or `{ uri, headers }` to send request headers; `html` takes inline HTML, or `{ html, baseUrl }`. Set one of them. A new value loads only when it differs from the current one.

## Patterns

### Add back and forward buttons

`webViewRef()` makes a ref that also holds the page's state as signals: `url`, `title`, `loading`, `canGoBack` and `canGoForward`, updated by each load's `onLoadStart`, `onLoad`, `onLoadEnd` and `onError`. A change without a load, such as a `pushState` or a title set later, reaches `onNavigate` only.

```tsx
import { Button, HStack, Text, VStack, WebView, webViewRef } from 'kuito';

export default function Browser() {
  const page = webViewRef();

  return (
    <VStack flex={1}>
      <HStack gap={8} padding={8} alignItems="center">
        <Button disabled={!page.canGoBack.value} onPress={() => void page.current?.goBack()}>
          Back
        </Button>
        <Text lineClamp={1}>{page.loading.value ? 'Loading…' : page.title.value}</Text>
      </HStack>
      <WebView ref={page} flex={1} src="https://example.com" />
    </VStack>
  );
}
```

### Talk to the page

The page talks to the app through one object, `window.KuitoWebView`, with one method, `postMessage`. Messages are strings: post JSON for structured data. `onMessage` receives `data` and the page's `url`; check `url` before trusting a message. The ref's `postMessage(data)` dispatches a `message` event on the page's `window`.

```tsx
import { WebView, webViewRef } from 'kuito';

const PAGE = `<button onclick="window.KuitoWebView.postMessage(JSON.stringify({ type: 'liked' }))">Like</button>
<script>window.addEventListener('message', (event) => (document.body.dataset.theme = event.data));</script>`;

export default function Embed() {
  const page = webViewRef();

  return (
    <WebView
      ref={page}
      flex={1}
      html={{ html: PAGE, baseUrl: 'https://example.com' }}
      onLoad={() => void page.current?.postMessage('dark')}
      onMessage={(event) => {
        if (event.url.startsWith('https://example.com')) console.log(JSON.parse(event.data));
      }}
    />
  );
}
```

Wait for `onLoad`, or a message from the page, before posting to a page that is still loading.

### Keep navigation on your own site

`allowedOrigins` decides each main-frame navigation against the URL's origin, as wildcard patterns. A navigation elsewhere is cancelled; when the user followed a link to it, the URL opens through [Linking](../../../../docs/linking.md), in the browser or the app that handles it.

```tsx
import { WebView } from 'kuito';

export default function Docs() {
  return (
    <WebView
      flex={1}
      src="https://docs.example.com"
      allowedOrigins={['https://docs.example.com', 'https://*.example.com']}
    />
  );
}
```

`https://*.example.com` allows every subdomain, not `example.com` itself. The `src` you pass, back, forward and reload always load.

## Platform differences

|                       | iOS                                      | Android                       |
| --------------------- | ---------------------------------------- | ----------------------------- |
| Engine                | `WKWebView`                              | The system `WebView`          |
| `window.KuitoWebView` | The main frame only                      | Every frame, iframes included |
| `swipeNavigation`     | Swipe from an edge to go back or forward | No effect                     |

## Accessibility

The page's own HTML decides what a screen reader reads: VoiceOver and TalkBack read the page as the platform's browser does.

## Related

- [Linking](../../../../docs/linking.md)
- [WebView in depth](../../../../docs/webview.md): every event, security, cookies and debugging
