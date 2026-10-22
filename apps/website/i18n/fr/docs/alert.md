# alert et prompt

Les alertes natives sous forme de promesses : `UIAlertController` sur iOS, une boîte de dialogue Material sur
Android. `prompt()` demande du texte sur les deux plateformes.

```tsx
import { alert, prompt } from 'kuito';

const remove = { text: 'Delete', style: 'destructive' } as const;
const picked = await alert({
  title: 'Delete episode?',
  message: 'It leaves your downloads.',
  buttons: [{ text: 'Cancel', style: 'cancel' }, remove],
});

if (picked === remove) await removeEpisode(episode);

const answer = await prompt({ title: 'Rename list' });

if (answer?.button.text === 'OK') rename(list, answer.value);
```

## `alert(options)`

Affiche l'alerte et se résout avec le bouton choisi par l'utilisateur, le même
objet que celui contenu dans `buttons`, ou `null` quand l'alerte a été fermée sans en choisir un.
Sans `buttons`, un seul bouton OK.

| Champ du bouton | Effet                                                              |
| --------------- | ------------------------------------------------------------------ |
| `text`          | Le libellé.                                                        |
| `style`         | `default`, `cancel` ou `destructive` (rouge). Au plus un `cancel`. |
| `preferred`     | iOS : le bouton que la touche Retour choisit, en gras.             |

| Option               | Effet                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| `title`, `message`   | Le texte de l'alerte.                                                       |
| `buttons`            | Les boutons, dans l'ordre.                                                  |
| `cancelable`         | Android : Retour ou un appui à l'extérieur ferme l'alerte. Faux par défaut. |
| `userInterfaceStyle` | iOS : `light` ou `dark` quelle que soit l'apparence de l'application.       |

Deux boutons `cancel` rejettent avec une `TypeError` avant que quoi que ce soit s'affiche : UIKit lève une erreur
dans ce cas. Android place les boutons comme le fait React Native : le dernier est positif, celui
d'avant négatif, un troisième neutre, et au-delà de trois l'appel échoue avec
`ERR_ARGUMENT`. Un bouton `destructive` est dessiné dans la couleur d'erreur du thème.

## `prompt(options)`

Une alerte avec des champs de texte. Elle prend les options d'`alert`, avec Annuler et OK comme
boutons par défaut, et se résout en `{ button, value }` : le bouton choisi et
ce que l'utilisateur a saisi, ou `null` en cas de fermeture.

| `type`           | Champs                                                         | `value`               |
| ---------------- | -------------------------------------------------------------- | --------------------- |
| `plain-text`     | un seul (par défaut)                                           | le texte              |
| `secure-text`    | un seul, masqué                                                | le texte              |
| `login-password` | un identifiant, avec `defaultValue`, et un mot de passe masqué | `{ login, password }` |

`keyboardType` vaut `default`, `email-address`, `numeric`, `phone-pad`,
`number-pad`, `decimal-pad` ou `url`. Sur Android les champs sont des champs de texte Material
dans la boîte de dialogue, le clavier s'ouvre avec elle, et Terminé sur le dernier champ
presse le dernier bouton, que le clavier peut recouvrir sur un petit écran.

Un rechargement ferme les alertes encore ouvertes ; leurs promesses ne se règlent jamais.
