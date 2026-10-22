# Polices

`fontFamily` nomme une famille système, une police que l'app embarque, ou une qu'elle charge à l'exécution. `fontWeight` et `fontStyle` choisissent parmi les fichiers de la famille comme CSS le fait. Une famille qui n'est rien de tout cela est une erreur qui la nomme, jamais un repli silencieux sur la police système.

```tsx
<Text fontFamily="Pacifico">Bundled</Text>
<Text fontFamily="Lato" fontWeight="bold">Loaded at run time</Text>
```

## Embarquer des polices

Listez les fichiers .ttf et .otf sous `fonts` dans `kuito.config.ts`, relativement à lui :

```ts
export default {
  // ...
  fonts: [
    './assets/fonts/Pacifico-Regular.ttf',
    './assets/fonts/Lato-Regular.ttf',
    './assets/fonts/Lato-Bold.ttf',
    // A file whose own tables name its face wrongly:
    { file: './assets/fonts/LatoHeavy.otf', family: 'Lato', weight: 900, style: 'italic' },
  ],
} satisfies KuitoConfig;
```

La famille, la graisse et le style de chaque fichier viennent du fichier lui-même. Donc `Lato-Regular.ttf` et `Lato-Bold.ttf` sont tous deux `Lato`, en 400 et 700, et `fontFamily: 'Lato'` avec `fontWeight: 'bold'` dessine le fichier bold. Un objet définit à la place n'importe lequel de `family`, `weight` (`normal`, `bold` ou `100`-`900`) et `style` (`normal` ou `italic`).

Le `fonts` d'un environnement remplace toute la liste. La CLI vérifie la liste de chaque environnement : un chemin qui n'est pas .ttf ni .otf, deux fichiers d'un même nom, une collection `.ttc`, et deux fichiers de mêmes famille, graisse et style échouent chacun en nommant la clé.

## Charger des polices à l'exécution

`fonts.load` enregistre des fichiers de polices que l'app a sur disque, typiquement ceux qu'elle a téléchargés avec [fileSystem](../../../../docs/file-system.md). Chaque clé est la famille que `fontFamily` utilisera ; un fichier sans graisse ni style est 400 et normal.

```tsx
import { fileSystem, fonts } from 'kuito';

const regular = fileSystem.cache + 'Lato-Regular.ttf';
const bold = fileSystem.cache + 'Lato-Bold.ttf';

await fileSystem.download(LATO_REGULAR_URL, regular);
await fileSystem.download(LATO_BOLD_URL, bold);
await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });

fonts.loaded('Lato'); // true: bundled or loaded
```

Les URI doivent être `file://` ; une URL distante, une famille vide, une liste vide, ou une graisse ou un style hors de ceux ci-dessus est une `TypeError`. Un fichier que la plateforme ne peut pas charger rejette avec `ERR_FONT`, un fichier manquant avec `ERR_NOT_FOUND`. Un enregistrement dure jusqu'à la sortie de l'app, à travers les rechargements. Charger de nouveau la graisse et le style d'une famille remplace cette face. Attendez `load` avant de rendre du texte dans la famille : jusque-là, la famille est manquante.

## Comment fontFamily se résout

Pour une famille embarquée ou chargée, la face est choisie comme CSS Fonts 4 apparie les polices :

1. Style : les faces du `fontStyle` demandé, ou toutes si la famille n'en a aucune dans ce style. Rien n'est incliné ni épaissi synthétiquement.
2. Graisse : le `fontWeight` demandé si la famille l'a. Sinon, pour les graisses plus légères, les faces plus légères d'abord ; pour les plus lourdes, les faces plus lourdes d'abord. Donc une famille en 400 et 700 dessine `fontWeight: 600` en bold et `300` en regular.

Une famille que le registre n'a pas passe au système : n'importe quelle famille ou nom de police qu'iOS connaît (`Menlo`, `Georgia-Bold`), ou une famille système sur Android (`serif`, `monospace`, `sans-serif-condensed`). Tout le reste échoue à la prop :

```text
Unsupported: UILabel.fontFamily: no font family "Inter": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)
```

Les polices variables dessinent leur instance par défaut ; leurs axes ne sont pas encore mappés sur `fontWeight`.

## En profondeur

[Polices](../../../../docs/fonts.md) couvre comment la face d'un fichier est lue depuis ses tables, où les fichiers embarqués atterrissent dans chaque shell, sur quel thread `load` et `loaded` s'exécutent, et l'ordre complet d'appariement des graisses.
