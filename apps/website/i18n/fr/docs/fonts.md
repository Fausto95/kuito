# fonts

`fontFamily` nomme une famille système, une police que l'application embarque,
ou une qu'elle charge à l'exécution. `fontWeight` et `fontStyle` choisissent
parmi les fichiers de la famille comme le fait CSS. Une famille qui n'est
aucune de celles-ci est une erreur qui la nomme, jamais un repli silencieux
vers la police système.

```tsx
<Text fontFamily="Pacifico">Bundled</Text>
<Text fontFamily="Lato" fontWeight="bold">Loaded at run time</Text>
```

## Embarquer des polices

Listez les fichiers .ttf et .otf sous `fonts` dans `kuito.config.ts`,
relativement à celui-ci :

```ts
export default {
  // …
  fonts: [
    './assets/fonts/Pacifico-Regular.ttf',
    './assets/fonts/Lato-Regular.ttf',
    './assets/fonts/Lato-Bold.ttf',
    // A file whose own tables name its face wrongly:
    { file: './assets/fonts/LatoHeavy.otf', family: 'Lato', weight: 900, style: 'italic' },
  ],
  environments: {
    staging: { fonts: ['./assets/fonts/Staging.ttf'] },
  },
} satisfies KuitoConfig;
```

La famille, la graisse et le style de chaque fichier proviennent du fichier
lui-même : sa famille typographique (name ID 16, sinon la famille, ID 1), sa
classe de graisse OS/2 et le bit italique d'OS/2. Ainsi `Lato-Regular.ttf` et
`Lato-Bold.ttf` sont tous deux `Lato`, à 400 et 700, et `fontFamily: 'Lato'`
avec `fontWeight: 'bold'` dessine le fichier gras. Un objet définit à la
place n'importe lequel de `family`, `weight` (`normal`, `bold` ou `100`–`900`)
et `style` (`normal` ou `italic`).

Le `fonts` d'un environnement remplace la liste entière. La CLI vérifie la
liste de chaque environnement : un chemin qui n'est ni .ttf ni .otf, une clé
de police qu'elle ne connaît pas, deux fichiers portant un même nom, un
fichier qui n'est pas une police TrueType ou OpenType unique (une collection
`.ttc` est une erreur), et deux fichiers de mêmes famille, graisse et style
échouent chacun en nommant la clé.

À chaque build (`src/cli/fonts.ts`), les fichiers et un manifeste,
`fonts.json`, de la face que chacun représente sont placés dans les shells :

- **iOS** : `.kuito/ios/fonts/`, un dossier du bundle de l'application, avec
  chaque fichier listé dans `UIAppFonts` pour qu'iOS les enregistre au
  lancement.
- **Android** : `.kuito/android/assets/fonts/`, chargé avec
  `Typeface.createFromAsset`.

## Charger des polices à l'exécution

`fonts.load` enregistre des fichiers de police que l'application a sur
disque, typiquement ceux qu'elle a téléchargés avec
[fileSystem](file-system.md). Chaque clé est la famille que `fontFamily`
utilisera ; un fichier sans graisse ni style est 400 et normal.

```tsx
import { fileSystem, fonts } from 'kuito';

const regular = fileSystem.cache + 'Lato-Regular.ttf';
const bold = fileSystem.cache + 'Lato-Bold.ttf';

await fileSystem.download(LATO_REGULAR_URL, regular);
await fileSystem.download(LATO_BOLD_URL, bold);
await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });

fonts.loaded('Lato'); // true: bundled or loaded
```

| Fonction         | S'exécute sur                      | Notes                                                  |
| ---------------- | ---------------------------------- | ------------------------------------------------------ |
| `load(fonts)`    | le thread d'arrière-plan du module | `{ Family: uri \| { uri, weight, style } \| [...] }`   |
| `loaded(family)` | le thread JS, de manière synchrone | si une police embarquée ou chargée porte cette famille |

Les URI doivent être en `file://` ; une URL distante, une famille vide, une
liste vide, ou une graisse ou un style hors de ceux ci-dessus est une
`TypeError` avant que quoi que ce soit ne traverse. Un fichier que la
plateforme ne peut pas charger rejette avec `ERR_FONT`, un fichier manquant
avec `ERR_NOT_FOUND`.

iOS enregistre chaque fichier pour le processus avec
`CTFontManagerRegisterFontsForURL` ; Android crée un `Typeface` avec
`Typeface.createFromFile`. Un enregistrement dure jusqu'à la sortie de
l'application, à travers les rechargements. Charger de nouveau la graisse et
le style d'une famille remplace cette face. Attendez `load` avant de rendre du
texte dans la famille : jusque-là, la famille est absente.

## Comment `fontFamily` se résout

Chaque renderer conserve un seul registre de familles (`KuitoFonts` sur les
deux plateformes) : le manifeste embarqué, lu à la première utilisation, plus
ce que `fonts.load` a ajouté. Pour une famille qui s'y trouve, la face est
choisie de la manière dont CSS Fonts 4 apparie les polices :

1. **Style** : les faces du `fontStyle` demandé, ou toutes si la famille n'en
   a aucune dans ce style. Rien n'est incliné ni engraissé synthétiquement.
2. **Graisse** : le `fontWeight` demandé si la famille l'a. Sinon, pour 400 et
   500, les faces plus lourdes jusqu'à 500, puis les plus légères, puis les
   plus lourdes ; pour les graisses plus légères, les faces plus légères
   d'abord ; pour les graisses plus lourdes, les faces plus lourdes d'abord.
   Ainsi une famille de 400 et 700 dessine `fontWeight: 600` en gras et `300`
   en regular.

Une famille que le registre n'a pas retombe sur le système : toute famille ou
nom de police qu'iOS connaît (`Menlo`, `Georgia-Bold`), ou une famille
système sur Android (`serif`, `monospace`, `sans-serif-condensed`), engraissée
et inclinée par le système comme auparavant. Tout le reste échoue au niveau de
la prop :

```text
Unsupported: UILabel.fontFamily: no font family "Inter": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)
```

Les polices variables dessinent leur instance par défaut ; leurs axes ne sont
pas encore mappés sur `fontWeight`.
