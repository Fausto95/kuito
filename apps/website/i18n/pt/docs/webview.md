# WebView

`WebView` mostra uma página web: `WKWebView` no iOS e o
`android.webkit.WebView` do sistema no Android, sem dependências adicionais. Segue
a API principal do react-native-webview. É uma [vista nativa](native-modules.md#views), pelo que
aceita props de estilo e de layout e precisa de um tamanho.

```tsx
import { Button, WebView, webViewRef } from 'kuito';

const page = webViewRef(); // while a component sets up, like ref()

<WebView
  ref={page}
  flex={1}
  src="https://example.com"
  onMessage={(event) => console.log('page says', event.data)}
/>;

<Button onPress={() => void page.current?.goBack()}>
  {page.canGoBack.value ? 'Back' : 'No back'}
</Button>;
```

`webViewRef()` cria uma ref que também guarda o estado da página como sinais, mantidos
pelos seus eventos de carregamento e de navegação: `url`, `title`, `loading`, `canGoBack` e
`canGoForward`. Um `ref<WebViewHandle>()` simples chega para os métodos apenas.

```tsx
void page.current?.reload();
```

## Props

| Prop                 | Predefinição                | O que faz                                                                                                         |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src`                | página em branco            | Um URL, ou `{ uri, headers? }` para enviar cabeçalhos no pedido.                                                  |
| `html`               | nenhum                      | HTML inline, ou `{ html, baseUrl? }` para o resolver contra um URL base. Defina `src` ou `html`.                  |
| `allowedOrigins`     | `["http://*", "https://*"]` | Para onde a página pode navegar, como padrões com wildcards. Ver [Navegação](#navigation).                        |
| `injectedJavaScript` | nenhum                      | Corre no frame principal de cada vez que um documento carrega.                                                    |
| `javaScriptEnabled`  | `true`                      | Os scripts da própria página. Desligado, o iOS continua a correr os da app (bridge, injetados); o Android nenhum. |
| `swipeNavigation`    | `false`                     | iOS: deslizar a partir de uma margem para recuar ou avançar. O Android não tem esse gesto e ignora-o.             |
| `userAgent`          | o da plataforma             | Substitui o user agent.                                                                                           |

Um novo `src` ou `html` só carrega quando difere do atual, pelo que um
valor reativo que recalcula o mesmo resultado não recarrega a página.

`injectedJavaScript` corre quando o documento é analisado no iOS (um user script
de fim de documento) e quando a página acaba de carregar no Android
(`onPageFinished`).

## Eventos

O handler recebe o evento com os campos diretamente nele: `event.url`, e não
o `event.nativeEvent.url` do react-native-webview.

| Evento        | Quando                                                            | Campos                                                  |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| `onLoadStart` | Começa um carregamento do frame principal.                        | `url`, `title`, `loading`, `canGoBack`, `canGoForward`  |
| `onLoad`      | Carregou.                                                         | os mesmos                                               |
| `onLoadEnd`   | Terminou, com sucesso ou com falha.                               | os mesmos                                               |
| `onError`     | Falhou.                                                           | os mesmos, com o `code` e a `description` da plataforma |
| `onNavigate`  | O URL, o título, o estado de carregamento ou o histórico mudaram. | os mesmos                                               |
| `onMessage`   | A página chamou `window.KuitoWebView.postMessage`.                | `data`, a string que publicou; `url`, o URL da página   |

`onNavigate` também dispara numa navegação dentro do mesmo documento
(`history.pushState`, um `#fragment`), que não tem eventos de carregamento. No iOS, um
`html` inline não cria entrada no histórico: `canGoBack` fica a false até
a página navegar para um URL. No Android, o `url` de uma página HTML inline mantém-se
o seu `baseUrl` ao longo de `history.pushState`, e o Chromium salta as entradas de histórico
que uma página deixou por si própria, sem um toque: depois de um script definir
`location`, `canGoBack` pode ser false aí enquanto o iOS diz true.

`onLoad` pode trazer um `title` vazio no iOS: o WebKit define o título depois de o
carregamento terminar, e `onNavigate` reporta-o. Um carregamento que
outro carregamento substitui não reporta erro. `code` é um código `NSURLError`
no iOS e um código `WebViewClient.ERROR_*` no Android.

## Métodos da ref

| Método                     | O que faz                                                                  |
| -------------------------- | -------------------------------------------------------------------------- |
| `goBack()`, `goForward()`  | Percorrem o histórico da página.                                           |
| `reload()`, `stop()`       |                                                                            |
| `injectJavaScript(script)` | Corre `script` no frame principal. O resultado e os erros ficam na página. |
| `postMessage(data)`        | Despacha um `MessageEvent` no `window` da página, com a string `data`.     |

São os [métodos](native-modules.md#how-views-work) da vista: cada um devolve uma
Promise que resolve assim que a plataforma começou o trabalho, não quando a
página o terminou, e rejeita com `ERR_VIEW_NOT_FOUND` quando o WebView
é desmontado. Espere por `onLoad` ou por uma mensagem da página antes de publicar para
uma página que ainda está a carregar.

## Mensagens

A página fala com a app através de um único objeto, `window.KuitoWebView`, com
um único método:

```js
// In the page
window.KuitoWebView.postMessage(JSON.stringify({ type: 'ready' }));
window.addEventListener('message', (event) => console.log(event.data));
```

```tsx
// In the app
<WebView ref={page} onMessage={(event) => handle(JSON.parse(event.data))} />;
void page.current?.postMessage(JSON.stringify({ type: 'hello' }));
```

As mensagens são strings: publique JSON para dados estruturados. `postMessage` converte
qualquer outra coisa numa string. No iOS só o frame principal recebe a bridge; no
Android, `addJavascriptInterface` coloca-a em todos os frames, iframes incluídos.
Verifique `event.url` antes de confiar numa mensagem, e mantenha as origens não fiáveis de fora
com `allowedOrigins`.

## Navegação

`allowedOrigins` decide cada navegação do frame principal de forma síncrona, na
plataforma, contra a origem do URL (`scheme://host[:port]`): `*` corresponde a qualquer
sequência de caracteres, sem distinguir maiúsculas de minúsculas. `https://*.example.com` permite todos os
subdomínios, mas não o próprio `example.com`. As páginas `about:` carregam sempre.

Uma navegação fora da lista de permissões é cancelada. Quando o utilizador seguiu uma
ligação para lá, o URL abre através de [Linking](linking.md), no browser ou
na app que o trata; uma página que redireciona ou define `location` por si própria
é apenas travada, para que não possa abrir outras apps sem um toque. O `src` que
passa, recuar/avançar e recarregar carregam sempre. Os frames dentro da página não são
verificados. As ligações `target="_blank"` e `window.open` carregam na mesma vista,
através da lista de permissões.

### Porque não há `onShouldStartLoadWithRequest`

O `onShouldStartLoadWithRequest` do react-native-webview pergunta ao JavaScript
se deve carregar cada URL. O `shouldOverrideUrlLoading` do Android tem de responder
na thread de UI antes de retornar, pelo que uma resposta em JavaScript significa bloquear a
thread de UI à espera da thread de JS. O react-native-webview faz isso, com um timeout.
A alternativa, cancelar todas as navegações e voltar a carregar as permitidas,
perde os corpos dos POST e o histórico. O Kuito não corre JavaScript nenhum para a decisão:
a lista de permissões são dados que a plataforma compara por si própria. O iOS podia perguntar
de forma assíncrona, mas ambas as plataformas mantêm a mesma API.

## Segurança

- **Um único objeto de bridge.** A página vê `window.KuitoWebView` com
  `postMessage` e nada mais: nenhum módulo, nenhum objeto nativo, nenhum acesso a ficheiros ou
  à rede através da app.
- **Sem acesso a ficheiros.** URLs de ficheiros e de conteúdo não carregam: o Android desliga
  `allowFileAccess` e `allowContentAccess`, e o iOS só carrega um URL `file:`
  através de `loadFileURL`, que o Kuito não chama.
- **Sem conteúdo misto.** O Android usa `MIXED_CONTENT_NEVER_ALLOW`: uma página https
  não carrega nada por http. O WebKit bloqueia conteúdo ativo misto (scripts,
  folhas de estilo, frames, pedidos) e não tem interruptor para o permitir.
- **Sem novas janelas, sem envio de ficheiros.** `window.open` e `target="_blank"`
  ficam na vista; `<input type="file">` não faz nada. As transferências também não são tratadas:
  uma ligação para um ficheiro não faz nada no Android e mostra o ficheiro, se o WebKit conseguir,
  no iOS.

- **Localização só com a permissão da app.** No Android, uma página que pede a
  localização é recusada. No iOS, o WebKit pergunta ao utilizador, ao abrigo da própria
  permissão de localização da app, apenas quando a app declara uma (a
  `NSLocationWhenInUseUsageDescription` do módulo Location); caso contrário, a página é recusada.

## Cookies e armazenamento

Um WebView mantém o armazenamento predefinido da plataforma, partilhado por todos os WebViews da
app e preservado entre arranques:

- **iOS:** `WKWebsiteDataStore.default()`: cookies, local storage e
  caches. Não é partilhado com o Safari nem com `URLSession`, pelo que um `fetch` a partir
  da app não envia os cookies da página, nem o inverso.
- **Android:** `CookieManager.getInstance()`, com o armazenamento DOM ligado. Os cookies de
  terceiros estão desligados, a predefinição da plataforma. O `fetch` da própria app também não
  o partilha.

Ainda não há API para ler ou limpar cookies.

## Depuração

Numa build de desenvolvimento, as páginas são inspecionáveis: o menu Develop do Safari lista
os WebViews do simulador ou do dispositivo (`isInspectable`, iOS 16.4 e posteriores),
e o `chrome://inspect` do Chrome lista os de um dispositivo Android
(`setWebContentsDebuggingEnabled`). Não fazem parte do depurador do `kuito dev`,
que se liga ao Hermes: uma página corre no motor de JavaScript da
plataforma, não no Hermes.

## Layout e scroll

Um WebView não tem tamanho intrínseco: dê-lhe uma `height`, ou `flex` num
pai com tamanho. Dentro de um `Scroll`, a página faz scroll primeiro; no Android o
`Scroll` assume o gesto quando a página chega à sua margem, e no iOS
as scroll views aninhadas do UIKit fazem o mesmo.
