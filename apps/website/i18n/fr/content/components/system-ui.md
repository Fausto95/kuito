# SystemBars

`SystemBars` déclare le chrome système autour de l'app tant qu'il est monté : la barre d'état, la couleur de la vue racine, la barre de navigation d'Android, le mode immersif et l'indicateur d'accueil d'iOS. Rendez-le là où un écran a besoin de ses propres barres, ou donnez `systemBars` à une route.

Utilisez-le pour :

- un contenu de barre d'état clair sur un écran sombre ;
- une photo ou une vidéo en plein écran, barres masquées ;
- une barre de navigation Android aux couleurs de l'app.

```tsx
import { SystemBars, Text, VStack } from 'kuito';

export default function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#101014"
        navigationBarButtonStyle="light"
      />
      <VStack flex={1} backgroundColor="#101014">
        <Text color="#ffffff">Photos</Text>
      </VStack>
    </>
  );
}
```

Chaque SystemBars monté est une entrée d'une seule pile : le dernier qui fixe une prop la gagne, chacune des props de `statusBar` séparément, et une prop omise ne fixe rien. Le démonter rend ses props aux entrées d'en dessous, jusqu'à celles du shell. Les couleurs sont en hexa CSS (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) ou `transparent`. Toute autre valeur est un `TypeError` au rendu.

## Cas d'usage

### Fixer les barres par écran

Le `systemBars` d'une `Route` prend les props d'un SystemBars et les applique tant que son écran a le focus. Revenir en arrière restaure l'écran d'en dessous.

```tsx
import { Route, Router, Text } from 'kuito';

function Home() {
  return <Text padding={16}>Home</Text>;
}

function Photo() {
  return <Text padding={16}>Photo</Text>;
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} />
      <Route
        name="photo"
        path="/photo"
        screen={Photo}
        systemBars={{ statusBar: { content: 'light', hidden: true } }}
      />
    </Router>
  );
}
```

Les écrans du dessous dans une pile et les autres onglets restent montés, donc un SystemBars rendu à l'intérieur reste lui aussi dans la pile. Pour des barres par onglet, utilisez le `systemBars` des routes.

### Passer en plein écran

`immersive` masque la barre d'état et la barre de navigation, laisse l'indicateur d'accueil d'iOS s'estomper, et sur iOS laisse le premier balayage depuis un bord atteindre l'app. Une entrée montée après lui l'emporte sur ce qu'il masque.

```tsx
import { Button, Show, SystemBars, VStack, Video, signal } from 'kuito';

export default function Player() {
  const fullScreen = signal(false);

  return (
    <VStack flex={1}>
      <Show when={fullScreen.value}>
        <SystemBars immersive />
      </Show>
      <Video src={{ uri: 'https://example.com/film.m3u8' }} flex={1} />
      <Button onPress={() => (fullScreen.value = !fullScreen.value)}>Full screen</Button>
    </VStack>
  );
}
```

### Animer la barre d'état

`animated` anime les changements de `content`, de `hidden` et du `backgroundColor` d'Android. `transition` choisit comment iOS l'affiche et la masque.

```tsx
import { Button, SystemBars, VStack, signal } from 'kuito';

export default function Reader() {
  const reading = signal(false);

  return (
    <VStack flex={1}>
      <SystemBars statusBar={{ hidden: reading.value, animated: true, transition: 'slide' }} />
      <Button onPress={() => (reading.value = !reading.value)}>Focus</Button>
    </VStack>
  );
}
```

### Disposer sous la barre d'état sur Android

`SystemBars.statusBarHeight` est la hauteur de la barre d'état en dp sur Android, lue de façon synchrone, et null sur iOS.

```tsx
import { Box, SystemBars } from 'kuito';

export default function Header() {
  return <Box height={56 + (SystemBars.statusBarHeight ?? 0)} backgroundColor="#5b5bd6" />;
}
```

## Différences entre plateformes

Une prop qui nomme un chrome qu'une plateforme n'a pas n'y fait rien, donc le code de l'app n'a besoin d'aucun test de plateforme.

| Prop                                                                    | iOS                                                                                                           | Android                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `statusBar.content`, `statusBar.hidden`                                 | Oui                                                                                                           | Oui                                              |
| `statusBar.transition`                                                  | `fade` (par défaut), `slide`, `none`                                                                          | La sienne                                        |
| `statusBar.backgroundColor`, `statusBar.translucent`                    | Aucun effet                                                                                                   | Oui                                              |
| `navigationBarColor`, `navigationBarButtonStyle`, `navigationBarHidden` | Aucun effet                                                                                                   | Oui                                              |
| `homeIndicatorAutoHidden`                                               | Oui                                                                                                           | Aucun effet                                      |
| `immersive`                                                             | Masque la barre d'état, masque automatiquement l'indicateur d'accueil, diffère les balayages depuis les bords | Masque la barre d'état et la barre de navigation |

`statusBar.content: 'auto'` est le style avec lequel l'app a démarré : `statusBar.style` dans `kuito.config.ts`, qui donne un texte sombre en mode clair et un texte clair en mode sombre s'il n'est pas fixé.

## Voir aussi

- [SafeArea](./safe-area.md)
- [Router](./router.md)
- [Apparence](../../../../docs/appearance.md)
- [SystemBars en profondeur](../../../../docs/system-ui.md)
