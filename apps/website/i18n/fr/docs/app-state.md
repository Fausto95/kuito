# app

L'état et les actions propres à l'app : si elle est au premier plan, les
avertissements mémoire du système, et sa page dans les Réglages.

```tsx
import { watch, app } from 'kuito';

app.state.value; // 'active' | 'background' | 'inactive'

// In a component: both follow the platform until the component unmounts.
watch(app.state, (state) => {
  if (state === 'active') refresh();
});
app.watch('memoryWarning', () => cache.clear());

await app.openSettings();
```

| Membre                       | Est                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `state`                      | Un signal de l'état. Lu sans être observé, il interroge la plateforme.               |
| `watch('memoryWarning', fn)` | Appelle `fn()` quand le système manque de mémoire ; renvoie son `EventSubscription`. |
| `openSettings()`             | Ouvre la page de cette app dans les Réglages du système. Se résout une fois ouverte. |

La plateforme n'est observée que tant que quelque chose observe `app.state` :
le `watch` d'un composant, ou une prop ou un texte qui le lit. Commencer à
observer rapporte l'état de départ de la plateforme, un changement survenu
pendant qu'elle démarrait encore (sur Android, l'app reprend souvent à ce
moment-là) n'est donc pas perdu, et le même état deux fois est un seul
changement.

`app.watch` dans un composant démarre au montage du composant et s'arrête à
son démontage ; hors d'un composant, il démarre immédiatement, et le `remove()`
de l'abonnement renvoyé l'arrête. Un autre nom d'événement lève une `TypeError`.

## États

| État         | iOS                                                                                 | Android                                                                                   |
| ------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `active`     | La scène est au premier plan et reçoit les événements.                              | L'activité est reprise.                                                                   |
| `inactive`   | Au lancement, ou entre deux : un appel, le sélecteur d'apps, le Centre de contrôle. | Démarrée mais en pause : une autre activité (la feuille de partage) en couvre une partie. |
| `background` | Une autre app ou l'écran d'accueil est devant.                                      | L'activité est arrêtée.                                                                   |

React Native rapporte `background` sur Android dès que l'activité se met en
pause, et n'y a pas d'`inactive`. Kuito rapporte `inactive` tant qu'elle est
en pause mais encore visible, une feuille de partage ne compte donc pas comme
quitter l'app ; le code qui teste `background` ou non-`active` fonctionne
pareil.

`memoryWarning` vient de `applicationDidReceiveMemoryWarning` sur iOS, et de
`onTrimMemory` aux niveaux `RUNNING_LOW`, `RUNNING_CRITICAL` et `COMPLETE` sur
Android. Android 14 et versions ultérieures n'envoient plus les niveaux running.

## Comment c'est câblé

Le shell rapporte le cycle de vie à `KuitoAppLifecycle`
(`native/modules/app-state`, `always` dans sa spec pour que chaque shell
l'ait) : les `sceneDidBecomeActive`, `sceneWillResignActive`,
`sceneWillEnterForeground` et `sceneDidEnterBackground` du scene delegate sur
iOS, et le `Lifecycle` de l'activité sur Android. Le module le lit et l'observe
là, et [luminosité](brightness.md) aussi. `KuitoAppLifecycle` survit au
runtime, un rechargement démarre donc avec l'état courant, et `app.state` est
juste avant même que quoi que ce soit ne l'observe.

Essayez depuis le terminal : `xcrun simctl launch` une autre app pour mettre
celle-ci en arrière-plan, ou sur Android :

```bash
adb shell input keyevent KEYCODE_HOME
```

```bash
adb shell am send-trim-memory dev.kuito.shell RUNNING_LOW
```
