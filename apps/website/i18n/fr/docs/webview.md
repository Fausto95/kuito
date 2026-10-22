# WebView

`WebView` affiche une page web : `WKWebView` sur iOS et le
`android.webkit.WebView` du système sur Android, sans dépendance ajoutée. Il suit
l'API de base de react-native-webview. C'est une [vue native](native-modules.md#views), donc
il accepte des props de style et de mise en page et a besoin d'une taille.

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

`webViewRef()` crée une ref qui contient aussi l'état de la page sous forme de signaux, tenus
à jour par ses événements de chargement et de navigation : `url`, `title`, `loading`, `canGoBack` et
`canGoForward`. Un simple `ref<WebViewHandle>()` suffit pour les méthodes seules.

```tsx
void page.current?.reload();
```

## Props

| Prop                 | Défaut                      | Ce qu'elle fait                                                                                                             |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src`                | page vide                   | Une URL, ou `{ uri, headers? }` pour envoyer des en-têtes de requête.                                                       |
| `html`               | aucun                       | Du HTML inline, ou `{ html, baseUrl? }` pour le résoudre par rapport à une URL de base. Définissez `src` ou `html`.         |
| `allowedOrigins`     | `["http://*", "https://*"]` | Où la page peut naviguer, sous forme de motifs à jokers. Voir [Navigation](#navigation).                                    |
| `injectedJavaScript` | aucun                       | S'exécute dans la frame principale à chaque chargement d'un document.                                                       |
| `javaScriptEnabled`  | `true`                      | Les scripts propres à la page. Désactivé, iOS exécute encore ceux de l'app (bridge, injectés) ; Android n'en exécute aucun. |
| `swipeNavigation`    | `false`                     | iOS : balayer depuis un bord pour reculer ou avancer. Android n'a pas ce geste et l'ignore.                                 |
| `userAgent`          | celui de la plateforme      | Remplace l'user agent.                                                                                                      |

Un nouveau `src` ou `html` ne se charge que s'il diffère de l'actuel, donc une
valeur réactive qui recalcule la même valeur ne recharge pas la page.

`injectedJavaScript` s'exécute quand le document est analysé sur iOS (un user script
de fin de document) et quand la page a fini de se charger sur Android
(`onPageFinished`).

## Événements

Le gestionnaire reçoit l'événement avec ses champs directement dessus : `event.url`, et non
`event.nativeEvent.url` comme dans react-native-webview.

| Événement     | Quand                                                           | Champs                                                         |
| ------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| `onLoadStart` | Un chargement de la frame principale démarre.                   | `url`, `title`, `loading`, `canGoBack`, `canGoForward`         |
| `onLoad`      | Il a abouti.                                                    | les mêmes                                                      |
| `onLoadEnd`   | Il s'est terminé, abouti ou échoué.                             | les mêmes                                                      |
| `onError`     | Il a échoué.                                                    | les mêmes, avec le `code` et la `description` de la plateforme |
| `onNavigate`  | L'URL, le titre, l'état de chargement ou l'historique a changé. | les mêmes                                                      |
| `onMessage`   | La page a appelé `window.KuitoWebView.postMessage`.            | `data`, la chaîne qu'elle a postée ; `url`, l'URL de la page   |

`onNavigate` se déclenche aussi pour une navigation dans le même document
(`history.pushState`, un `#fragment`), qui n'a pas d'événements de chargement. Sur iOS, un
`html` inline ne crée pas d'entrée d'historique : `canGoBack` reste à false jusqu'à ce que
la page navigue vers une URL. Sur Android, l'`url` d'une page HTML inline reste
son `baseUrl` à travers `history.pushState`, et Chromium saute les entrées
d'historique qu'une page a laissées d'elle-même, sans tap : après qu'un script a défini
`location`, `canGoBack` peut y être à false alors qu'iOS dit true.

`onLoad` peut porter un `title` vide sur iOS : WebKit définit le titre après la fin du
chargement, et `onNavigate` le rapporte. Un chargement
qu'un autre chargement remplace ne signale pas d'erreur. `code` est un code `NSURLError`
sur iOS et un code `WebViewClient.ERROR_*` sur Android.

## Méthodes de la ref

| Méthode                    | Ce qu'elle fait                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `goBack()`, `goForward()`  | Dans l'historique de la page.                                                                |
| `reload()`, `stop()`       |                                                                                              |
| `injectJavaScript(script)` | Exécute `script` dans la frame principale. Son résultat et ses erreurs restent dans la page. |
| `postMessage(data)`        | Distribue un `MessageEvent` sur le `window` de la page, avec la chaîne `data`.               |

Ce sont les [méthodes](native-modules.md#how-views-work) de la vue : chacune renvoie une
Promise qui se résout une fois que la plateforme a commencé le travail, pas quand la
page l'a terminé, et qui rejette avec `ERR_VIEW_NOT_FOUND` une fois le WebView
démonté. Attendez `onLoad` ou un message de la page avant de poster vers
une page encore en cours de chargement.

## Messages

La page parle à l'app par un seul objet, `window.KuitoWebView`, doté d'une
seule méthode :

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

Les messages sont des chaînes : postez du JSON pour des données structurées. `postMessage` convertit
tout le reste en chaîne. Sur iOS, seule la frame principale reçoit le bridge ; sur
Android, `addJavascriptInterface` le place dans chaque frame, iframes comprises.
Vérifiez `event.url` avant de faire confiance à un message, et tenez les origines non fiables
à l'écart avec `allowedOrigins`.

## Navigation

`allowedOrigins` décide chaque navigation de la frame principale de façon synchrone, sur la
plateforme, d'après l'origine de l'URL (`scheme://host[:port]`) : `*` correspond à toute
suite de caractères, sans distinction de casse. `https://*.example.com` autorise chaque
sous-domaine, pas `example.com` lui-même. Les pages `about:` se chargent toujours.

Une navigation hors de la liste blanche est annulée. Quand l'utilisateur a suivi un
lien vers elle, l'URL s'ouvre via [Linking](linking.md), dans le navigateur ou
l'app qui la prend en charge ; une page qui redirige ou définit `location` d'elle-même
est seulement arrêtée, afin qu'elle ne puisse pas ouvrir d'autres apps sans tap. Le `src` que vous
passez, le retour/l'avance et le rechargement se chargent toujours. Les frames à l'intérieur de la page ne sont pas
vérifiées. Les liens `target="_blank"` et `window.open` se chargent dans la même vue,
en passant par la liste blanche.

### Pourquoi il n'y a pas de `onShouldStartLoadWithRequest`

Le `onShouldStartLoadWithRequest` de react-native-webview demande à JavaScript
s'il faut charger chaque URL. Le `shouldOverrideUrlLoading` d'Android doit répondre
sur le thread UI avant de retourner, donc une réponse venue de JavaScript signifie bloquer le
thread UI sur le thread JS. react-native-webview le fait, avec un délai d'expiration.
L'alternative, annuler chaque navigation et recharger celles qui sont autorisées,
perd les corps des requêtes POST et l'historique. Kuito n'exécute aucun JavaScript pour la décision :
la liste blanche est une donnée que la plateforme compare elle-même. iOS pourrait demander
de façon asynchrone, mais les deux plateformes gardent la même API.

## Sécurité

- **Un seul objet bridge.** La page voit `window.KuitoWebView` avec
  `postMessage` et rien d'autre : aucun module, aucun objet natif, aucun accès aux fichiers ou
  au réseau à travers l'app.
- **Aucun accès aux fichiers.** Les URL file et content ne se chargent pas : Android désactive
  `allowFileAccess` et `allowContentAccess`, et iOS ne charge une URL `file:` que
  par `loadFileURL`, que Kuito n'appelle pas.
- **Pas de contenu mixte.** Android utilise `MIXED_CONTENT_NEVER_ALLOW` : une page https
  ne charge rien en http. WebKit bloque le contenu actif mixte (scripts,
  feuilles de style, frames, requêtes) et n'a aucun réglage pour l'autoriser.
- **Pas de nouvelles fenêtres, pas d'envoi de fichiers.** `window.open` et `target="_blank"`
  restent dans la vue ; `<input type="file">` ne fait rien. Les téléchargements ne sont pas gérés non plus :
  un lien vers un fichier ne fait rien sur Android et affiche le fichier, si WebKit le peut,
  sur iOS.

- **La localisation seulement avec la permission de l'app.** Sur Android, une page qui demande
  la localisation est refusée. Sur iOS, WebKit demande à l'utilisateur, sous la propre
  permission de localisation de l'app, seulement quand l'app en déclare une (le
  `NSLocationWhenInUseUsageDescription` du module Location) ; sinon la page est refusée.

## Cookies et stockage

Un WebView conserve le magasin par défaut de la plateforme, partagé par chaque WebView de
l'app et conservé d'un lancement à l'autre :

- **iOS :** `WKWebsiteDataStore.default()` : cookies, local storage et
  caches. Il n'est partagé ni avec Safari ni avec `URLSession`, donc un `fetch` depuis
  l'app n'envoie pas les cookies de la page, et inversement.
- **Android :** `CookieManager.getInstance()`, avec le stockage DOM activé. Les cookies
  tiers sont désactivés, le défaut de la plateforme. Le `fetch` propre à l'app ne le partage
  pas non plus.

Il n'y a pas encore d'API pour lire ou effacer les cookies.

## Débogage

Dans un build de développement, les pages sont inspectables : le menu Développement de Safari liste
les WebViews du simulateur ou de l'appareil (`isInspectable`, iOS 16.4 et ultérieur),
et le `chrome://inspect` de Chrome liste celles d'un appareil Android
(`setWebContentsDebuggingEnabled`). Elles ne font pas partie du débogueur de
`kuito dev`, qui s'attache à Hermes : une page s'exécute dans le moteur JavaScript
de la plateforme, pas dans Hermes.

## Mise en page et défilement

Un WebView n'a pas de taille intrinsèque : donnez-lui une `height`, ou `flex` dans un
parent dimensionné. Dans un `Scroll`, la page défile en premier ; sur Android, le
`Scroll` prend le geste une fois que la page atteint son bord, et sur iOS
les scroll views imbriquées d'UIKit font de même.
