import { Button, WebView, ref, type WebViewHandle } from 'kuito';

function Article() {
  const page = ref<WebViewHandle>();

  return (
    <>
      <WebView ref={page} src="https://example.com/article" flex={1} />
      <Button onPress={() => void page.current?.injectJavaScript('window.scrollTo(0, 0)')}>
        Top
      </Button>
      <Button onPress={() => void page.current?.reload()}>Reload</Button>
    </>
  );
}
