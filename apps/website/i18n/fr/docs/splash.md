# Écran de démarrage

L'écran de démarrage est l'écran de lancement que le système affiche pendant que
l'application démarre : un logo sur une couleur, et une marque facultative en bas.
Kuito le génère pour les deux plateformes à partir de `kuito.config.ts`, si bien
qu'il a le même aspect sur iOS et sur chaque version d'Android de 8 à 16. Il reste
affiché jusqu'à ce que le premier écran de l'application soit à l'écran, puis
passe le relais à une vue Kuito que l'application peut animer et remplir de
contenu dynamique.

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  // name, ios, android...
  splash: {
    logo: './assets/splash.png',
    logoWidth: 120,
    background: '#7B5BEA',
    brand: './assets/brand.png',
    dark: { background: '#21164A' },
    variants: { holiday: { logo: './assets/splash-holiday.png', background: '#C62828' } },
  },
  environments: {
    staging: { splash: { background: '#FF8115' } },
  },
} satisfies KuitoConfig;
```

| Clé               | Effet                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `logo`            | Un PNG, dessiné sur `logoWidth` de large au milieu de l'écran. Obligatoire.                   |
| `logoWidth`       | En points (iOS) et en dp (Android), de 1 à 288. `100`.                                        |
| `background`      | Une couleur comme `#1E88E5`. `#FFFFFF`.                                                       |
| `brand`           | Un PNG ajusté dans une boîte de 200×80, centré à 60 du bas de l'écran. Facultatif.            |
| `dark`            | `logo`, `background` et `brand` en mode sombre ; chacun se rabat sur sa version claire.       |
| `variants.<name>` | Un autre aspect, l'écran de démarrage avec ces clés remplacées : voir [Variantes](#variants). |

