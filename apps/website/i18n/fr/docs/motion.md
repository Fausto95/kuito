# Mouvement

Tout ce qui bouge forme une seule petite algèbre, écrite sous forme de données :

- **Sources** : une valeur de mouvement, un geste, un signal, le temps (une
  animation).
- **Transformations** : `map`, `clamp`, `interpolate` ; `timing`, `spring`,
  `decay` ; `delay`, `sequence`, `parallel`, `stagger`, `repeat`, `keyframes`.
- **Puits** : les props.

Les déclarations se compilent en programmes que le thread UI exécute à côté
des vues, de sorte que bouger n'attend jamais JavaScript et ne re-rend jamais
un composant. Un rappel est l'exception, pour ce qui a besoin de JavaScript.

```tsx
import { Box, interpolate, motion, pan, spring } from 'kuito';

export function Card() {
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  return (
    <Box
      translateX={x}
      opacity={interpolate(x, [0, 200], [1, 0.5])}
      rotate={x.map((v) => v / 20)}
      gestures={[drag]}
    />
  );
}
```

C'est un élément déplaçable complet qui revient à sa position d'origine par
un ressort avec la vélocité du doigt : aucun gestionnaire, et rien ne passe
vers le thread JavaScript pendant qu'il bouge.

## Valeurs de mouvement

`motion(initial)` fonctionne comme `signal()` : on l'appelle pendant qu'un
composant se met en place, on lit et on écrit `.value` n'importe où. Utilisez
`signal()` pour les valeurs auxquelles les composants réagissent, et `motion()`
pour les valeurs avec lesquelles l'écran bouge. Une valeur de mouvement
disparaît quand son composant se démonte.

- `x.follows(source)` déplace `x` avec `source` sur le thread UI : le champ
  d'un geste (`drag.x`), une autre valeur de mouvement, ou une valeur dérivée.
  `null` l'arrête.
