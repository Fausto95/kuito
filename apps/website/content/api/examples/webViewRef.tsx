// Give an embedded help page a reload action.
import { Button, WebView, VStack, webViewRef } from 'kuito';

export function Help() {
  const page = webViewRef();
  return (
    <VStack flex={1}>
      <Button
        disabled={page.loading.value}
        onPress={() => void page.current?.reload().catch(console.error)}
      >
        Reload help
      </Button>
      <WebView
        ref={page}
        src="https://example.com/help"
        allowedOrigins={['https://example.com']}
        flex={1}
      />
    </VStack>
  );
}