Chaque clé est surchargeable par [environnement](apps.md#environments), une par
une : `staging: { splash: { background } }` garde le logo. Les variantes héritent
aussi de l'écran de démarrage de l'environnement. Les chemins sont relatifs à
`kuito.config.ts`.

Le logo est dessiné à ses propres proportions : 120 de large pour un PNG en 2:1
donne 120×60. Chaque PNG doit être assez grand pour les écrans les plus denses,
4× sa taille en points : un logo de 120 points a besoin de 480 pixels de large,
une marque de 800×320 pour une boîte pleine. Un plus petit est une erreur qui
nomme sa clé. Dessinez le logo avec de l'espace autour :

- **Android 12 et ultérieur** affichent l'icône de démarrage à travers un cercle
  de 192 dp. Un logo dont la diagonale dépasse 192 voit ses coins coupés à cette
  limite, donc la compilation avertit avec la `logoWidth` la plus large qui tient.
- La boîte de marque fait 200×80 parce que c'est la taille que le SplashScreen
  d'Android 12 donne à une image de marque ; les autres plateformes utilisent la
  même boîte pour que la marque soit au même endroit partout.

## Jusqu'à ce que l'application soit prête

L'écran de démarrage natif reste affiché pendant que Hermes démarre et que
l'application rend son premier écran, et disparaît dans l'image qui affiche cet
écran : aucune image blanche ou vide entre les deux, sans code dans l'application.

```tsx
import { splash } from 'kuito';

splash.hold(); // before the first render: keep it up

async function start() {
  await loadSession();
  screen.value = 'home';
  await splash.hide({ fade: true }); // after the home screen is drawn
}
```

| API                     | Effet                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `splash.hold()`         | Garde l'écran de démarrage affiché après le premier écran, jusqu'à `hide`. Appelez-le avant le premier rendu.                           |
| `splash.hide({ fade })` | Le masque une fois que les vues rendues jusque-là par l'application sont à l'écran ; `fade` prend 250 ms. Se résout quand il a disparu. |
| `splash.visible`        | Un signal : si l'écran de démarrage natif est affiché. Observé, il passe à `false` une fois l'écran de démarrage disparu.               |
| `splash.layout()`       | Les cadres du logo et de la marque dans la fenêtre (points, dp) ; null sans écran de démarrage.                                         |
| `splash.variant`        | Un signal modifiable : [variantes](#variants).                                                                                          |

Comment les plateformes le gardent affiché et passent le relais :

- **iOS** affiche le storyboard de lancement jusqu'à ce que la fenêtre de
  l'application dessine. Le shell instancie le même storyboard par-dessus sa vue
  racine avant ce premier dessin, si bien que l'instantané du système et la vue du
  shell sont les mêmes pixels, et le retire dans la même transaction Core
  Animation que le lot qui dessine le premier écran de l'application.
- **Android** garde l'écran de démarrage du système (la fenêtre de démarrage
  avant Android 12, la vue de l'API SplashScreen après) en retenant le premier
  dessin de la fenêtre jusqu'à ce que la première image de l'application soit
  appliquée : la condition keep-on-screen, sous forme d'`OnPreDrawListener`. Le
  shell dessine la même layer list par-dessus sa racine, si bien que quand la
  fenêtre dessine, l'écran de démarrage du système cède la place à des pixels
  identiques. Sur Android 12 et ultérieur, le shell prend la vue d'écran de
  démarrage du système et laisse son animation d'icône se terminer avant de la
  retirer.
- `hide` attend les lots que l'application a envoyés avant lui : un appel de
  module natif fait pendant une tâche JS démarre après que les changements de vues
  de cette tâche ont atteint le thread principal
  ([modules natifs](native-modules.md#how-it-works)), et l'écran de démarrage
  disparaît dans l'image qui les applique. `hide` après avoir défini l'état de
  l'écran suivant affiche cet écran, jamais le précédent.
- L'écran de chargement de développement du shell ne s'affiche jamais sous l'écran
  de démarrage. Si l'application ne parvient pas à démarrer (une erreur fatale),
  l'écran de démarrage disparaît pour que l'erreur s'affiche.

## Animé : SplashScreen

`SplashScreen` redessine l'écran de lancement avec des vues Kuito, aux cadres que
`splash.layout()` rapporte, à partir des mêmes images et couleurs. L'écran de
démarrage natif lui passe le relais sans changement visible, et c'est ensuite une
vue ordinaire : l'application l'anime avec des props et des
[valeurs de mouvement](motion.md), sur le thread UI, et la retire.

```tsx
import { Box, motion, signal, timing, Show, SplashScreen } from 'kuito';

export default function App() {
  const splash = signal(true);
  const scale = motion(1);
  const opacity = motion(1);

  return (
    <Box flex={1}>
      <Home />
      <Show when={splash.value}>
        <SplashScreen
          opacity={opacity}
          logo={{ scale }}
          onReady={() => {
            scale.value = timing(450).to(6);
            opacity.value = timing({ duration: 450, onEnd: () => (splash.value = false) }).to(0);
          }}
        />
      </Show>
    </Box>
  );
}
```

- Rendez-le à la racine, par-dessus l'application, dans le premier écran : ses
  cadres sont ceux de la fenêtre. L'écran de démarrage natif se masque après la
  première image comme d'habitude, ce qui révèle le `SplashScreen` dessiné
  dessous, pixel pour pixel.
- Ses propres props (`opacity`, `scale`, `translateY`, n'importe quelle prop de
  vue) s'appliquent à tout l'écran de démarrage ; `logo` et `brand` prennent les
  mêmes props pour ces parties. Chacune est une valeur, une animation ou une
  valeur de mouvement ([Motion](motion.md)).
- `onReady` s'exécute une fois l'écran de démarrage natif disparu et cette vue
  affichée : démarrez-y l'animation. Il s'exécute au montage quand il n'y a rien à
  attendre (après un rechargement, ou sans écran de démarrage dans la config, où
  il ne dessine rien).
- Aucun thread n'est nommé : le compilateur et le noyau exécutent l'animation sur
  le thread UI ([valeurs de mouvement](motion.md#you-never-pick-a-thread)).

Les parties sont des vues `SplashPart`, une vue native du module `Splash`
([vues natives](native-modules.md#views)) qui dessine les images du catalogue
d'assets et la couleur nommée propres à l'écran de lancement sur iOS, et ses
ressources sur Android, si bien qu'elles suivent le mode sombre comme le fait
l'écran de lancement.

## Dynamique

Après la phase native, l'écran de démarrage est une vue ordinaire, il peut donc
afficher n'importe quoi dans la même mise en page : les enfants de `SplashScreen`
se dessinent par-dessus l'écran de lancement.

```tsx
const { logo } = splash.layout() ?? { logo: { y: 0, height: 0 } };

<SplashScreen onReady={load}>
  <Text position="absolute" top={logo.y + logo.height + 32} left={0} right={0} textAlign="center">
    {`Loading ${progress.value}%`}
  </Text>
</SplashScreen>;
```

Une progression, un message de chargement, une image distante ou saisonnière :
tout ce que l'application rend. Gardez le travail de l'application pour après le
premier écran (comme le fait `load`), puisque la phase native est statique
jusque-là.

Le mode sombre suit le système sur les deux plateformes, dans la phase native et
dans `SplashScreen` : les couleurs et les images ont des variantes sombres quand
`splash.dark` les définit.

### Variantes

`splash.variants` déclare d'autres aspects. Ce que chaque plateforme peut en faire
est fixé par le système, pas par Kuito :

| Plateforme              | Prochain lancement                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android 13 et ultérieur | `splash.variant.value = 'holiday'` choisit le thème avec lequel le système dessine son écran de démarrage, via `SplashScreen.setSplashScreenTheme`, et le shell dessine le même aspect. `null` revient à la valeur par défaut.      |
| Android 8 à 12          | Le système dessine le thème que le manifeste nomme, toujours celui par défaut : une écriture est rejetée avec `ERR_UNSUPPORTED`, signalée via le canal d'erreur, et le signal revient à sa valeur précédente.                       |
| iOS                     | Un seul écran de lancement, nommé dans Info.plist à la compilation et mis en cache par le système sous forme d'instantané. Aucune API ne le change, donc une écriture est rejetée avec `ERR_UNSUPPORTED`, comme sur Android 8 à 12. |

`splash.variant` commence à la variante que ce lancement a affichée, null pour
celle par défaut. Sur chaque plateforme, l'application peut toujours afficher
n'importe quoi après le passage de relais : un `SplashScreen` avec des enfants
saisonniers, ou sa propre vue dans la même mise en page.

## Ce que la CLI génère

À chaque compilation, la CLI transforme la config en écran de lancement de chaque
plateforme dans `.kuito/` (`src/cli/splash-screens.ts`), et le saute quand ni la
config ni une image n'a changé depuis la dernière compilation. Les images sont
rééchantillonnées par le même codec PNG que les [icônes d'application](apps.md#app-icons).

- **iOS** : `.kuito/ios/Splash/`, un storyboard de lancement (`Splash.storyboard`,
  que le `UILaunchStoryboardName` d'Info.plist nomme) et son catalogue d'assets :
  le logo et la marque en 2x et 3x avec leurs apparences sombres, et le fond comme
  couleur nommée avec son apparence sombre. Sans écran de démarrage, l'application
  reçoit un `UILaunchScreen` vide.
- **Android** : `.kuito/android/splash/`, un thème dans lequel l'activité
  démarre, `Theme.Kuito.Splash`, dérivé de l'`AppTheme` de l'application ([réglages natifs](apps.md#native-settings)) :
  - **Android 8 à 11** (API 26–30) : la fenêtre de démarrage dessine le fond de
    fenêtre du thème, une layer list de la couleur, du logo centré à `logoWidth`
    et de la marque.
  - **Android 12 et ultérieur** : l'API SplashScreen dessine le
    `windowSplashScreenBackground` du thème, le logo comme
    `windowSplashScreenAnimatedIcon` de 288 dp avec le logo à sa propre taille au
    milieu, et la marque comme `windowSplashScreenBrandingImage`. Le logo tombe
    sur les mêmes pixels qu'avant Android 12.
  - Le mode sombre est fait de ressources `values-night` et `drawable-night`, et
    chaque image est générée de mdpi à xxxhdpi. `raw/kuito_splash.json` indique
    au shell la mise en page de chaque aspect.

iOS met l'écran de lancement en cache : après avoir changé l'écran de démarrage,
supprimez l'application (ou redémarrez le simulateur) pour voir le nouveau.
Android le lit à chaque lancement.

## Crédits

L'approche, une config qui génère l'écran de lancement de chaque plateforme et une
vue qui prend le relais, vient de
[react-native-bootsplash](https://github.com/zoontek/react-native-bootsplash)
(MIT, Mathieu Acthernoene).
