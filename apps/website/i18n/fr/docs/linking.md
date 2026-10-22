# linking

Ouvrir des URL dans d'autres apps, et suivre les liens qui ouvrent celle-ci.
Sur iOS c'est `UIApplication.open` ; sur Android un intent `ACTION_VIEW`.

```tsx
import { watch, linking } from 'kuito';

await linking.open('https://www.tvmaze.com');
if (await linking.canOpen('mailto:hi@example.com')) await linking.open('mailto:hi@example.com');

linking.url.value; // 'kuito://show/42', or null
watch(linking.url, (url) => console.log(url)); // in a component
```

| Membre         | Est                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open(url)`    | Ouvre `url` dans l'app qui la prend en charge. Rejette avec `ERR_URL` quand aucune app ne le fait, ou quand `url` n'a pas de schéma.              |
| `canOpen(url)` | Si une app installée prend en charge `url` (ci-dessous).                                                                                          |
| `url`          | Un signal : le lien qui a ouvert l'app en dernier, en commençant par celui avec lequel elle a été lancée, ou `null`. Un rechargement le conserve. |

`url` se lit de façon synchrone. Tant que quelque chose l'observe, il suit
chaque lien qui ouvre l'app pendant qu'elle tourne ; le même lien deux fois de
suite est un seul changement. La page de l'app dans les Réglages est
[`app.openSettings()`](app-state.md).

Pour naviguer sur les liens profonds, un `<Router linking>` s'en charge pour
vous ([navigation.md](navigation.md#deep-links)) ; n'observez `url` vous-même
que pour les liens qui ne sont pas des routes.

## canOpen

Les deux plateformes cachent les autres apps à moins que l'app ne déclare ce
qu'elle demande :

- iOS répond `true` pour `http` et `https`, et pour les autres schémas
  seulement quand `LSApplicationQueriesSchemes` dans `Info.plist` les liste
  (`ios.infoPlist` dans [`kuito.config.ts`](apps.md#native-settings)).
- Android 11 et versions ultérieures répondent pour les intents que le
  `<queries>` du manifeste nomme. Le shell déclare `http`, `https`, `mailto`,
  `tel` et `sms` ; une app en ajoute avec `android.manifest.queries`.

`open` n'a besoin ni de l'un ni de l'autre : il ouvre tout ce que le système
peut ouvrir.

## Le schéma d'URL de l'app

Les schémas d'une app sont `urlSchemes` dans [`kuito.config.ts`](apps.md#native-settings) :
`urlSchemes: ['myapp']` fait que `myapp://show/42` l'ouvre, via `CFBundleURLTypes` sur iOS
et un filtre d'intent `VIEW` avec `<data android:scheme="myapp" />` sur Android. L'app de
démonstration de ce dépôt, Reel, déclare `kuito`, que les exemples ici utilisent. L'activité
est `singleTask`, un lien qui arrive pendant que l'app tourne l'atteint donc via `onNewIntent`
au lieu d'en démarrer une seconde.

### Domaines liés

`linkDomains: ['example.com']` fait que les liens https du site ouvrent l'app au lieu du
navigateur : des liens universels sur iOS, un domaine associé `applinks:example.com` pour
chacun (en plus des `ios.associatedDomains` que l'app déclare), et des liens d'application
vérifiés sur Android, un filtre d'intent `VIEW` `autoVerify` pour `https://example.com`. Un
domaine est un nom d'hôte, sans schéma ni chemin. Le site prouve que le lien appartient à
l'app : il sert `/.well-known/apple-app-site-association`, qui nomme l'équipe et l'identifiant
de bundle de l'app, et `/.well-known/assetlinks.json`, qui nomme son applicationId et son
certificat de signature. Sans eux, iOS et Android continuent d'ouvrir le navigateur.

Un `<Router linking>` fait correspondre un tel lien à une route par son chemin, comme il le
fait pour un schéma personnalisé ([liens profonds](navigation.md#deep-links)) :
`https://example.com/show/42` est `/show/42`.

Essayez-en un depuis le terminal :

```bash
xcrun simctl openurl booted kuito://show/1
```

```bash
adb shell am start -a android.intent.action.VIEW -d kuito://show/1
```

Un lien qui démarre le shell de développement à froid exécute l'app embarquée
dans le shell et joint le serveur de développement à l'URL par défaut, comme
le ferait le premier lancement via `kuito dev`. Un build de release ouvre les
liens à froid comme il le fait à chaud.

## Comment c'est câblé

Le shell rapporte les liens à `KuitoLinks` (`native/modules/linking`), et le
module `Linking` les y lit : le dernier lien sous un verrou, pour la lecture
synchrone du thread JS. Sa spec le marque `always`, chaque shell l'inclut
donc ([modules natifs](native-modules.md#which-modules-a-shell-includes)) :

- iOS : les options de connexion du scene delegate (le lien de lancement, ou
  le `webpageURL` d'un lien universel), puis `scene(_:openURLContexts:)` et
  `scene(_:continue:)`.
- Android : l'intent de l'activité dans `onCreate`, puis `onNewIntent`.

`KuitoLinks` survit au runtime, le dernier lien reste donc après un
rechargement et les liens continuent d'affluer vers le runtime qui observe.
