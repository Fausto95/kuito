# Écran de démarrage

L'écran de démarrage est l'écran de lancement que le système affiche pendant que l'app démarre : un logo sur une couleur, et une marque facultative en bas. Kuito le génère pour les deux plateformes à partir de `kuito.config.ts`, et il reste affiché jusqu'à ce que le premier écran de l'app soit à l'écran.

## Configuration

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  splash: {
    logo: './assets/splash.png',
    logoWidth: 120,
    background: '#7B5BEA',
    brand: './assets/brand.png',
    dark: { background: '#21164A' },
  },
} satisfies KuitoConfig;
```

- `logo` : un PNG, dessiné sur `logoWidth` de large au milieu de l'écran. Obligatoire.
- `logoWidth` : en points (iOS) et en dp (Android), de 1 à 288. `100` par défaut.
- `background` : une couleur comme `#1E88E5`. `#FFFFFF` par défaut.
- `brand` : un PNG ajusté dans une boîte de 200x80, centré à 60 du bas. Facultatif.
- `dark` : `logo`, `background` et `brand` en mode sombre ; chacun se rabat sur sa version claire.
- `variants.<name>` : un autre aspect, l'écran de démarrage avec ces clés remplacées.

Chaque clé est surchargeable par [environnement](../../../../docs/apps.md#environments). Les chemins sont relatifs à `kuito.config.ts`. Chaque PNG doit faire 4x sa taille en points : un logo de 120 points a besoin de 480 pixels de large. Android 12 et ultérieur affichent l'icône de démarrage à travers un cercle de 192 dp : dessinez le logo avec de la place autour.

## Jusqu'à ce que l'app soit prête

L'écran de démarrage natif reste affiché pendant que l'app rend son premier écran, et disparaît dans l'image qui montre cet écran, sans code dans l'app. Pour le garder affiché plus longtemps :

```tsx
import { splash } from 'kuito';

splash.hold(); // before the first render: keep it up

async function start() {
  await loadSession();
  screen.value = 'home';
  await splash.hide({ fade: true }); // after the home screen is drawn
}
```

- `splash.hold()` garde l'écran de démarrage affiché après le premier écran, jusqu'à `hide`. Appelez-le avant le premier rendu.
- `splash.hide({ fade })` le masque une fois que les vues rendues jusque-là par l'app sont à l'écran ; `fade` prend 250 ms.
- `splash.visible` est un signal : si l'écran de démarrage natif est affiché.
- `splash.layout()` donne les cadres du logo et de la marque dans la fenêtre ; null sans écran de démarrage.

`hide` après avoir défini l'état de l'écran suivant montre cet écran, jamais le précédent.

## Animé : SplashScreen

`SplashScreen` redessine l'écran de lancement avec des vues Kuito, à partir des mêmes images et couleurs. L'écran de démarrage natif lui passe le relais sans changement visible, et c'est ensuite une vue ordinaire que l'app anime avec des props et des [valeurs de mouvement](../../../../docs/motion.md), et retire.

```tsx
import { motion, signal, timing, Show, SplashScreen } from 'kuito';

const splash = signal(true);
const scale = motion(1);
const opacity = motion(1);

<Show when={splash.value}>
  <SplashScreen
    opacity={opacity}
    logo={{ scale }}
    onReady={() => {
      scale.value = timing(450).to(6);
      opacity.value = timing({ duration: 450, onEnd: () => (splash.value = false) }).to(0);
    }}
  />
</Show>;
```

- Rendez-le à la racine, par-dessus l'app, dans le premier écran : l'écran de démarrage natif se masque après la première image comme d'habitude, ce qui révèle le `SplashScreen` dessiné dessous, pixel pour pixel.
- Ses propres props (`opacity`, `scale`, `translateY`, toute prop de vue) s'appliquent à tout l'écran de démarrage ; `logo` et `brand` acceptent les mêmes props pour ces parties.
- `onReady` s'exécute une fois l'écran de démarrage natif disparu et cette vue affichée : démarrez l'animation là.

Le mode sombre suit le système sur les deux plateformes, dans la phase native et dans `SplashScreen`.

## Variantes

`splash.variants` déclare d'autres aspects, et `splash.variant` est un signal modifiable qui démarre à la variante que ce lancement a affichée, null pour celle par défaut. Sur Android 13 et ultérieur, `splash.variant.value = 'holiday'` choisit le thème avec lequel le système dessine son prochain écran de démarrage, et `null` revient à celui par défaut. Sur Android 8 à 12 et iOS, une écriture est rejetée avec `ERR_UNSUPPORTED`, et le signal revient en arrière.

## En profondeur

[Écran de démarrage](../../../../docs/splash.md) couvre les enfants dynamiques de `SplashScreen`, comment chaque plateforme retient et transmet l'écran de démarrage, et ce que la CLI génère dans `.kuito/`.
