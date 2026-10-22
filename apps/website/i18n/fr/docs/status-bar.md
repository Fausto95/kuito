# StatusBar

Le style, la visibilité et, sur Android, la couleur de la barre d'état.
Rendez-la comme un composant, pour la durée de son montage, ou donnez à chaque
route la sienne.

```tsx
import { Route, Router, StatusBar } from 'kuito';

function Player() {
  return (
    <>
      <StatusBar content="light" hidden animated transition="slide" />
      <Video />
    </>
  );
}

<Router>
  <Route path="/" screen={Home} />
  <Route path="/photo/:id" screen={Photo} statusBar={{ content: 'light', hidden: true }} />
</Router>;
```

## Props

| Prop              | Valeurs                                      | Plateformes               |
| ----------------- | -------------------------------------------- | ------------------------- |
| `content`         | `auto`, `light`, `dark`                      | les deux                  |
| `hidden`          | booléen                                      | les deux                  |
| `animated`        | anime `content`, `hidden`, `backgroundColor` | les deux                  |
| `transition`      | `fade` (par défaut), `slide`, `none`         | iOS ; Android a la sienne |
| `backgroundColor` | une couleur hexadécimale, ou `transparent`   | Android ; ignorée sur iOS |
| `translucent`     | true (par défaut) ou false                   | Android ; ignorée sur iOS |

`auto` est le style avec lequel l'app a été lancée : `statusBar.style` dans
kuito.config.ts, `auto` sauf réglage contraire, soit du texte sombre en mode
clair et du texte clair en mode sombre, sur les deux plateformes. Les couleurs
sont des hexadécimaux CSS (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) ou
`transparent` ; toute autre valeur est une `TypeError` avant d'atteindre la
plateforme.

## La pile

Chaque `<StatusBar>` monté est une entrée d'une seule pile. La dernière entrée
qui définit une prop remporte cette prop, et démonter une entrée rend ses props
à celles d'en dessous, avec l'`animated` de l'entrée qui les avait définies. Un
`<StatusBar>` dont les props changent garde sa place. Les changements faits
ensemble, comme le montage des StatusBars d'un écran, passent à la plateforme
en une fois, et seulement ce qui diffère de ce que la plateforme affiche.

Il n'y a pas de setters impératifs : ils contourneraient la pile, et la portée
du composant dit déjà combien de temps un style dure. `StatusBar.height` est la
hauteur de la barre d'état en dp sur Android, lue de façon synchrone ; null sur
iOS.

La pile survit à un Live Patch : les StatusBars montés gardent leurs entrées
quand le bundle de l'app s'exécute à nouveau.

## Par écran

Le `statusBar` d'une `<Route>` prend les props d'un `<StatusBar>` et les
applique tant que son écran a le focus : la sheet du dessus, ou le sommet de la
pile de l'onglet sélectionné ([navigation](navigation.md)). Le Router déplace
cette entrée au sommet de la pile avant que l'écran focalisé ne soit rendu,
elle l'emporte donc sur les StatusBars montés avant que l'écran ne s'affiche,
et les éléments `<StatusBar>` propres à l'écran l'emportent encore sur elle.
Revenir en arrière restaure l'écran d'en dessous.

Un `<StatusBar>` rendu dans un écran compte tant que l'écran est monté, comme
dans React Native : les écrans en dessous dans une pile et les autres onglets
restent montés, et leurs StatusBars restent dans la pile, sous les plus
récents. Pour un style par onglet, utilisez l'option `statusBar` des routes.

## Comment c'est câblé

`StatusBar` et [`SystemBars`](system-ui.md) partagent le module natif `SystemUI`.
Sur iOS, l'état vit dans `KuitoSystemBars`, que le root view controller du
shell lit pour `preferredStatusBarStyle`, `prefersStatusBarHidden` et
`preferredStatusBarUpdateAnimation` (apparence de la barre d'état gérée par le
view controller) ; le shell l'initialise avec le style de lancement de
kuito.config.ts. La pile part du `hidden` de lancement, lu de façon synchrone,
rendre `hidden` restaure donc la barre d'état configurée. `SystemUI` est
`always` dans les shells parce que le root view controller lit son état. Sur
Android, `WindowInsetsControllerCompat` définit les icônes et la visibilité.
Android 15 dessine chaque app bord à bord et ignore `Window.statusBarColor`,
`backgroundColor` est donc une vue dans la decor view, aussi haute que l'inset
de la barre d'état, identique sur chaque version ; `translucent: false` décale
plutôt le contenu sous la barre d'état, une `SafeArea` à cet endroit ne reçoit
donc pas d'inset supérieur. Un rechargement rend la barre d'état du shell.

Le `networkActivityIndicatorVisible` de React Native n'y est pas : iOS 13 a
retiré l'indicateur.
