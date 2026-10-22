# Navigation

Les routes sont des valeurs typées, affichées dans des piles et des barres
d'onglets natives : `UINavigationController` et `UITabBarController` d'UIKit
sur iOS, une pile native avec retour prédictif et la navigation inférieure de
Material sur Android. Le retour arrière suit la plateforme : le balayage depuis
le bord sur iOS, le geste et le bouton de retour sur Android.

Une application est un répertoire de fichiers de routes ; le compilateur les
transforme en table de routes et en `routes`, une fonction typée par route :

```text
app/
  _layout.tsx                export const tabs = [{ name: 'shows', title: 'Shows', icon: 'tv' }, …]
  (shows)/index.tsx          routes.index()            /
  (shows)/show/[id].tsx      routes.show({ id: 42 })   /show/:id
  (library)/library.tsx      routes.library()          /library, the "library" tab
  rate.tsx                   routes.rate({ show })     /rate, a sheet
  routes.generated.d.ts      the types of routes, written by the compiler
```

```tsx
// app/(shows)/show/[id].tsx
import { Link, present, routes, signal, type RouteOptions, type ScreenProps } from 'kuito';

export type Params = { id: number };

export const options: RouteOptions<Params> = { title: ({ id }) => `Show ${id}` };

export default function Show({ id }: ScreenProps<Params>) {
  const stars = signal<number | undefined>(undefined);

  return (
    <>
      <Link to={routes.show({ id: id + 1 })}>Next show</Link>
      <Pressable onPress={async () => (stars.value = await present(routes.rate({ show: id })))}>
        <Text>{stars.value === undefined ? 'Rate it' : `${stars.value} stars`}</Text>
      </Pressable>
    </>
  );
}
```

`routes.show({ id: '42' })` est une erreur de type, tout comme une route qui
n'existe pas. Seul un lien profond est une URL : les
[liens profonds](#deep-links) en font correspondre un à une route.

## Fichiers de routes

`kuito dev ios --entry app` exécute un répertoire d'application (une
application `kuito create` en est un). Chaque fichier `.tsx` ou `.jsx` qu'il
contient est une route, sauf si son nom ou un répertoire au-dessus de lui
commence par `_` ou `.` (placez-y les utilitaires ; les fichiers `.ts`, `.css`
et autres ne sont jamais des routes non plus).

