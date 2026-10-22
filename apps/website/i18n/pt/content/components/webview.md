# WebView

`WebView` mostra uma página web: `WKWebView` no iOS e o `android.webkit.WebView` do sistema no Android, sem dependências adicionais. Aceita props de estilo e de layout e precisa de um tamanho: uma `height`, ou `flex` num pai com tamanho.

Use-o para:

- um centro de ajuda, termos ou uma página que a aplicação não reconstrói de forma nativa;
- uma página de início de sessão ou de pagamento de outro serviço;
- HTML que a própria aplicação renderiza, como o corpo de um artigo.

```tsx
import { WebView } from 'kuito';

export default function Help() {
  return <WebView flex={1} src="https://example.com/help" />;
}
```

`src` aceita um URL, ou `{ uri, headers }` para enviar cabeçalhos de pedido; `html` aceita HTML inline, ou `{ html, baseUrl }`. Defina um deles. Um novo valor só carrega quando difere do atual.

## Padrões

### Adicionar botões de retroceder e avançar

`webViewRef()` cria uma ref que também guarda o estado da página como sinais: `url`, `title`, `loading`, `canGoBack` e `canGoForward`, atualizados pelos `onLoadStart`, `onLoad`, `onLoadEnd` e `onError` de cada carregamento. Uma alteração sem carregamento, como um `pushState` ou um título definido mais tarde, chega apenas a `onNavigate`.

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

### Falar com a página

A página fala com a aplicação através de um único objeto, `window.KuitoWebView`, com um único método, `postMessage`. As mensagens são strings: envie JSON para dados estruturados. `onMessage` recebe `data` e o `url` da página; verifique `url` antes de confiar numa mensagem. O `postMessage(data)` da ref despacha um evento `message` no `window` da página.

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

Espere por `onLoad`, ou por uma mensagem da página, antes de enviar para uma página que ainda está a carregar.

### Manter a navegação no seu próprio site

`allowedOrigins` decide cada navegação da frame principal contra a origem do URL, como padrões com wildcards. Uma navegação para outro lado é cancelada; quando o utilizador seguiu um link para ela, o URL abre através de [Linking](../../../../docs/linking.md), no browser ou na aplicação que o trata.

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

`https://*.example.com` permite todos os subdomínios, não o próprio `example.com`. O `src` que passa, o retroceder, o avançar e o recarregar carregam sempre.

## Diferenças entre plataformas

|                       | iOS                                                        | Android                            |
| --------------------- | ---------------------------------------------------------- | ---------------------------------- |
| Motor                 | `WKWebView`                                                | O `WebView` do sistema             |
| `window.KuitoWebView` | Apenas a frame principal                                   | Todas as frames, incluindo iframes |
| `swipeNavigation`     | Deslizar a partir de uma margem para retroceder ou avançar | Sem efeito                         |

## Acessibilidade

O próprio HTML da página decide o que um leitor de ecrã lê: o VoiceOver e o TalkBack leem a página como o browser da plataforma o faz.

## Ver também

- [Linking](../../../../docs/linking.md)
- [WebView em profundidade](../../../../docs/webview.md): todos os eventos, segurança, cookies e depuração
