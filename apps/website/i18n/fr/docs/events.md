# Événements

Les props d'événement sont nommées d'après le fait qu'elles rapportent
([nommage](naming.md)). Chacune écoute un événement natif, et certaines passent
la valeur que la vue rapporte au lieu de l'événement.

| Prop                          | Événement natif        | Le gestionnaire reçoit                         |
| ----------------------------- | ---------------------- | ---------------------------------------------- |
| `onPress` / `onPressCapture`  | `press`                | `PressEvent` (se propage, annulable)           |
| `onPressStart` / `onPressEnd` | `pressin` / `pressout` | l'événement                                    |
| `onLongPress`                 | `longpress`            | l'événement                                    |
| `onChange`                    | `change`               | le texte pour TextField, `checked` pour Toggle |
| `onSubmit`                    | `submit`               | `{ text }`                                     |
| `onFocus` / `onBlur`          | `focus` / `blur`       | l'événement                                    |
| `onLoad` / `onError`          | `load` / `error`       | l'événement                                    |
| `onScroll`                    | `scroll`               | l'événement                                    |
| `onAction`                    | `accessibilityaction`  | `{ actionName }`                               |

Une vue fournie par un module natif a ses propres événements à la place :
chaque prop `on*` écoute l'événement qu'elle nomme (`onChangeEnd` pour
`changeEnd`) quand la vue le déclare, et le gestionnaire reçoit l'événement
avec les champs de la charge utile ([vues natives](native-modules.md#views)).

`onChange` passe la valeur que la vue rapporte, pas l'événement : le texte d'un
TextField, le `checked` d'un Toggle. Le texte d'un TextField est son `value`.

Les vues natives rapportent chaque événement, que l'app écoute ou non ; un
événement que personne n'écoute est abandonné. Les événements traversent les
threads de façon asynchrone, une vue peut donc encore rapporter après qu'un
commit l'a retirée : un TextField focalisé perd le focus en quittant la
fenêtre, et tout ce qu'il a envoyé avant que le retrait n'atteigne le côté
natif est encore en chemin. Ces événements sont abandonnés eux aussi, les
gestionnaires d'une vue retirée ne s'exécutent donc jamais (pas d'`onBlur` au
démontage, comme dans React Native). Un événement visant un id que le noyau
n'a jamais créé est une erreur.

Un rechargement vide l'arbre natif avant que le runtime suivant ne démarre, et
aucune vue de l'arbre vidé ne rapporte à nouveau : une image encore en
chargement quand l'app recharge n'envoie jamais son `load` au nouveau runtime,
dont les vues réutilisent les mêmes ids.

Le texte du `change` d'un TextField et la valeur du `change` d'un Toggle
deviennent la prop enregistrée de la vue, de sorte qu'un `value` contrôlé qui
ne fait que répéter ce que la vue a rapporté ne lui est pas renvoyé (voir
[clavier](keyboard.md#inputs)).

## Props bidirectionnelles

Certaines props, la vue les change elle-même : le `value` d'un TextField quand
l'utilisateur tape, le `value` d'un Toggle, l'`open` d'une Sheet quand
l'utilisateur la ferme, le `refreshing` d'une vue défilante ou d'une liste
quand l'utilisateur tire pour rafraîchir. Leur type est `Bound<T>`. Donnez-leur
un signal et la vue l'écrit, sans gestionnaire :

```tsx
const query = signal('');

<TextField value={query} />; // typing writes query; query.value = '' clears the field
```

Le manifeste dit quel événement rapporte quelle prop (`reports` dans
`src/protocol/manifest.ts`) : le champ de la charge utile portant la nouvelle
valeur (`change` → `text`), ou la valeur que l'événement signifie (`close` →
`open: false`, `refresh` → `refreshing: true`). Le noyau l'enregistre d'abord
comme prop de la vue, l'écriture du signal n'est donc pas renvoyée : la vue
l'affiche déjà. Un signal en lecture seule (un `computed`, l'état de plateforme
d'un module) ou une valeur simple est affiché dans un seul sens et jamais
écrit. Une vue fournie par un module natif rapporte une prop par tout événement
dont la charge utile a un champ du nom de la prop (le `value` d'un Slider).

## Événements à l'échelle de l'app

L'état que le côté natif suit pour toute l'app arrive de la même façon, comme
un événement de l'app (handle 0) nommé `<target>.<event>` : `keyboard.<type>`
pour le clavier, `accessibility.status` pour l'état du lecteur d'écran et de la
réduction des animations, `devtools.select` pour le sélecteur d'élément du menu
de développement, `ui` pour un message du thread UI, et `host.idle`, sans
charge utile, quand le thread UI a appliqué chaque lot sur lequel il avait pris
du retard, ce qui exécute les replanifications qui l'attendaient
([ordonnancement natif](native-scheduling.md)). Le noyau les remet aux signaux
et observateurs `keyboard` et `accessibility` ([clavier](keyboard.md),
[accessibilité](accessibility.md)) ; un événement que personne n'écoute est
abandonné. Toute autre cible est une erreur.

## Format de transport

Un événement natif est trois valeurs : le numéro de la vue (celui avec lequel
le lot hôte l'a créée, docs/native-scheduling.md ; 0 pour l'app), le nom de
l'événement, et une charge utile objet JSON quand l'événement porte des
données : `(17, "change", '{"text":"Ada"}')`. Le shell les passe au `dispatch`
du runtime, qui appelle `__kuito.dispatch(handle, event, payload)`. Un nombre
que JSON ne peut pas contenir (NaN, Infinity) est envoyé comme `null` à sa
place sur les deux plateformes ; une valeur qui n'est pas du JSON du tout est
un bug du moteur de rendu et échoue bruyamment. Les numéros de vue ne sont
jamais réutilisés, un événement d'une vue que le noyau a déjà retirée (un champ
focalisé perd le focus en quittant la fenêtre) est donc abandonné ; un numéro
que le noyau n'a jamais attribué est une erreur.
