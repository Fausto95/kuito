import {
  Button,
  HStack,
  SafeArea,
  Scroll,
  VStack,
  Text,
  signal,
  WebView,
  webViewRef,
  type WebViewNavigationEvent,
} from 'kuito';

// WebView end to end (docs/webview.md): a site and inline HTML, back and
// forward, messages both ways, injected script, a link outside the
// whitelist (it opens through Linking), and a web form, inside a Scroll.

const PAGE = `<!doctype html>
<html>
  <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="font-family: -apple-system, sans-serif; padding: 12px">
    <h2 id="title">Inline page</h2>
    <p id="inbox">No message yet</p>
    <form onsubmit="event.preventDefault(); window.KuitoWebView.postMessage('form:' + this.name.value)">
      <input name="name" placeholder="Your name" style="font-size: 18px; width: 70%">
      <button>Send</button>
    </form>
    <p><button onclick="window.KuitoWebView.postMessage('hello from the page')">Post to app</button></p>
    <p><a id="allowed" href="https://example.com/">example.com (allowed)</a></p>
    <p><a id="blocked" href="https://www.wikipedia.org/">wikipedia.org (blocked: opens in the browser)</a></p>
    <p><a href="#second" onclick="history.pushState({}, '', '#second')">pushState</a></p>
    ${'<p>Scroll me.</p>'.repeat(30)}
    <script>
      window.addEventListener('message', (event) => {
        document.getElementById('inbox').textContent = 'App says: ' + event.data;
      });
    </script>
  </body>
</html>`;

export default function App() {
  const web = webViewRef();
  let posts = 0;
  const inline = signal(true);
  const status = signal('');
  const log = signal<string[]>([]);
  const add = (line: string) => (log.value = [line, ...log.value].slice(0, 8));
  const describe = (event: WebViewNavigationEvent) =>
    `${event.loading ? 'loading' : 'idle'} ${event.url} back=${event.canGoBack} forward=${event.canGoForward}`;

  return (
    <SafeArea flex={1} backgroundColor="#ffffff">
      <Scroll id="scroll" flex={1}>
        <VStack padding={12} gap={8}>
          <Text fontSize={24} fontWeight="bold">
            WebView
          </Text>
          <HStack gap={8} flexWrap="wrap">
            <Button id="inline" onPress={() => (inline.value = true)}>
              Inline
            </Button>
            <Button id="site" onPress={() => (inline.value = false)}>
              Site
            </Button>
            <Button id="back" onPress={() => web.current?.goBack()}>
              {web.canGoBack.value ? 'Back' : '(no back)'}
            </Button>
            <Button id="forward" onPress={() => web.current?.goForward()}>
              {web.canGoForward.value ? 'Forward' : '(no forward)'}
            </Button>
            <Button id="reload" onPress={() => web.current?.reload()}>
              Reload
            </Button>
          </HStack>
          <HStack gap={8} flexWrap="wrap">
            <Button id="post" onPress={() => web.current?.postMessage(`hi #${++posts}`)}>
              Post to page
            </Button>
            <Button
              id="navigate"
              onPress={() =>
                web.current?.injectJavaScript("location.href = 'https://www.example.com/'")
              }
            >
              Go to www
            </Button>
            <Button
              id="fail"
              onPress={() =>
                web.current?.injectJavaScript("location.href = 'https://no-such-host.example.com/'")
              }
            >
              Fail
            </Button>
            <Button
              id="inject"
              onPress={() =>
                web.current?.injectJavaScript(
                  "document.body.style.background = '#ffe9a8'; window.KuitoWebView.postMessage('injected ran')",
                )
              }
            >
              Inject
            </Button>
          </HStack>
          <Text id="state">{status.value}</Text>
          <WebView
            id="web"
            ref={web}
            height={420}
            borderWidth={1}
            borderColor="#cccccc"
            src={inline.value ? undefined : 'https://example.com/'}
            html={inline.value ? { html: PAGE, baseUrl: 'https://kuito.example/' } : undefined}
            allowedOrigins={[
              'https://example.com',
              'https://*.example.com',
              'https://kuito.example',
            ]}
            injectedJavaScript="window.KuitoWebView.postMessage('injectedJavaScript: ' + document.title)"
            swipeNavigation
            onLoadStart={(event) => add(`loadStart ${event.url}`)}
            onLoad={(event) => add(`load ${event.title}`)}
            onLoadEnd={(event) => add(`loadEnd ${event.url}`)}
            onError={(event) => add(`error ${event.code} ${event.description}`)}
            onNavigate={(event) => (status.value = describe(event))}
            onMessage={(event) => add(`message ${event.data}`)}
          />
          <Text fontWeight="bold">Log</Text>
          <Text id="log">{log.value.join('\n')}</Text>
          <VStack height={600} backgroundColor="#eef2ff" padding={12}>
            <Text>Room to scroll the outer Scroll.</Text>
          </VStack>
        </VStack>
      </Scroll>
    </SafeArea>
  );
}
