import { VStack, signal, Show, WebView, webViewRef } from 'kuito';

export default function App() {
  const page = webViewRef();
  const html = signal(false);
  const seen: unknown[] = [];

  // The test drives the ref and reads what the handlers saw, from inside the kernel.
  Object.assign(globalThis, { page, seen, showHtml: (next: boolean) => (html.value = next) });

  return (
    <VStack id="root">
      <Show when={!html.value}>
        <WebView
          id="page"
          ref={page}
          height={400}
          src={{ uri: 'https://example.com', headers: { 'Accept-Language': 'pt' } }}
          allowedOrigins={['https://*.example.com', 'https://example.com']}
          injectedJavaScript="document.body.dataset.app = 'kuito'"
          javaScriptEnabled
          swipeNavigation
          userAgent="Kuito Test"
          onLoadStart={(event) => seen.push(['loadStart', event.url, event.loading])}
          onLoad={(event) => seen.push(['load', event.url, event.title])}
          onLoadEnd={(event) => seen.push(['loadEnd', event.url])}
          onError={(event) => seen.push(['error', event.url, event.code, event.description])}
          onNavigate={(event) =>
            seen.push(['navigation', event.url, event.canGoBack, event.canGoForward])
          }
          onMessage={(event) => seen.push(['message', event.data, event.url])}
        />
      </Show>
      <Show when={html.value}>
        <WebView
          id="inline"
          flex={1}
          html={{ html: '<h1>Hi</h1>', baseUrl: 'https://example.com' }}
        />
      </Show>
    </VStack>
  );
}
