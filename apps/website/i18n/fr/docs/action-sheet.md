# actionSheet

Une liste d'actions, sous forme de promesse, sur les deux plateformes :
la feuille d'actions d'`UIAlertController` sur iOS, une bottom sheet Material sur
Android.

```tsx
import { Pressable, actionSheet } from 'kuito';

<Pressable
  onPress={async (event) => {
    const index = await actionSheet({
      options: ['Share', 'Add to list', 'Delete', 'Cancel'],
      cancelButtonIndex: 3,
      destructiveButtonIndex: 2,
      title: 'Episode 4',
      anchor: { x: event.pageX ?? 0, y: event.pageY ?? 0 },
    });

    if (index === 2) remove(episode);
  }}
/>;
```

`actionSheet(options)` se résout avec l'index de l'option choisie. Fermer
la feuille, par un appui à l'extérieur, Retour ou un balayage, résout `cancelButtonIndex`, ou
`null` s'il n'y en a pas.

| Option                   | Effet                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `options`                | Les libellés, au moins un.                                                                |
| `cancelButtonIndex`      | Affiché à part : en bas sur iPhone et Android, masqué dans un popover sur iPad.           |
| `destructiveButtonIndex` | Un index ou plusieurs ; dessinés en rouge.                                                |
| `disabledButtonIndices`  | Affichés estompés ; ils ne peuvent pas être choisis.                                      |
| `title`, `message`       | Au-dessus des options.                                                                    |
| `tintColor`              | La couleur des options : une couleur hexadécimale. Le design d'iOS 26 l'ignore.           |
| `anchor`                 | `{ x, y }` en points de fenêtre, comme les `pageX` et `pageY` d'un événement de pression. |
| `userInterfaceStyle`     | iOS : `light` ou `dark` quelle que soit l'apparence de l'application.                     |

Un index hors de `options` rejette avec une `RangeError` avant que quoi que ce soit s'affiche.

## iPad et l'ancre

iPad affiche la feuille sous forme de popover. Avec une `anchor`, il pointe vers elle ; sans
ancre, il se place au milieu de la fenêtre sans flèche. Depuis iOS 26, une ancre
produit aussi un popover sur iPhone ; sans ancre, iPhone garde la feuille en
bas. Un popover se ferme sur un appui à l'extérieur, ce qui résout l'index d'annulation,
ou `null` quand il n'y en a pas. L'ancre est un emplacement, pas une vue : elle ne nécessite
aucune recherche de vue et pointe là où l'utilisateur a touché.

Android liste les options dans l'ordre, avec l'option d'annulation en dernier sous un
séparateur, et résout `null` quand la feuille est fermée sans en choisir une. Un
rechargement ferme les feuilles encore ouvertes.
