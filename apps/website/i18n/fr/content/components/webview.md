# WebView

`WebView` affiche une page web : `WKWebView` sur iOS et le `android.webkit.WebView` du système sur Android, sans dépendance ajoutée. Elle prend les props de style et de mise en page et a besoin d'une taille : une `height`, ou `flex` dans un parent dimensionné.

Utilisez-la pour :

- un centre d'aide, des conditions d'utilisation ou une page que l'app ne reconstruit pas en natif ;
- une page de connexion ou de paiement d'un autre service ;
- du HTML que l'app produit elle-même, comme le corps d'un article.

```tsx
import { WebView } from 'kuito';

export default function Help() {
  return <WebView flex={1} src="https://example.com/help" />;
}
```

`src` prend une URL, ou `{ uri, headers }` pour envoyer des en-têtes de requête. `html` prend du HTML inline, ou `{ html, baseUrl }`. Fixez l'un des deux. Une nouvelle valeur ne se charge que si elle diffère de la valeur actuelle.

## Cas d'usage

### Ajouter des boutons précédent et suivant

`webViewRef()` fabrique une ref qui tient aussi l'état de la page en signaux : `url`, `title`, `loading`, `canGoBack` et `canGoForward`, mis à jour par les `onLoadStart`, `onLoad`, `onLoadEnd` et `onError` de chaque chargement. Un changement sans chargement, comme un `pushState` ou un titre fixé plus tard, n'atteint que `onNavigate`.

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

### Dialoguer avec la page

La page parle à l'app par un seul objet, `window.KuitoWebView`, doté d'une seule méthode, `postMessage`. Les messages sont des chaînes : postez du JSON pour des données structurées. `onMessage` reçoit `data` et l'`url` de la page. Vérifiez `url` avant de faire confiance à un message. Le `postMessage(data)` de la ref déclenche un événement `message` sur le `window` de la page.

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

Attendez `onLoad`, ou un message de la page, avant de poster vers une page encore en chargement.

### Garder la navigation sur votre site

`allowedOrigins` décide de chaque navigation de la frame principale d'après l'origine de l'URL, en motifs à joker. Une navigation ailleurs est annulée. Quand l'utilisateur a suivi un lien vers elle, l'URL s'ouvre via [Linking](../../../../docs/linking.md), dans le navigateur ou l'app qui la gère.

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

`https://*.example.com` autorise chaque sous-domaine, pas `example.com` lui-même. Le `src` que vous passez, précédent, suivant et le rechargement se chargent toujours.

## Différences entre plateformes

|                       | iOS                                            | Android                         |
| --------------------- | ---------------------------------------------- | ------------------------------- |
| Moteur                | `WKWebView`                                    | Le `WebView` du système         |
| `window.KuitoWebView` | La frame principale seulement                  | Chaque frame, iframes comprises |
| `swipeNavigation`     | Balayer depuis un bord pour reculer ou avancer | Aucun effet                     |

## Accessibilité

C'est le HTML de la page qui décide de ce que lit un lecteur d'écran : VoiceOver et TalkBack lisent la page comme le fait le navigateur de la plateforme.

## Voir aussi

- [Linking](../../../../docs/linking.md)
- [WebView en profondeur](../../../../docs/webview.md) : chaque événement, la sécurité, les cookies et le débogage
