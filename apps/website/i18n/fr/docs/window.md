# window

La fenêtre de l'application sous forme de signaux : sa taille, les insets de la zone sûre et son
orientation, en points sur iOS et en dp sur Android.

```tsx
import { Text, window } from 'kuito';

<Text>{`${window.size.value.width} × ${window.size.value.height}`}</Text>;
<Text>{window.orientation.value === 'landscape' ? 'Wide' : 'Tall'}</Text>;
window.insets.value; // { top, left, bottom, right }
```

| Signal        | Valeur                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `size`        | `{ width, height }` : le même objet tant que la taille ne change pas.                                                                                  |
| `insets`      | Jusqu'où la barre d'état, l'encoche, l'indicateur d'accueil et la barre de navigation empiètent.                                                       |
| `orientation` | `'landscape'` quand la fenêtre est plus large que haute, sinon `'portrait'`.                                                                           |
| `widthClass`  | `'compact'` sous 600 de large, `'medium'` sous 840, `'expanded'` au-delà ; ce que suit `@media (width-class: …)` ([conditions](styles.md#conditions)). |

Les trois sont lus de manière synchrone. Une lecture en JSX ou un `watch` les suit, et
le module n'émet des changements que tant que quelque chose en observe un. Pour un padding selon la
zone sûre, `SafeArea` le fait nativement et n'a besoin de rien de tout cela : utilisez les
signaux pour les décisions de mise en page que prend JavaScript, comme un nombre de colonnes.

## Comment c'est câblé

Le shell rapporte sa fenêtre à `KuitoWindowMetrics` (`native/modules/window`,
`always` dans sa spec) après chaque mise en page, le seul moment où la taille et les
insets sont tous deux à jour après une rotation, un redimensionnement ou un changement des barres :

- iOS : les `layoutSubviews` et `safeAreaInsetsDidChange` de la fenêtre, avec
  `bounds` et `safeAreaInsets`.
- Android : un écouteur de mise en page global sur la vue racine de l'activité, avec sa taille
  et les insets de fenêtre racine des barres système et de la découpe d'écran.

`KuitoWindowMetrics` conserve les dernières métriques sous un verrou (iOS) ou dans un
champ volatile (Android), si bien que le thread JS les lit sans attendre le
thread principal, et ne rapporte qu'un changement.