- L'export par défaut est l'écran. Il reçoit les paramètres de la route en
  props, ainsi que `dismiss` ([résultats](#screen-results)).
- `export const options: RouteOptions<Params>` fournit le reste : `title` (une
  chaîne, ou une fonction des paramètres), `header`, `presentation` (`'push'`,
  la valeur par défaut, ou `'sheet'`), `backgroundColor` (celle de tout
  l'écran, sous les barres aussi : le contenu est en retrait de la zone sûre,
  comme UIKit et Android l'y mettent), `snapPoints` (les hauteurs d'une route
  en feuille, telles que [`<Sheet snapPoints>`](primitives.md) les accepte) et
  `systemBars`, les props d'un `<SystemBars>` appliquées tant que l'écran a le
  focus ([SystemBars](system-ui.md#per-screen)).
- Le chemin du fichier est le chemin de lien profond de la route : `index`
  nomme le chemin de son répertoire, `[name]` est un paramètre `:name` et
  `[...name]` un fourre-tout final, capturé dans `name`. Un crochet doit
  constituer le nom entier. Les répertoires `(name)` regroupent des fichiers
  sans ajouter de segment.
- `_layout.tsx` déclare la barre d'onglets : `export const tabs`, un tableau
  de `{ name, title, icon }`, avec `icon` tel que `<Tab>` l'accepte (un nom,
  `{ ios, android }` ou `{ uri }`). Chaque groupe `(name)` de premier niveau
  est l'onglet de ce nom, dans l'ordre du tableau, et chaque groupe de premier
  niveau doit en être un. Les fichiers hors des groupes ne vont dans aucun
  onglet : des feuilles, à côté de la barre d'onglets. Sans `tabs`,
  l'application est une seule pile et les groupes ne font qu'organiser les
  fichiers. `export const linking = true` active les
  [liens profonds](#deep-links). Le compilateur lit les deux sans exécuter le
  fichier, donc chacun est un littéral, et un `_layout.tsx` peut n'exporter
  que l'un des deux.
- Les routes sont ordonnées de sorte que la première correspondance soit la
  plus spécifique et que la route la moins profonde d'une pile soit son
  premier écran : les fourre-tout en dernier, puis les chemins à moins de
  segments, puis les segments statiques avant les paramètres.

Deux fichiers avec le même chemin ou le même nom, un onglet sans routes, un
groupe sans onglet, et un `_layout.tsx` ou une déclaration que le compilateur
ne peut pas lire sont des erreurs de compilation qui nomment le fichier.

## La table des routes

`routes` a une fonction par route, nommée d'après les segments statiques de la
route en camelCase : `index` pour `/`, `show` pour `show/[id].tsx`, `showCast`
pour `show/[id]/cast.tsx`, `myList` pour `my-list.tsx`. Un chemin composé
uniquement de paramètres est nommé d'après eux (`[...rest].tsx` est `rest`).
Appelée avec les paramètres de la route, elle renvoie une `Destination`, la
valeur qu'acceptent `navigate`, `present` et `<Link to>` ; une route sans
paramètres n'en prend aucun.

```tsx
export const name = 'shows'; // in show.tsx, which show/[id].tsx would also name routes.show
```

Deux routes qui partageraient un nom sont une erreur de compilation jusqu'à ce
que l'une déclare le sien avec `export const name`, un littéral de chaîne
identifiant.

Les paramètres d'une route sont ceux de son chemin, sous forme de chaînes, sauf
si le fichier déclare leurs types :

```tsx
export type Params = { id: number; tab?: string };
```

`Params` est un littéral de type (ou une interface) de membres `string`,
`number` et `boolean` : un lien profond transporte chacun comme du texte, donc
chacun doit pouvoir en être analysé. Il contient chaque paramètre que le chemin
nomme, aucun d'eux optionnel ; les autres proviennent de la chaîne de requête
d'un lien profond. Un paramètre ne peut pas s'appeler `dismiss`.

Le compilateur écrit les types de la table dans `routes.generated.d.ts` dans
le répertoire de l'application à chaque construction, et `kuito create` le
livre, si bien qu'un éditeur et `tsc` vérifient chaque route avant que
l'application ne s'exécute. Il augmente `Routes`, l'interface qui type
`routes` ; commitez-le avec les routes.

## Modules de routes

Chaque fichier de route compile en un module qui lui est propre (un chunk, avec
ce que les fichiers de routes partagent découpé en chunks à côté), et le module
d'une route s'exécute la première fois que la route s'affiche. Un démarrage à
froid évalue le noyau, la racine (la table des routes) et le module du premier
écran, rien d'autre ; un onglet monte ses écrans, et exécute leurs modules,
lorsqu'il est sélectionné pour la première fois.

- Le compilateur lit la `presentation` d'une route dans ses `options` sans
  exécuter le module, puisqu'il décide où la route s'affiche avant que le
  module ne se charge : c'est un littéral `'push'` ou `'sheet'`, dans un objet
  littéral `options`.
- Une construction de release compile chaque chunk en bytecode Hermes
  séparément, à côté de `app.hbc` : `Modules/` dans le bundle iOS,
  `assets/kuito/modules/` dans l'APK. Le premier require d'un chunk évalue
  son fichier au sein du job qui l'a requis, si bien que la navigation reste
  synchrone, et le trace sous le nom `Kuito evaluate kuito://modules/<chunk>`.
- Un Live Patch envoie chaque chunk de la révision en un seul script, qui les
  définit et exécute à nouveau la racine ; le module de chaque route
  s'exécute à nouveau quand son écran se rend à nouveau, si bien qu'un fichier
  de route patché s'applique en place.

## Se déplacer entre les routes

- `navigate(routes.show({ id }))` : affiche la destination. Une route dans un
  autre onglet sélectionne cet onglet ; la première route d'un onglet dépile
  cet onglet jusqu'à elle ; toute autre route est empilée sur sa pile, sauf si
  elle est déjà au sommet avec les mêmes paramètres. Une route en feuille
  ouvre une feuille.
- `navigate(to, { replace: true })` : remplace l'écran du sommet à la place.
- `present(to)` : affiche la destination comme un nouvel écran, toujours
  (empilé sur sa pile, ou en feuille), et se résout avec son
  [résultat](#screen-results).
- `goBack()` : ferme la feuille du sommet, ou dépile la pile courante. Sur le
  premier écran d'une pile, ne fait rien (le retour d'Android quitte alors
  l'application).
- `<Link to replace>` : un pressable qui navigue.

Un écran reste monté, avec son état, tant que des écrans sont empilés
au-dessus de lui, et dans un onglet pendant que vous changez d'onglet. Dépiler
un écran le démonte. Un onglet monte ses écrans lorsqu'il est sélectionné pour
la première fois.

Une destination dont la route manque à la table, ou dont les paramètres ne lui
correspondent pas (un paramètre de chemin manquant, une valeur de la mauvaise
sorte), est une erreur qui nomme la route.

## Résultats d'écran

Un écran peut répondre à l'écran qui l'a affiché. `present` se résout avec le
résultat que l'écran présenté passe à sa prop `dismiss`, qui le ferme aussi ;
il se résout en `undefined` quand l'écran disparaît de toute autre façon :
l'utilisateur le balaie ou revient en arrière, `goBack`, un `navigate` qui le
remplace ou le dépile, ou un Live Patch qui retire sa route.

```tsx
// app/rate.tsx
export type Result = number;

export const options: RouteOptions = { presentation: 'sheet' };

export default function Rate({ dismiss }: ScreenProps<{}, Result>) {
  return <Pressable onPress={() => dismiss(5)}>…</Pressable>;
}

// anywhere
const stars = await present(routes.rate()); // number | undefined
```

Le type `Result` du fichier est celui du résultat : `present(routes.rate())`
est une `Promise<number | undefined>`. Le noyau conserve la promesse en attente
avec l'état de navigation, à travers l'empilement, le dépilement et tout Live
Patch entre les deux.

## Éléments partagés

Une vue dotée d'un `sharedId` vole vers la vue portant le même `sharedId` sur
l'écran vers lequel une pile empile ou dépile : une affiche dans une liste
grandit pour devenir l'image d'en-tête de l'écran de détails, et rétrécit en
retour quand vous revenez en arrière.

```tsx
// app/(shows)/index.tsx
<Link to={routes.show({ id: show.id })}>
  <Image sharedId={`poster-${show.id}`} src={show.poster} width={80} height={120} />
</Link>

// app/(shows)/show/[id].tsx
<Image sharedId={`poster-${id}`} src={poster(id)} width="100%" aspectRatio={2 / 3} />
```

- La pile capture la vue qui part et déplace la capture du cadre de cette vue
  vers celui de la vue qui arrive, en même temps que l'empilement ou le
  dépilement propre à la plateforme, avec sa durée et son easing ; les deux
  vues sont masquées pendant le vol.
- iOS : chaque empilement et dépilement animé, balayage interactif depuis le
  bord compris, qui pilote le vol avec le doigt et le remet en place si le
  balayage est annulé.
- Android : les empilements et dépilements que l'application ou le bouton de
  retour provoquent. Un geste de retour prédictif déplace les pages avec le
  doigt, et le dépilement sur lequel il se termine n'a pas de vol.
- Un `sharedId` est unique au sein d'un écran ; une seconde vue avec le même
  sur cet écran ne vole pas. Les vues qui ne sont que sur l'un des deux écrans
  ne volent pas. Les feuilles n'y participent pas.

## Icônes

L'`icon` d'un onglet est le symbole propre à la plateforme, par son nom, ou
n'importe quelle image :

- Une chaîne : un [SF Symbol](https://developer.apple.com/sf-symbols/) sur
  iOS, un [Material Symbol](https://fonts.google.com/icons) sur Android, comme
  `icon="star"`. Un nom littéral qu'une plateforme n'a pas est une erreur de
  compilation à sa ligne, comme pour [`<Symbol>`](assets.md#symbols).
- `{ ios, android }` : un nom par plateforme, puisque la plupart diffèrent :
  `icon={{ ios: 'house', android: 'home' }}`. Une plateforme omise n'affiche
  aucune icône.
- `{ uri }` : n'importe quelle image, comme `<Image src>` (URI https, file ou
  data), chargée et mise en cache comme une `Image`. Une image qui échoue à se
  charger est une erreur qui nomme son onglet.

```tsx
<Tab name="top" title="Top rated" icon={{ uri: 'https://example.com/star.png' }}>
```

La barre d'onglets ajuste chaque icône dans le carré d'un symbole (25 points
sur iOS, 24 dp sur Android) et la teinte à partir de son alpha : dessinez les
icônes image comme une forme sur fond transparent. Android dessine les Material
Symbols à partir de la police outlined que Kuito embarque, en graisse
regular.

## Routes en JSX

La table du compilateur est le même arbre `<Router>` qu'une application peut
écrire à la main, qui déclare alors elle-même les types de ses routes :

```tsx
import { Link, Route, Router, Tab, Tabs, routes, type RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    show: RouteTo<{ id: number }>;
    settings: RouteTo;
  }
}

export default function App() {
  return (
    <Router linking>
      <Tabs>
        <Tab name="discover" title="Discover" icon={{ ios: 'safari', android: 'explore' }}>
          <Route name="index" path="/" screen={Discover} title="Discover" />
          <Route
            name="show"
            path="/show/:id"
            params={{ id: Number }}
            screen={Show}
            title={({ id }) => `Show ${id}`}
          />
        </Tab>
      </Tabs>
      <Route name="settings" path="/settings" screen={Settings} presentation="sheet" />
    </Router>
  );
}
```

- `<Router initial linking>` : la navigation de l'application. Une application
  en a un ; un second est une erreur. `initial` est la première destination
  affichée (celle de la première route, par défaut) ; `linking` suit les
  [liens profonds](#deep-links).
- `<Route name path params screen title presentation backgroundColor snapPoints header statusBar>` :
  `name` est sa clé dans `routes` ; `path` est ce à quoi le chemin d'un lien
  profond correspond (segments, paramètres `:name` et un `*name` final) ;
  `params` indique comment le texte d'un lien s'analyse en chaque paramètre,
  `String` (par défaut), `Number` ou `Boolean` ; le reste constitue les
  [options](#route-files).
- `<Tabs>` avec des enfants `<Tab name title icon>` : une barre d'onglets
  native. Chaque onglet est sa propre pile des routes qu'il contient,
  conservée pendant que vous changez d'onglet.
- Les routes directement dans `<Router>` (hors feuilles) forment une seule
  pile, sans onglets.

## Liens profonds

Un lien est le seul endroit où une route est une chaîne. `<Router linking>`,
ou `export const linking = true` dans `_layout.tsx`, suit les liens qui
ouvrent l'application ([linking.md](linking.md)) : le lien avec lequel elle a
été lancée une fois le Router monté, et chaque lien qui arrive pendant qu'elle
s'exécute. Un lien devient la destination de la première route dont le chemin
lui correspond, et on y navigue comme `navigate` le ferait, si bien qu'une
route dans un autre onglet sélectionne cet onglet et qu'une route en feuille
ouvre une feuille.

- Le chemin suit le schéma : `kuito://show/42` et `kuito:///show/42` sont
  `/show/42` (après un schéma personnalisé, l'hôte est le premier segment), et
  `https://kuito.dev/show/42` est `/show/42` (l'hôte d'un lien web est le
  site).
- Chaque paramètre de chemin s'analyse depuis son segment selon sa sorte :
  `/show/42` est `routes.show({ id: 42 })` quand `id` est un nombre. Un
  segment qui ne s'analyse pas (`/show/forty`) ne correspond pas.
- Les paramètres que le chemin ne nomme pas proviennent de la requête,
  analysés de la même façon : `/search?q=bear&page=2`. Les clés de requête
  pour lesquelles la route n'a pas de paramètre, et le fragment, sont ignorés.
- Un lien auquel aucune route ne correspond est un avertissement en console qui
  le nomme, et ne change rien.
- Les liens profonds sont désactivés par défaut : un lien peut ouvrir
  n'importe quelle route, donc une application les active quand ses routes
  sont prêtes à servir de points d'entrée.

Les schémas et domaines qui ouvrent l'application lui sont propres, dans
`kuito.config.ts` : `urlSchemes` et `linkDomains`
([linking.md](linking.md#the-apps-url-scheme)).

## Live Patch

Un patch qui modifie des fichiers de routes, ou les onglets et routes du
Router, les applique en place : les piles, les feuilles, l'onglet sélectionné
et l'état de chaque écran monté sont conservés. Un onglet est le même onglet
par son `name`, une route la même route par son nom, sa `presentation` et son
onglet, si bien que les onglets et les routes peuvent être réordonnés, ajoutés,
renommés ou dotés de nouveaux chemins.

- Un écran dont le patch a retiré la route (ou l'a déplacée dans un autre
  onglet) se ferme, avec les écrans au-dessus de lui dans sa pile, et un
  `present` qui l'attendait se résout en `undefined`. Une feuille de même.
- Un nouvel onglet, ou une pile laissée sans écran, démarre sur sa première
  route.
- L'onglet sélectionné suit son `name` ; si le patch l'a retiré, le premier
  onglet est sélectionné.

## Contrat natif

Les deux moteurs de rendu implémentent quatre sortes, détenues par
`properties/KuitoNavigationProperties` et leurs vues dans `views/` :

- `NavigationStack` : une pile native. Ses enfants sont des vues
  `NavigationScreen`, de bas en haut. Un enfant ajouté au sommet est empilé,
  avec animation sauf s'il est le premier ; retirer l'enfant du sommet le
  dépile, avec animation ; tout autre changement d'ordre définit la pile sans
  animation. Le sous-arbre de chaque écran est mis en page comme une racine à
  part entière, dans le cadre que la pile native lui donne (sous l'en-tête).
- `NavigationScreen` : props `title` (chaîne) et `header` (booléen, `true` par
  défaut). Il émet `dismiss` quand la plateforme l'a retiré : le balayage
  depuis le bord ou le bouton de retour sur iOS, le geste de retour, le bouton
  de retour ou la flèche d'en-tête sur Android. Il ne l'émet pas pour un
  retrait demandé par le noyau. Après `dismiss`, le noyau retire la vue ; le
  moteur de rendu traite le retrait d'un écran déjà dépilé comme accompli.
- `NavigationTabs` : une barre d'onglets native. Ses enfants sont des vues
  `NavigationTab`, dans l'ordre. Prop `selectedIndex` (nombre). Il émet
  `select` avec `{ index }` quand l'utilisateur choisit un onglet ; la
  sélection change quand le noyau définit `selectedIndex`.
- `NavigationTab` : props `title` (chaîne) et `icon` : un nom de symbole (SF
  Symbol sur iOS, Material Symbol sur Android), ou en JSON `{ ios, android }`,
  chaque moteur de rendu prenant sa propre clé, ou `{ uri }`, chargé par le
  chargeur d'images de la plateforme. Il émet `error` avec `{ error }` quand
  une icône image échoue à se charger. Son unique enfant est le
  `NavigationStack` de l'onglet.

Sur Android, la pile visible la plus haute comptant plus d'un écran gère le
retour (retour prédictif sur l'API 34, en suivant la progression du geste) ;
sinon le retour revient au système.

## Crédits

Android dessine les icônes d'onglets avec la police outlined
[Material Symbols](https://github.com/google/material-design-icons), instanciée
en graisse regular
(`native/android/app/src/main/res/font/material_symbols.ttf`) : Apache License
2.0, Copyright Google LLC (`native/android/app/src/main/LICENSE-material-symbols`).
