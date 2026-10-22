# appearance

Le mode clair ou sombre et la taille de texte de l'utilisateur, sous forme de signaux.

```tsx
import { Text, watch, appearance } from 'kuito';

appearance.colorScheme.value; // 'light' | 'dark' | null
appearance.fontScale.value; // 1 by default

// In a component, a read in JSX or a watch follows the platform.
<Text>{appearance.colorScheme.value === 'dark' ? 'Night' : 'Day'}</Text>;
watch(appearance.fontScale, (scale) => console.log(scale));
```

Les deux sont lus de manière synchrone, et la plateforme n'est observée que tant que
quelque chose suit l'un d'eux. `colorScheme` est le
`prefers-color-scheme` de CSS : `null` quand la plateforme n'a aucune préférence. L'échelle de
police se trouve ici, avec l'autre préférence d'affichage.

| Échelle de police | iOS                                                                                                                                               | Android                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Source            | La taille Dynamic Type, mappée sur les multiplicateurs de React Native (`large` 1, `extraLarge` 1.118, `accessibilityExtraExtraExtraLarge` 3.571) | `Configuration.fontScale` |
| Changement        | Met à jour le signal                                                                                                                              | Met à jour le signal      |

Le mode sombre met à jour `colorScheme` sur les deux. Sur Android, le manifeste gère `uiMode`
et `fontScale` (avec la rotation et les redimensionnements de fenêtre), si bien que l'activité n'est pas
recréée et que l'application conserve son état. Les tailles de texte Android sont fixées en
pixels au moment où elles sont définies, si bien qu'à un changement d'échelle de police le moteur de rendu redéfinit la taille
de chaque texte : chacun finit aussi grand qu'il le serait dans une application démarrée à
la nouvelle échelle, y compris la croissance réduite d'Android 14 pour les grands textes.

## Comment c'est câblé

UIKit n'a pas de notification pour un changement de `userInterfaceStyle`, si bien que le shell
iOS rapporte les traits de sa scène à `KuitoTraits`
(`native/modules/appearance/ios`, le module est donc `always` dans sa
spec) : à la connexion, depuis
`windowScene(_:didUpdate:interfaceOrientation:traitCollection:)`, et quand
la scène devient active. Tant que l'application est en arrière-plan, iOS bascule le
style pour capturer les deux apparences ; le shell ne rapporte pas ces bascules, et
se rattrape au retour. Android lit la configuration et écoute avec
`registerComponentCallbacks`.
