# keepAwake

Garde l'écran allumé tant que le composant qui l'appelle est monté. Chaque appel
maintient l'écran de son côté, et l'écran ne peut se remettre en veille que lorsque toutes
les prises sont relâchées.

```tsx
import { keepAwake, app } from 'kuito';

function Player() {
  keepAwake(); // held while Player is mounted
  return <Video />;
}

// For the app's life, outside any component; call the result to let go.
const release = keepAwake({ scope: app });
release();
```

`keepAwake()` est un effet de portée (voir [modules natifs](native-modules.md#scope-effects)) :
appelé pendant qu'un composant se met en place, il maintient l'écran du montage jusqu'au
démontage du composant. Partout ailleurs il nécessite `{ scope: app }`, et un appel
sans cela lève une erreur. Dans les deux cas il retourne la fonction qui laisse l'écran
se mettre en veille plus tôt ; l'appeler deux fois est sans conséquence.

iOS désactive `UIApplication.isIdleTimerDisabled` ; Android ajoute
`FLAG_KEEP_SCREEN_ON` à la fenêtre de l'activité, ce qui ne s'applique que tant que
l'application est au premier plan. Un rechargement relâche toutes les prises.
