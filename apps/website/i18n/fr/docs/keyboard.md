# Clavier

Le côté natif suit le clavier logiciel et garde les champs de saisie hors de
son chemin de lui-même, à l'intérieur de l'animation du clavier : les
notifications clavier d'UIKit sur iOS, `WindowInsetsAnimation` sur Android, où
l'évitement suit le clavier image par image. JavaScript n'est pas sur ce
chemin, donc rien n'attend un aller-retour et rien ne devine un décalage,
comme le fait le `KeyboardAvoidingView` de React Native avec
`keyboardVerticalOffset`.

## Évitement

**Les vues défilantes et les listes le font par défaut.** Pendant que le
clavier couvre une partie d'un Scroll ou d'une List verticale, son contenu est
décalé d'autant par un inset, de sorte qu'il peut encore défiler entièrement
en vue, et un champ focalisé à l'intérieur (dans une ligne, pour une liste)
remonte par défilement jusqu'à dégager le clavier. L'inset s'ajoute au padding
propre de la vue. Une liste inversée le prend à son début, qui est en bas de
l'écran, de sorte qu'une liste qui y repose garde ses premières lignes
au-dessus du clavier, comme un chat le devrait. Désactivez-le avec
`keyboard={{ inset: false }}`. Il est actif par défaut, sur les deux
plateformes.

**Tout conteneur peut l'éviter** avec `keyboard={{ avoid }}` :

| Valeur     | Ce qui se passe                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`     | Rien (le défaut).                                                                                                                                  |
| `padding`  | Le padding du bas grandit de la partie du conteneur que le clavier couvre, et son contenu se dispose au-dessus. Un composeur de chat.              |
| `position` | Le conteneur remonte jusqu'à ce que son champ focalisé dégage le clavier, ou, sans champ focalisé à l'intérieur, jusqu'à ce que son bas le dégage. |

```tsx
<SafeArea flex={1}>
  <List data={messages} renderItem={...} />
  <HStack keyboard={{ avoid: 'padding' }}>
    <TextField flex={1} placeholder="Message" enterKeyHint="send" onSubmit={send} />
  </HStack>
</SafeArea>
```

Les deux mesurent le conteneur par rapport au cadre réel du clavier, où que
soit le conteneur à l'écran et quelle que soit la façon dont ses ancêtres le
mettent à l'échelle, le tournent ou le retournent. `padding` s'ajoute à
l'inset d'une SafeArea plutôt que de s'empiler dessus : le bas reçoit le plus
grand des deux, l'indicateur d'accueil ou le clavier. `position` se compose
avec le `translateY` propre de la vue. Après tout changement de disposition
pendant que le clavier est affiché (un voisin se redimensionne, du contenu
arrive), l'évitement mesure de nouveau.

## Champs de saisie

| Prop                         | Signification                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `enterKeyHint`               | L'`enterkeyhint` de HTML, le libellé de la touche Entrée : `enter`, `done`, `go`, `next`, `search` ou `send`. |
| `submitBehavior`             | Après `onSubmit` : `blurAndSubmit` (par défaut) masque le clavier ; `submit` garde le focus.                  |
| `autoFocus`                  | Focalise le champ dès qu'il est à l'écran.                                                                    |
| `ref.focus()` / `ref.blur()` | Donner ou retirer le focus depuis JavaScript.                                                                 |

**L'ordre de focus** est l'ordre d'apparition des champs dans l'arbre des
vues, comme dans le DOM : au sein du même écran ou de la même sheet, en
sautant les champs masqués et désactivés. Avec `enterKeyHint="next"` et le
`submitBehavior` par défaut, la touche Entrée déplace le focus vers le champ
suivant nativement, dans la même frame, de sorte que le clavier ne se replie
jamais pour se redéployer. Le dernier champ perd le focus. Déplacer le focus
vous-même dans `onSubmit` fonctionne toujours : votre `focus()` arrive après
le déplacement natif et l'emporte. Sur Android, cela remplace la recherche de
focus spatiale de la plateforme, de sorte que les deux plateformes parcourent
les mêmes champs. Une touche Entrée matérielle déplace une seule fois.

Les champs `multiline` et `submitBehavior="newline"` n'existent pas encore.

**Les champs contrôlés conservent ce que l'utilisateur tape.** Un événement
de changement peut atteindre JavaScript après que l'utilisateur a tapé
davantage. Lui renvoyer son texte en écho comme `value` effacerait les
caractères plus récents, donc le noyau n'envoie jamais à un champ le texte
qu'il vient de rapporter. Une valeur que l'application définit elle-même
(vider le champ, remplir une suggestion) est envoyée. Il en va de même pour la
`value` d'un Toggle.

## Vues défilantes

L'objet `keyboard` d'un Scroll ou d'une List accepte aussi :

| Champ         | Signification                                                                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dismiss`     | `none` (par défaut), `on-drag` (un glissement masque le clavier) ou `interactive` (iOS : le clavier suit le doigt ; Android n'a pas de tel clavier et le masque au glissement).                                                                                |
| `persistTaps` | Pendant que le clavier est affiché, un tap hors du champ focalisé : `never` (par défaut) masque le clavier et ne va pas plus loin ; `handled` ne le masque que si aucun pressable, bouton, interrupteur ou champ n'a pris le tap ; `always` le laisse affiché. |
| `inset`       | Voir [Évitement](#avoidance). Vrai par défaut.                                                                                                                                                                                                                 |

Avec `never`, la vue défilante défile toujours : seul un tap est retenu
avant d'atteindre ses enfants. Les deux plateformes décident de la même
manière si un tap a été pris en charge, d'après la vue sous le doigt.

## keyboard

Le clavier sous forme de signaux et d'événements, pour la logique de
l'application. La disposition n'en a pas besoin.

```tsx
import { Text, keyboard } from 'kuito';

<Text>{keyboard.visible.value ? 'typing' : ''}</Text>;
keyboard.frame.value; // { screenX, screenY, width, height } or null

// In a component, until it unmounts; elsewhere, until remove().
keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

keyboard.dismiss();
```

`visible` passe à vrai une fois que le clavier s'est affiché et à faux une
fois qu'il s'est masqué ; `frame` le suit, et chaque changement est un nouvel
objet frame. `willShow`, `didShow`, `willHide`, `didHide`, `willChangeFrame`
et `didChangeFrame` se déclenchent sur les **deux** plateformes ; sur Android,
ils proviennent du début et de la fin de l'animation d'inset. Un événement est
`{ frame, duration, easing, isEventFromThisApp }` : des coordonnées en points
à l'écran (hauteur 0 une fois masqué), une durée en millisecondes (0 quand le
clavier ne s'anime pas), et `easing` vaut `keyboard` pour la courbe propre du
système.

## Comment cela traverse la frontière

- `keyboard.dismiss()`, `focus()` et `blur()` sont des **commandes** : des
  instructions ponctuelles dans la file de mutations, après les mutations de
  vues qui les précèdent. Un `focus()` juste après le changement d'état qui
  affiche un champ atteint ce champ dès qu'il existe. Voir
  [rendu natif](native-renderer.md).
- Les événements clavier sont des événements natifs de l'application
  (handle 0) nommés `keyboard.<type>` (`keyboard.didshow` plus une charge utile
  plate), dispatchés comme ceux d'une vue (voir [événements](events.md)). Un
  événement que personne n'écoute est abandonné.
