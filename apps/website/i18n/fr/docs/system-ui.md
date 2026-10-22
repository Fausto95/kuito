# SystemBars

Le chrome système autour de l'application, déclaré sous forme de composant : la barre
d'état, la couleur de la vue racine, la barre de navigation d'Android, le mode immersif et
l'indicateur d'accueil d'iOS. Rendez-le aussi longtemps qu'il doit tenir, ou donnez à chaque
route le sien.

```tsx
import { Route, Router, SystemBars } from 'kuito';

function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#4b2a8a"
        navigationBarButtonStyle="light"
      />
      <Photos />
    </>
  );
}

<Router>
  <Route path="/" screen={Home} />
  <Route
    path="/photo/:id"
    screen={Photo}
    systemBars={{ statusBar: { content: 'light', hidden: true } }}
  />
</Router>;
```

| Prop                       | iOS                                                                                                           | Android                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `statusBar`                | la barre d'état, [ci-dessous](#the-status-bar)                                                                | la barre d'état, [ci-dessous](#the-status-bar)                      |
| `backgroundColor`          | la vue du contrôleur de vue racine                                                                            | la vue de décor de la fenêtre                                       |
| `navigationBarColor`       | pas de barre de navigation : aucun effet                                                                      | une vue derrière la barre de navigation, aussi haute que son inset  |
| `navigationBarButtonStyle` | aucun effet                                                                                                   | boutons `light` pour une barre sombre, `dark` pour une barre claire |
| `navigationBarHidden`      | aucun effet                                                                                                   | masque la barre ; un balayage depuis le bord la montre un instant   |
| `immersive`                | masque la barre d'état, masque automatiquement l'indicateur d'accueil, diffère les balayages depuis les bords | masque les barres d'état et de navigation                           |
| `homeIndicatorAutoHidden`  | l'indicateur d'accueil s'estompe tant que l'écran n'est pas touché                                            | pas d'indicateur d'accueil : aucun effet                            |

Une prop nommant un chrome qu'une plateforme n'a pas n'y fait rien, si bien que le code de
l'application n'a besoin d'aucune vérification de plateforme. Les couleurs sont des
hexadécimaux CSS (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) ou `transparent` ; toute autre
valeur est une `TypeError` quand le composant est rendu.

## La barre d'état

`statusBar` prend les props propres à la barre d'état :

| Prop              | Valeurs                                      | Plateformes               |
| ----------------- | -------------------------------------------- | ------------------------- |
| `content`         | `auto`, `light`, `dark`                      | les deux                  |
| `hidden`          | booléen                                      | les deux                  |
| `animated`        | anime `content`, `hidden`, `backgroundColor` | les deux                  |
| `transition`      | `fade` (par défaut), `slide`, `none`         | iOS ; Android a la sienne |
| `backgroundColor` | une couleur hexadécimale, ou `transparent`   | Android ; ignoré sur iOS  |
| `translucent`     | true (par défaut) ou false                   | Android ; ignoré sur iOS  |

`auto` est le style avec lequel l'application a démarré : `statusBar.style` dans
kuito.config.ts, `auto` s'il n'est pas défini, soit un texte sombre en mode clair et un texte
clair en mode sombre, sur les deux plateformes. `SystemBars.statusBarHeight` est la hauteur
de la barre d'état en dp sur Android, lue de façon synchrone ; null sur iOS.

## La pile

Chaque `<SystemBars>` monté est une entrée d'une seule pile. La dernière entrée qui définit
une prop l'emporte pour cette prop, chacune des props de `statusBar` séparément, et une prop
omise ou `undefined` ne définit rien. Démonter une entrée rend ses props aux entrées en
dessous, avec l'`animated` de l'entrée qui les a définies, jusqu'à celles du shell : sa
couleur racine et la barre d'état du lancement, une barre de navigation transparente avec les
boutons du thème, rien de masqué. Un `<SystemBars>` dont les props changent garde sa place.
Les changements faits ensemble, comme le montage des SystemBars d'un écran, passent une seule
fois à la plateforme, et seulement ce qui diffère de ce qu'elle affiche.

`immersive` est ce qu'il masque : la barre d'état, la barre de navigation et l'indicateur
d'accueil, comme si l'entrée définissait `statusBar.hidden` (animé), `navigationBarHidden` et
`homeIndicatorAutoHidden`. Les props propres à l'entrée l'emportent sur celles-là, tout comme
toute entrée montée après elle : un `<SystemBars statusBar={{ hidden: false }} />` monté après
une entrée immersive montre la barre d'état. Sur iOS il diffère aussi les balayages depuis les
bords, si bien que le premier balayage atteint l'application. `immersive={false}` ne définit
rien, comme une prop omise.

Il n'y a pas de setters impératifs : ils contourneraient la pile, et la portée du composant
dit déjà combien de temps un style dure. La pile survit à un Live Patch : les SystemBars
montés gardent leurs entrées quand le bundle de l'application s'exécute à nouveau. Un
rechargement rend chaque barre au shell.

## Par écran

Le `systemBars` d'une `<Route>` prend les props d'un `<SystemBars>` et les applique tant que
son écran a le focus : la feuille du dessus, ou le haut de la pile de l'onglet sélectionné
([navigation](navigation.md)). Le Router place cette entrée en haut de la pile avant que
l'écran qui a le focus ne soit rendu : elle l'emporte donc sur les SystemBars montés avant que
l'écran ne s'affiche, et les éléments `<SystemBars>` propres à l'écran l'emportent encore sur
elle. Revenir en arrière restaure l'écran du dessous.

Un `<SystemBars>` rendu dans un écran compte tant que l'écran est monté : les écrans plus bas
dans une pile et les autres onglets restent montés, et leurs SystemBars restent dans la pile,
sous les plus récents. Pour des barres par onglet, utilisez l'option `systemBars` des routes.

La vue racine apparaît là où les vues de l'application ne la couvrent pas : derrière un écran
qui ne remplit pas la fenêtre, ou pendant une transition. Les écrans d'une pile de navigation
sont opaques.

## Comment c'est câblé

`SystemBars` pilote le module natif `SystemUI`. Sur iOS, l'état vit dans `KuitoSystemBars`,
que le contrôleur de vue racine du shell lit pour `preferredStatusBarStyle`,
`prefersStatusBarHidden`, `preferredStatusBarUpdateAnimation`,
`prefersHomeIndicatorAutoHidden` et `preferredScreenEdgesDeferringSystemGestures` (apparence
de la barre d'état gérée par le contrôleur de vue) ; le shell l'initialise avec le style de
lancement de kuito.config.ts. La pile part du `hidden` du lancement, lu de façon synchrone, si
bien que rendre `hidden` restaure la barre d'état configurée. Cet état appartient au shell
(`KuitoSystemBars`, dans `native/ios/App/Shell`), que lit le contrôleur de vue racine : un
shell sans `SystemUI` garde donc les barres configurées.

Sur Android, `WindowInsetsControllerCompat` fixe les icônes et la visibilité, et un balayage
depuis le bord montre un instant les barres masquées. Android 15 dessine toutes les
applications bord à bord et ignore `Window.statusBarColor` et `Window.navigationBarColor` :
la couleur de chaque barre est donc une vue dans la vue de décor, dimensionnée à l'inset de
cette barre, la même sur toutes les versions. `statusBar.translucent: false` décale plutôt le
contenu sous la barre d'état, si bien qu'un `SafeArea` à cet endroit n'a pas d'inset en haut.
Avec la navigation à trois boutons, le système dessine un voile qui lui est propre ; une
couleur de barre de navigation autre que transparent le désactive.

iOS 13 a retiré l'indicateur d'activité réseau, il n'y a donc pas de prop pour lui.