- `x.map(fn)`, `interpolate(x, input, output)` et `clamp(x, min, max)`
  fabriquent des valeurs dérivées : calculées sur le thread UI chaque fois que
  `x` bouge, et données à une prop ou suivies comme une valeur de mouvement.
  `interpolate` projette morceau par morceau entre des nombres ou des couleurs
  hexadécimales, en conservant ses valeurs extrêmes sauf avec
  `{ extrapolate: 'extend' }`. `map` prend une fonction que le compilateur a
  compilée pour le thread UI (voir [Vous ne choisissez jamais de thread](#you-never-pick-a-thread)).
- `x.value = animation` l'anime ; `x.value = 5` le déplace immédiatement.

## Gestes

Les gestes sont des valeurs, reconnues nativement par des portages des
reconnaisseurs de
[React Native Gesture Handler](https://github.com/software-mansion/react-native-gesture-handler)
(RNGH), et attachées par une seule prop :

| Geste         | Options                                                    | Déplace (à suivre)                           |
| ------------- | ---------------------------------------------------------- | -------------------------------------------- |
| `pan()`       | `axis`, `minDistance`                                      | `x`, `y` : sa translation, ajoutée           |
| `touches()`   |                                                            | `x`, `y` : où se trouve le doigt dans la vue |
| `pinch()`     |                                                            | `scale`, multiplié                           |
| `rotate()`    |                                                            | `rotation` en degrés, ajoutée                |
| `tap()`       | `count`, `maxDuration`, `maxDistance`                      |                                              |
| `longPress()` | `after` (500 ms), `maxDistance`                            |                                              |
| `fling()`     | `direction` : `'left'`, … ou une liste (droite par défaut) |                                              |

Chaque geste prend aussi `disabled` et `hitArea`, les noms des props de vue
(envoyés comme `enabled` et `hitSlop` de RNGH, voir [le contrat
natif](#native-contract)), déplace `active` (1 tant qu'il est actif), et prend
les rappels qui ont besoin de JavaScript : `onStart` (il s'est activé),
`onChange` (il a bougé, avec `changeX`/`changeY`, `scaleChange` ou
`rotationChange`) et `onEnd(event, success)`. Chacun s'exécute là où le
compilateur peut le placer. `axis` fait démarrer un pan après 10 points le long
de cet axe et échouer après 10 points en travers. Une option invalide est une
erreur.

- **Suivi** : une valeur de mouvement qui suit un champ part de là où elle se
  trouve quand le geste s'active ; `pan` et `rotate` ajoutent leur translation
  ou leur rotation, `pinch` multiplie par son échelle, `touches` fixe la
  position.
- **Relâchement** : `gesture.release(animation)` dit comment ses suiveurs
  lâchent prise. Chacun exécute l'animation avec la vélocité du geste, vers sa
  propre position d'origine (sa première valeur) sauf si l'animation a une
  cible : `drag.release(spring())` revient à l'origine par un ressort,
  `drag.release(decay({ clamp: [0, 400] }))` glisse sur sa lancée,
  `drag.release(spring().to([0, 400]))` s'accroche au point le plus proche de
  là où le lancer atterrirait.
- **Composition** : plusieurs gestes sur une vue sont en course (le premier à
  s'activer gagne). `race(a, b)`, `together(a, b)` (les deux à la fois :
  pincement et rotation) et `orElse(a, b)` (b attend que a échoue : un double
  tap, sinon un tap) les composent comme des valeurs, et s'imbriquent. (Pas
  `then` : un module qui exporte `then` est un thenable, qu'`import()`
  appelle.) Entre vues, le geste de la vue la plus intérieure reçoit le toucher
  en premier, comme dans RNGH.

```tsx
const zoom = pinch().release(spring());
const turn = rotate().release(spring());
const scale = motion(1).follows(zoom.scale);
const angle = motion(0).follows(turn.rotation);

<Image scale={clamp(scale, 1, 3)} rotate={angle} gestures={[together(zoom, turn)]} />;

<Box
  gestures={[
    race(
      orElse(tap({ count: 2, onEnd: like }), tap({ onEnd: open })),
      longPress({ onStart: showMenu }),
    ),
  ]}
/>;
```

Tirer pour rafraîchir appartient à la vue de défilement elle-même :
`<Scroll refreshing={loading} onRefresh={reload}>`, dont la plateforme
exécute le tirage ; `reload` est le travail sur les données qui a besoin de
JavaScript.

## Animations

Les constructeurs décrivent comment une valeur se déplace ; `.to(target)` dit
où, pour une prop ou une valeur de mouvement qui reçoit l'animation
directement :

```tsx
<Box opacity={timing(200).to(0)} translateY={delay(80, spring().to(12))} />;

offset.value = sequence(timing(120).to(1.2), spring().to(1));
offset.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600));
```

| Constructeur                                                            | Valeurs par défaut                           |
| ----------------------------------------------------------------------- | -------------------------------------------- |
| `timing(duration)`, `timing({ duration, easing, delay, onEnd })`        | 300 ms, `easing.inOut`                       |
| `spring({ damping, stiffness, mass, velocity, delay, onEnd })`          | amortissement 10, raideur 100, masse 1       |
| `spring({ duration, dampingRatio, clamp, ... })`                        | 1333 ms, taux d'amortissement 0,5            |
| `decay({ velocity, deceleration, clamp, rubberBand, onEnd })`           | vélocité 0, décélération 0,998               |
| `keyframes({ 0: a, 50: b, 100: c }, duration or timing config)`         | un timing passant par chaque étape           |
| `delay(ms, animation)`                                                  | ajoute un délai à n'importe quelle animation |
| `sequence(a, b, ...)`, `repeat(animation, { count, reverse, onEnd })`   | count Infinity                               |
| `easing.linear`, `ease`, `in`, `out`, `inOut`, `bezier(x1, y1, x2, y2)` | courbes cubic-bezier, comme en CSS           |

Une animation démarre à l'image suivante, depuis là où se trouve alors la
valeur. Assigner une valeur ou une autre animation l'interrompt, et son `onEnd`
s'exécute avec `false`. Un ressort conserve la vélocité de ce qu'il interrompt,
quand elle le porte vers sa cible, et conserve dans tous les cas une vélocité
qu'on lui donne (celle d'un relâchement). Les nombres et les couleurs
hexadécimales (`#rrggbb`, `#rrggbbaa`) s'animent ; une couleur exécute
n'importe quelle animation canal par canal. Plusieurs cibles sont des points
d'accroche. `onEnd` a besoin d'une valeur de mouvement que l'app détient : une
prop qui en reçoit un est une erreur, de même qu'un timing ou un ressort sans
cible. Tant que le thread UI n'a pas démarré une animation, une lecture depuis
le thread JS renvoie là où se trouve la valeur, pas là où elle va.

Les mathématiques (timing le long d'une courbe de Bézier cubique, ressorts par
physique ou par durée, décélération rigide ou élastique, sequence, repeat et
delay) sont un portage de celles de Reanimated, avec ses noms de configuration
et ses valeurs par défaut (celles de Reanimated 3 pour les ressorts) : un délai
laisse l'animation qu'il interrompt continuer jusqu'à ce qu'il démarre.

## Props animées : `animate` et `transition`

Une vue dit ce qui change et comment cela se déplace :

```tsx
<Box
  animate={{ opacity: open.value ? 1 : 0.6, scale: open.value ? 1 : 0.96 }}
  transition={{ opacity: timing(200), transform: spring({ damping: 14 }) }}
/>
```

`animate` prend des valeurs pour les props animables (`opacity`,
`backgroundColor`, `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`,
`rotate`). Ses premières valeurs s'appliquent immédiatement ; chaque changement
ultérieur se déplace comme `transition` le dit. Une prop définie à la fois
directement et dans `animate` est une erreur, de même qu'une animation dans
`animate`.

`transition` nomme une animation par groupe : `opacity`, `backgroundColor`,
`transform` (les translations, les échelles et la rotation) ou `all`. Elle
s'applique à `animate`, à `enter` et `exit`, et aux changements ordinaires des
props qu'elle nomme. Sans elle, `animate`, `enter` et `exit` font un ressort
sur les transformations et exécutent des timings de 300 ms pour le reste ; un
changement ordinaire de prop s'applique immédiatement. Une `transition` CSS
dans un module `.css` ou dans `styles()` se compile vers la même prop
([Styles natifs](styles.md#transitions)) :

```css
.card {
  transition:
    transform 400ms spring(14, 180),
    opacity 250ms ease-out;
}
```

Une prop qui reçoit une animation, ou qui change sous une transition, se lie à
une valeur de mouvement qui lui est propre, de sorte que chaque animation
continue depuis là où la précédente en était.

## Entrer, sortir et se déplacer : `enter`, `exit`, `layout`

Un effet nomme les props depuis lesquelles une vue entre et vers lesquelles
elle sort :

| Effet                                                             | Entre depuis, sort vers                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `fade`                                                            | transparent                                                              |
| `slide.up(d)`, `slide.down(d)`, `slide.left(d)`, `slide.right(d)` | à une distance `d` (24 par défaut), en se déplaçant dans cette direction |
| `zoom(scale)`                                                     | `scale`, 0,85 par défaut                                                 |
| `keyframes({ 0: { ... }, 100: { ... } }, duration)`               | ses propres étapes, les mêmes dans les deux sens                         |

```tsx
<Box enter={fade.and(slide.up(12))} exit={fade} layout={spring()} />
```

`a.and(b)` et `parallel(a, b, ...)` jouent des effets en même temps ;
`sequence` l'un après l'autre, chacun démarrant quand la prop la plus lente du
précédent se termine ; `stagger(ms, a, b, ...)` chacun `ms` après le
précédent ; `delay(ms, effect)` plus tard. Chaque prop se déplace comme
`transition` le dit et se termine à la valeur propre de la vue.

`enter` se joue quand la vue est créée. Quand une vue avec `exit` est retirée,
elle quitte l'arbre de JavaScript immédiatement, mais le moteur de rendu la
garde à l'écran, sans recevoir de touchers, pendant que le thread UI l'anime
vers la sortie depuis là où elle se trouve.

`layout={spring()}` (ou `timing(...)`) anime la vue vers chaque nouveau cadre
que la disposition lui donne, sur l'animateur propre de la plateforme. Son
premier cadre s'applique immédiatement.

Deux choses restent sur les animateurs de la plateforme plutôt que sur le
chemin de mouvement du thread UI, toutes deux sur le thread principal sans
aucun JavaScript. `layout` déplace une vue vers un cadre que la passe de
disposition calcule au moment où elle s'applique, après que l'image du thread
UI a été exécutée ; le thread UI pilote des props, pas des cadres, donc le
moteur de rendu interpole le cadre lui-même (un animateur de propriété UIKit ;
un `ValueAnimator` ou un `SpringAnimation` sur Android). Le retour
`pressedOpacity` et `pressedScale` d'un Pressable suit le propre suivi du
toucher de la vue native, une accélération rapide fixe à l'entrée et une
décélération douce à la sortie ; le faire passer par le noyau UI ajouterait un
saut à chaque toucher sans rien changer à ce que voit l'utilisateur.

Une vue avec un `sharedId` vole vers la vue portant le même `sharedId` sur
l'écran vers lequel une pile pousse ou dépile, en parallèle de la propre
transition de la pile
([Éléments partagés](navigation.md#shared-elements)).

## Animations réduites

Avec le réglage d'animations réduites de l'utilisateur activé, chaque
animation, transition et effet saute à sa fin, et `layout` applique les cadres
immédiatement (le réglage Réduire les animations du système sur iOS, l'échelle
de durée de l'animateur sur Android). Les gestes suivent toujours le doigt :
c'est de la manipulation directe, pas de l'animation. Le noyau communique le
réglage au thread UI à son démarrage et à chaque changement.

## Vous ne choisissez jamais de thread

Il n'y a ni directive `'worklet'`, ni `runOnUI`, ni `runOnJS`. Le compilateur
et le noyau décident :

- **Le compilateur** (`src/dev/threads`) compile une seconde fois, dans un
  bundle UI, chaque fonction, expression de prop JSX, gestionnaire
  d'événement, rappel `on*` et fonction `map` de valeur de mouvement qu'il peut
  prouver sûre pour le thread UI. "Sûre" signifie que ses variables libres sont
  seulement lues, écrites via `.value`, ou appelées. Les variables sont
  capturées par chemin de membre, donc `props.dim` traverse sans le reste de
  `props`, et `.value` reste vivant.
- **Le noyau** (`src/runtime/threads.ts`) place chaque prop et chaque
  gestionnaire au moment de son commit :
  - Une prop dont l'expression lit une valeur de mouvement, ou qui est une
    valeur de mouvement ou une valeur dérivée, est liée sur le thread UI. Elle
    se met à jour dans la même image que la valeur qu'elle lit. Un signal
    qu'elle lit aussi la renvoie depuis le thread JS quand le signal change.
  - Les gestes, leurs suiveurs et leurs relâchements s'exécutent sur le thread
    UI sous forme de données ; un rappel de geste s'y exécute quand le
    compilateur a pu le placer.
  - Un gestionnaire d'événement qui capture une valeur de mouvement s'exécute
    sur le thread UI, directement depuis l'événement natif, et les props qu'il
    déplace se mettent à jour avant l'image. Un gestionnaire de défilement qui
    s'y trouve reçoit l'événement de défilement de chaque image, sauf si l'app
    définit son propre `scrollInterval`.
  - Tout le reste s'exécute sur le thread JS.

Dans le code du thread UI, les appels à des fonctions du thread JS dont le
résultat n'est pas utilisé, comme la journalisation ou l'analytique, sont
envoyés au thread JS et s'y exécutent. Les écritures dans un signal repartent
par le même chemin et re-rendent comme d'habitude. Les lectures d'un signal
voient sa valeur au moment où le code a été envoyé. Chacun de ces échanges est
un message `__kuito.ui`, compté dans `__kuito.stats().total.uiMessages`.

Ce qui traverse vit aussi longtemps que le code qui l'a envoyé. Une fonction du
thread JS ou un signal que le thread UI peut atteindre est retenu par le plan
validé de chaque module qui l'a encodé, et libéré quand plus aucun ne le fait ;
un appel ou une écriture qui arrive pour un élément qu'un patch ultérieur a
libéré est abandonné. Chaque bundle UI qu'un Live Patch charge remplace les
fonctions du bundle précédent. L'id d'une fonction UI vient de son fichier et
de ce qu'elle fait, pas de l'endroit où elle se trouve : un patch qui déplace,
reformate ou commente une fonction, ou en modifie une autre, conserve son id,
et ce que le thread UI lui a lié reste lié.

## Quand cela doit rester sur le thread JS

Une prop qui lit une valeur de mouvement mais ne peut pas s'exécuter sur le
thread UI fonctionne quand même. Elle s'exécute sur le thread JS, avec une
image de retard, et Kuito journalise un avertissement une seule fois avec la
raison et l'emplacement :

```
Box width reads a motion value but runs on the JS thread, a frame late: it constructs Thing (app.tsx:4:7)
```

Le thread UI ne peut pas exécuter du code qui :

- utilise `this`, `arguments`, `await` ou `yield` ;
- crée du JSX ou une instance de classe (les objets natifs comme `Date` et
  `Map` ne posent pas de problème) ;
- assigne une variable ou un objet du thread JS (`.value` ne pose pas de
  problème) ;
- utilise le résultat d'une fonction du thread JS, ce que le compilateur sait
  pour toute fonction importée d'un paquet (`clamp(x)` de `lodash-es`) ;
  l'appeler pour son effet ne pose pas de problème ;
- lit `typeof` sur un nom que rien dans le module ne déclare
  (`typeof document`) ;
- capture une valeur qui ne peut pas traverser les threads, comme une instance
  de classe.

Un `map` dont le compilateur n'a pas pu placer la fonction fait rester la prop
sur le thread JS de la même manière. Les captures conservent `?.` :
`theme.colors?.dim` lit `undefined` quand `colors` est absent, comme la
fonction le ferait.

## Comment les threads restent synchronisés

- Les valeurs de mouvement appartiennent au thread UI. Une lecture depuis le
  thread JS n'attend jamais. Elle renvoie la copie que le runtime UI écrit
  après chaque changement, sauf si le thread JS a écrit une valeur plus récente
  depuis ; cette écriture est numérotée, et la copie indique quand le thread UI
  l'a appliquée. La copie d'un nombre est un nombre
  (`native/shared/MotionMirror.h`) ; les copies des autres valeurs sont du
  JSON.
- Les opérations destinées au thread UI sont mises en file pendant une tâche JS
  et voyagent à l'intérieur du lot de mutations natif, après les mutations de
  vue auxquelles elles se réfèrent. Les appels de retour vers le thread JS
  voyagent comme des événements `__kuito.ui` (`docs/events.md`).
- Les valeurs traversent en JSON avec quelques étiquettes
  (`src/runtime/thread-wire.ts`).
- Le runtime UI démarre avec le premier message. Une app qui ne fait jamais
  rien bouger ne paie rien, et un hôte sans runtime UI exécute tout sur le
  thread JS : les gestes et leurs suiveurs aussi, tandis qu'une animation
  assignée saute à sa fin (une décélération reste où elle est) et appelle
  `onEnd` avec `true`, et les effets ne font rien.

## Plateformes

Sur iOS et Android, le runtime UI est un second runtime Hermes sur le thread
principal (`native/shared/UIRuntime.cpp`), à côté du moteur de rendu. Il
applique les props qu'il calcule avant de rendre la main, de sorte qu'elles
atterrissent dans l'image en cours de construction. Les animations avancent sur
les images d'affichage, les mêmes qui appliquent les lots du thread JS
(docs/native-scheduling.md), que le runtime UI ne demande que tant que quelque
chose s'anime ou que des lots attendent.

Les gestes fonctionnent à l'intérieur d'une `Sheet` sur les deux plateformes :
sur Android, le contenu de la feuille est une racine de touchers à part
entière, puisqu'il vit dans sa propre fenêtre.

Limites :

- Android : un `Scroll` vertical n'annule pas un geste sur un ancêtre quand il
  commence à défiler (son enveloppe de rafraîchissement avale la demande).
- Un tap sur un ancêtre d'un `Pressable` l'emporte sur la pression, comme dans
  RNGH ; le `onLongPress` de `Pressable` est son propre événement de pression.

## Contrat natif

Les valeurs structurées traversent la frontière native sous forme de chaînes
JSON. Une prop animée atteint le moteur de rendu sous la forme des valeurs que
le thread UI fixe à chaque image ; le noyau garde `transition`, `animate`,
`enter` et les valeurs `gestures` de l'app et ne les envoie jamais telles
quelles.

- `exit` : `true` tant que la vue a un effet de sortie. Une vue retirée qui en
  a un reste dans sa superview, retenue par le moteur de rendu, qui lui
  applique les props que le thread UI fixe jusqu'à ce que le thread UI fixe
  `exited` ; alors elle disparaît.
- `layout` : `{ type: 'timing', duration, easing: [x1, y1, x2, y2], delay }`
  ou `{ type: 'spring', damping, stiffness, mass, delay }`, l'animation avec
  laquelle les changements de cadre s'exécutent (un animateur de propriété
  UIKit ; un `ValueAnimator` ou un `SpringAnimation` sur les bounds de la vue
  sur Android).
- `gestures` : une entrée par reconnaisseur attaché à la vue (un geste composé
  apporte tous ses gestes), détenue par `properties/KuitoGestureProperties`
  sur les deux moteurs de rendu, qui gardent les reconnaisseurs portés de RNGH
  dans `gestures/` :

```json
[
  {
    "tag": 7,
    "type": "pan",
    "config": { "activeOffsetXStart": -10, "activeOffsetXEnd": 10, "minDist": 4 },
    "waitFor": [],
    "simultaneousHandlers": [8],
    "blocksHandlers": []
  }
]
```

- `type` : `pan`, `tap`, `longPress`, `pinch`, `rotation` ou `fling`.
- `config` : les clés de configuration natives de RNGH, seulement celles qui
  sont définies : `enabled`, `shouldCancelWhenOutside`, `hitSlop` (`{ left,
  top, right, bottom, width, height, horizontal, vertical }`), pour pan
  `activeOffsetXStart/End`, `activeOffsetYStart/End`, `failOffsetXStart/End`,
  `failOffsetYStart/End`, `minDist`, `minPointers`, `maxPointers`,
  `minVelocity`, `minVelocityX/Y`, `avgTouches`, `activateAfterLongPress` ;
  pour tap `numberOfTaps`, `maxDurationMs`, `maxDelayMs`, `maxDist`,
  `maxDeltaX/Y`, `minPointers` ; pour l'appui long `minDurationMs`, `maxDist`,
  `numberOfPointers` ; pour fling `direction` (un masque de bits : RIGHT 1,
  LEFT 2, UP 4, DOWN 8) et `numberOfPointers`.
- Les relations nomment les autres gestes par `tag`, unique dans l'app.
- Une nouvelle valeur remplace les gestes de la vue : les reconnaisseurs dont
  le tag a disparu sont retirés, les autres sont reconfigurés. `null` les
  retire tous.

La vue émet des événements `gesture` (son numéro, `gesture`, une charge utile
JSON) avec `handlerTag`, `state`, `numberOfPointers`, `pointerType` (0 pour le
toucher) et les champs du geste : `x`, `y`, `absoluteX/Y` ; pour pan
`translationX/Y` et `velocityX/Y` ; pour pinch `scale`, `focalX/Y` et
`velocity` ; pour rotation `rotation` (en radians sur le fil, en degrés pour
l'app), `anchorX/Y` et `velocity` ; pour l'appui long `duration` ; plus
`oldState` lors d'un changement d'état. Un changement d'état et une mise à jour
sont des événements distincts : une mise à jour n'a pas d'`oldState`. Les
états sont ceux de RNGH : UNDETERMINED 0, FAILED 1, BEGAN 2, CANCELLED 3,
ACTIVE 4, END 5. Les distances sont en points (iOS) ou en pixels indépendants
de la densité (Android).

Le noyau transforme les valeurs de geste en ce contrat
(`src/runtime/gestures.ts`, en composant selon les règles de RNGH dans
`src/runtime/gesture-specs.ts`), et le répartiteur que partagent les deux
threads (`src/runtime/gesture-events.ts`) transforme les événements en rappels
et en mouvements de suiveurs, la projection du `useAnimatedGesture` de RNGH.

## Crédits

- Le modèle de props calculées sur le thread UI à partir de valeurs partagées,
  les mathématiques d'animation et `interpolate` viennent de
  [Reanimated](https://github.com/software-mansion/react-native-reanimated)
  (MIT, Software Mansion). Kuito suit les dépendances à chaque exécution,
  comme le font ses signaux, plutôt qu'à travers tout ce qu'une fonction a
  capturé.
- Les reconnaisseurs natifs sont des portages de ceux de React Native Gesture
  Handler, et les règles de composition ainsi que la projection des événements
  suivent son API `Gesture` : licence MIT, Copyright (c) 2016 Software Mansion.
- La compilation des fonctions de thread dans un second bundle, avec des
  captures évaluées paresseusement, suit le compilateur
  d'[Octane](https://github.com/octanejs/octane) (MIT, Dominic Gannaway).
