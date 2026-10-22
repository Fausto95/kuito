// Follow navigation inside embedded content.
import { Text, WebView, signal, type WebViewNavigation } from 'kuito';

const state = signal<WebViewNavigation | null>(null);

// Every load and navigation event carries the page's state.
const follow = (event: WebViewNavigation) => (state.value = event);

<>
  <Text>{state.value?.loading ? 'Loading…' : state.value?.title}</Text>
  <WebView src="https://example.com" flex={1} onLoad={follow} onNavigate={follow} />
</>;
