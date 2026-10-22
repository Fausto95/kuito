# Clavier

Le côté natif suit le clavier logiciel et garde les champs de saisie hors de son chemin de lui-même, à l'intérieur de l'animation du clavier. JavaScript n'est pas sur ce chemin, donc rien n'attend un aller-retour et rien ne devine un décalage.

## Évitement

Les vues défilantes et les listes le font par défaut. Pendant que le clavier couvre une partie d'un Scroll ou d'une List verticale, son contenu est décalé de cette partie, donc tout peut encore défiler jusqu'à l'écran, et un champ focalisé à l'intérieur remonte jusqu'à dégager le clavier. Désactivez-le avec `keyboard={{ inset: false }}`.

N'importe quel conteneur peut l'éviter avec `keyboard={{ avoid }}` :

| Valeur     | Ce qui se passe                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`     | Rien (le défaut).                                                                                                                                  |
| `padding`  | Le padding du bas grandit de la partie du conteneur que le clavier couvre, et son contenu se dispose au-dessus. Un composeur de chat.              |
| `position` | Le conteneur remonte jusqu'à ce que son champ focalisé dégage le clavier, ou, sans champ focalisé à l'intérieur, jusqu'à ce que son bas le dégage. |

```tsx
<SafeArea flex={1}>
  <List data={messages} renderItem={renderMessage} />
  <HStack keyboard={{ avoid: 'padding' }}>
    <TextField flex={1} placeholder="Message" enterKeyHint="send" onSubmit={send} />
  </HStack>
</SafeArea>
```

`padding` s'ajoute à la marge d'un SafeArea au lieu de s'empiler dessus : le bas reçoit le plus grand des deux, l'indicateur d'accueil ou le clavier. Après tout changement de mise en page pendant que le clavier est affiché, l'évitement mesure de nouveau.

## Champs de saisie

| Prop                         | Signification                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `enterKeyHint`               | Le libellé de la touche Entrée : `enter`, `done`, `go`, `next`, `search` ou `send`.          |
| `submitBehavior`             | Après `onSubmit` : `blurAndSubmit` (par défaut) masque le clavier ; `submit` garde le focus. |
| `autoFocus`                  | Focalise le champ dès qu'il est à l'écran.                                                   |
| `ref.focus()` / `ref.blur()` | Donner ou retirer le focus depuis JavaScript.                                                |

L'ordre de focus est l'ordre d'apparition des champs dans l'arbre de vues, en sautant les champs masqués et désactivés. Avec `enterKeyHint="next"` et le `submitBehavior` par défaut, la touche Entrée passe le focus au champ suivant nativement, donc le clavier ne descend jamais pour remonter. Le dernier champ perd le focus. Les champs `multiline` et `submitBehavior="newline"` n'existent pas encore.

Les champs contrôlés gardent ce que l'utilisateur saisit : le noyau n'envoie jamais à un champ le texte qu'il vient de signaler. Une valeur que l'app définit elle-même (vider le champ, remplir une suggestion) est envoyée.

## Vues défilantes

L'objet `keyboard` d'un Scroll ou d'une List accepte aussi :

- `dismiss` : `none` (par défaut), `on-drag` (un glissement masque le clavier) ou `interactive` (iOS : le clavier suit le doigt ; Android le masque au glissement).
- `persistTaps` : pendant que le clavier est affiché, un tap hors du champ focalisé : `never` (par défaut) masque le clavier et ne va pas plus loin ; `handled` ne le masque que si aucun pressable, bouton, interrupteur ou champ n'a pris le tap ; `always` le laisse affiché.
- `inset` : voir Évitement. Vrai par défaut.

## keyboard

Le clavier en signaux et événements, pour la logique de l'app. La mise en page n'en a pas besoin.

```tsx
import { Text, keyboard } from 'kuito';

<Text>{keyboard.visible.value ? 'typing' : ''}</Text>;
keyboard.frame.value; // { screenX, screenY, width, height } or null

// In a component, until it unmounts; elsewhere, until remove().
keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

keyboard.dismiss();
```

`visible` passe à true une fois le clavier affiché et à false une fois masqué ; `frame` le suit. `willShow`, `didShow`, `willHide`, `didHide`, `willChangeFrame` et `didChangeFrame` se déclenchent sur les deux plateformes. Un événement est `{ frame, duration, easing, isEventFromThisApp }` : coordonnées en points à l'écran, durée en millisecondes, et `easing` vaut `keyboard` pour la courbe propre du système.

## En profondeur

[Clavier](../../../../docs/keyboard.md) couvre comment l'évitement mesure contre le cadre réel du clavier, ce qui remplace la recherche de focus d'Android, et comment les commandes et les événements clavier franchissent la frontière native.
