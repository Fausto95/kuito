# Styles natifs

Kuito compile les styles à la construction en propriétés natives. Les modules
`.css` et `styles({...})` partagent une même table de propriétés
(`src/style/properties.ts`) : le CSS utilise les noms en kebab-case, `styles()`
le camelCase, et tous deux acceptent les mêmes valeurs, chaînes raccourcies
comprises. Rien n'analyse de CSS sur l'appareil.

```css
.card {
  padding: 20px 24px;
  border: 1px solid #ffffff22;
  border-radius: 20px;
  box-shadow: 0 12px 32px #00000066;
  background: linear-gradient(135deg, #1e3a5f, #0b1220);
  transition:
    transform 400ms spring(14, 180),
    opacity 250ms ease-out;
}
```

```tsx
const sheet = styles({
  card: { padding: '20px 24px', boxShadow: '0 12px 32px #00000066', fontWeight: 600 },
});
```

`styles()` initialise une `const` partout où l'on peut en déclarer une : à la
portée du module, dans le corps d'un composant, dans un bloc. La construction
remplace chaque appel par ses noms de classes et conserve une source map, si
bien que les points d'arrêt placés après une feuille restent sur leurs lignes.
Un appel à `styles()` n'importe où ailleurs est une erreur à cet appel.

Un élément reçoit ses classes par `class`, le nom CSS : des noms issus d'un
import `.css` ou de `styles()`, sous forme d'une chaîne de noms séparés par
des espaces ou d'une liste dont les entrées fausses sont ignorées. `class` est
une expression comme n'importe quelle prop : quand un signal qu'elle lit
change, la branche de la vue est planifiée à nouveau avec les nouvelles
classes, et une prop que plus aucune classe ne définit reprend sa valeur par
défaut. Une classe composée uniquement de noms d'une feuille de styles, de
chaînes et d'attributs de données littéraux (`css.card`, `[css.card, 'row']`,
`[button.base, { tone: 'warm' }]`) ne peut jamais changer, donc la construction
la transmet telle quelle et la vue ne suit rien pour elle.

```tsx
import css from './card.css';

<VStack class={[css.card, selected.value && css.selected]} />;
```

### Variantes

Les variantes d'une classe sont des règles sur ses attributs de données,
`.card[data-size=large]` dans une feuille de styles et
`variants: { <name>: { <value>: { … } } }` dans une entrée de `styles()`. Une
liste de classes les sélectionne avec un objet d'attributs de données ; une
valeur fausse n'en sélectionne aucune :

```css
.card {
  padding: 12px;
}

.card[data-size='large'] {
  padding: 24px;
}

.card[data-tone='muted'] {
  opacity: 0.6;
}
```

```tsx
const button = styles({
  base: {
    padding: '8px 16px',
    borderRadius: 8,
    variants: {
      tone: { primary: { backgroundColor: '#ff5a5f' }, ghost: { borderWidth: 1 } },
    },
  },
});

<VStack class={[css.card, { size: big.value ? 'large' : null }]} />;
<Pressable class={[button.base, { tone: tone.value }]}>...</Pressable>;
```

- Un attribut de données s'applique à chaque classe de la liste qui possède la
  variante, quelle que soit sa position dans la liste ; une variante qu'aucune
  classe de la liste ne possède, et une valeur que sa classe n'a pas, sont des
  erreurs qui nomment ce qu'elle possède.
- Une variante l'emporte sur sa classe, conditions `@media` comprises, comme le
  sélecteur plus spécifique l'emporte en CSS. Les variantes contiennent leurs
  propres blocs `@media` et `@platform`.
- Deux variantes d'une classe peuvent s'appliquer en même temps sans qu'aucune
  ne soit plus spécifique, donc deux variantes de noms différents qui
  définissent la même prop sont une erreur de construction qui nomme les deux.
  Les valeurs d'un même nom ne s'appliquent jamais ensemble et peuvent définir
  les mêmes props.
- Une règle prend un attribut de données avec une valeur
  (`.card[data-size=large]`) ; un attribut sans valeur, un attribut qui n'est
  pas `data-`, deux attributs et un attribut sans classe sont des erreurs.

### La prop `style`

Une primitive accepte aussi ses propres styles, `style={{ … }}`, avec les mêmes
propriétés camelCase et les mêmes valeurs que `styles()`. Le compilateur écrit
chaque déclaration littérale sous la forme des props natives qu'elle désigne,
donc rien n'est analysé sur l'appareil. Une déclaration dont la valeur change
doit nommer une seule prop native (`opacity`, `paddingTop`, `backgroundColor`),
qui suit alors ses signaux comme toute prop ; un raccourci avec une expression
(`border: x.value`) est une erreur de construction qui nomme les props à
définir à la place.

```tsx
<Box style={{ padding: '4px 8px', borderRadius: 12, opacity: dim.value ? 0.5 : 1 }} />
```

`style` l'emporte sur `class` pour les props que les deux définissent.
Partagez les styles avec `class` ; réservez `style` à ce dont une seule vue a
besoin.

Les longueurs acceptent `px`/`dp` (points natifs), `rem` et `em` — voir
[Unités CSS](css-units.md). Les propriétés inconnues et les valeurs non prises
en charge font échouer la construction avec le fichier, la ligne et la raison.

## Valeurs

Le compilateur lit une feuille de styles comme le fait le CSS : les chaînes et
les parenthèses contiennent `;`, `{` et `}` comme du texte
(`font-family: "A;B"`, `url(data:…)`), les commentaires peuvent se trouver
n'importe où, et une chaîne, un commentaire, un bloc ou une parenthèse non
terminés sont une erreur à la ligne où ils s'ouvrent.

- **Le dernier l'emporte.** Les déclarations s'appliquent dans l'ordre du
  source, et chaque raccourci écrit ses propriétés détaillées : `padding` les
  quatre côtés, `gap` les deux écarts, `border` la largeur et la couleur. Ainsi
  `padding: 4px; padding-top: 8px` garde les 8px en haut, et
  `padding-top: 8px; padding: 4px` les remplace, comme en CSS. Il en va de même
  entre classes : la classe la plus tardive dans `class` l'emporte.
- **Plages.** `opacity` prend une valeur de 0 à 1. Le padding, les tailles
  (`width`, `height`, `min-*`, `max-*`, `flex-basis`), les écarts,
  `border-width`, `border-radius`, `font-size`, `line-height`, les rayons
  d'ombre et le flou ne sont jamais négatifs ; les marges, les insets, les
  translations et `letter-spacing` peuvent l'être.
- **Bordures.** `border` prend une largeur, le style `solid` et une couleur,
  chacun au plus une fois et dans n'importe quel ordre
  (`border: solid red 2px`). Les autres styles sont des erreurs.

### Couleurs

Chaque couleur compile en hexadécimal, la seule notation que les deux moteurs
de rendu analysent, si bien que l'appareil ne lit jamais de syntaxe de couleur
CSS :

| Écrit                                                | Compilé                 |
| ---------------------------------------------------- | ----------------------- |
| `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`              | tel quel, en minuscules |
| une couleur CSS nommée (`white`, `rebeccapurple`, …) | `#rrggbb`               |
| `transparent`                                        | `#00000000`             |
| `rgb(255 0 0 / 50%)`, `rgba(255, 0, 0, 0.5)`         | `#ff000080`             |
| `hsl(120 100% 50%)`, `hsla(…)`                       | `#00ff00`               |
| `color(srgb 1 0.5 0 / 0.5)`                          | `#ff800080`             |

Un nom inconnu, un hexadécimal malformé, un canal hors plage et un espace
`color()` autre que `srgb` sont des erreurs. Les espaces à gamut étendu
(`display-p3`) exigent un moteur de rendu qui accepte plus que l'hexadécimal,
ce qu'aucun des deux n'a encore.

## Plateformes

Chaque plateforme reçoit son propre bundle. `platform` vaut `'ios'` ou
`'android'`, une constante que le compilateur fixe par bundle, si bien qu'une
branche pour l'autre plateforme est du code mort et quitte le bundle :

```tsx
import { platform } from 'kuito';

const back = platform === 'ios' ? 'chevron.left' : 'arrow_back';
```

Les styles se ramifient de la même façon. Un bloc `@platform` dans une feuille
de styles contient des règles (classes et jetons `:root`), et un bloc dans une
entrée de `styles()` contient des déclarations ; le bundle de l'autre
plateforme ne les voit jamais. Leurs déclarations s'appliquent là où le bloc se
trouve, donc une déclaration plus tardive l'emporte comme d'habitude :

```css
.card {
  padding: 16px;
}

@platform android {
  .card {
    padding: 12px;
  }
}
```

```tsx
const sheet = styles({
  row: { gap: 8, '@platform ios': { gap: 10 } },
});
```

Un bloc nomme une plateforme, `ios` ou `android` ; un autre nom, un bloc à
l'intérieur d'un autre `@platform`, et une déclaration hors d'une règle sont
des erreurs. Il n'y a pas de `Platform.select` à l'exécution.

## Jetons

Les propriétés personnalisées déclarées dans `:root` (ou `@tokens`) sont des
jetons : `var(--name)` est remplacé par sa valeur à la construction, y compris
dans les raccourcis. Une feuille de styles voit ses propres jetons et ceux des
feuilles de styles qu'elle `@import`e :

```css
/* tokens.css */
:root {
  font-size: 16px;
  --accent: #ff5a5f;
  --space: 12px;
}
```

```css
/* card.css */
@import './tokens.css';

.card {
  padding: var(--space);
  border: 1px solid var(--accent);
}
```

- `@import "<path>";` ou `@import url(<path>);`, avec un chemin relatif au
  fichier qui importe, avant toute règle. Les imports sont transitifs, et un
  fichier atteint par deux imports n'est lu qu'une fois.
- Un import partage les jetons et la taille de police `:root`, pas les
  classes : un composant qui utilise des classes de `tokens.css` importe ce
  module lui-même.
- Un jeton se résout dans le fichier qui le déclare : un jeton de `tokens.css`
  peut utiliser les jetons que `tokens.css` importe, jamais ceux d'un fichier
  qui l'importe. Ainsi un jeton signifie la même chose partout où il est
  utilisé.
- Déclarer deux fois un jeton dans une même portée est une erreur, que ce soit
  dans un fichier ou dans deux fichiers importés ; de même pour un import
  circulaire, un fichier manquant, et une URL ou un chemin absolu. Chaque
  erreur nomme le fichier et la ligne.
- Live Patch surveille chaque fichier importé : modifier `tokens.css`
  recompile chaque feuille de styles qui l'utilise.
- Une application a une seule taille de police `:root`. Déclarez-la dans une
  feuille de styles et `@import`ez celle-ci ; une seconde feuille de styles du
  bundle qui déclare la sienne est une erreur qui nomme les deux lignes.

Un bloc `:root` à l'intérieur de `@media (prefers-color-scheme: dark)` (ou
`light`) redéfinit les jetons pour ce schéma, dans le fichier qui les
déclare :

```css
:root {
  --surface: #ffffff;
  --ink: #111114;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface: #121218;
  }
}
```

Une prop dont la valeur diffère entre les schémas, par un jeton ou un jeton
construit à partir d'un autre, compile en un marqueur, et la feuille de styles
installe deux manifestes statiques des valeurs qu'il représente. Le noyau
résout un marqueur à partir du schéma de couleurs (`appearance.colorScheme`,
l'absence de préférence valant clair), si bien qu'un changement de thème ne
renvoie que les props qui le suivent, en un seul commit, sans rien planifier à
nouveau. Un jeton que les schémas partagent reste une constante. Seul le
schéma de couleurs redéfinit les jetons : un bloc `:root` sous toute autre
requête est une erreur, de même qu'un jeton d'un schéma sans valeur hors de
`@media`.

## Conditions

Les blocs `@media` contiennent des règles dont les déclarations s'appliquent
tant que leur requête est satisfaite. Il n'y a pas de cascade à l'exécution :
chaque bloc compile en un jeu de props alternatif de ses classes, et le noyau
choisit selon l'état du système, en n'envoyant que les props qui diffèrent
quand il change.

```css
.grid {
  padding: 12px;
  flex-direction: column;
}

@media (width-class: expanded) {
  .grid {
    flex-direction: row;
  }
}

@media (min-width: 600px) and (prefers-reduced-motion: no-preference) {
  .grid {
    padding: 24px;
  }
}
```

```tsx
const sheet = styles({
  row: { gap: 8, '@media (min-width: 600px)': { gap: 16 } },
});
```

| Caractéristique          | Valeurs                         | Suit                                                                  |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------- |
| `min-width`, `max-width` | une longueur en `px`            | la largeur de la fenêtre, en points (iOS) ou en dp (Android)          |
| `width-class`            | `compact`, `medium`, `expanded` | `window.widthClass` : moins de 600, moins de 840, et au-delà          |
| `prefers-color-scheme`   | `light`, `dark`                 | `appearance.colorScheme` ; l'absence de préférence vaut clair         |
| `prefers-reduced-motion` | `reduce`, `no-preference`       | `accessibility.reduceMotion` ; une valeur inconnue vaut no-preference |

- Une requête est une suite de caractéristiques entre parenthèses jointes par
  `and`. Les types de média (`screen`), `not`, `or`, les listes et les blocs
  `@media` imbriqués sont des erreurs ; de même qu'une caractéristique nommée
  deux fois et une caractéristique ou une valeur inconnue.
- Les déclarations d'une condition l'emportent sur celles de sa classe tant
  qu'elle est satisfaite, quel que soit leur ordre ; une classe plus tardive
  dans `class` l'emporte sur les deux. Les props propres d'une vue et `style`
  l'emportent sur toute classe.
- Une prop que seule une condition définit reprend sa valeur par défaut quand
  la condition cesse d'être satisfaite.
- `font-size` ne peut pas changer avec une condition ou un thème : les enfants
  héritent de la taille avec laquelle leur parent est planifié. Donnez à chaque
  cas sa propre classe.
- Une vue ne suit que l'état du système que lisent les props de ses classes :
  une classe sans jeton ni condition ne lui fait rien suivre.
- Les blocs `@platform` sont décidés par bundle ([plateformes](#platforms)) et
  peuvent contenir des blocs `@media`, et inversement.

## Propriétés

<!-- style properties: generated from src/style/properties.ts -->

| CSS                                                                                                                                                         | Props natives                                                                                                                                                  | Valeurs                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `background`                                                                                                                                                | `backgroundColor`, `backgroundGradient`                                                                                                                        | couleur, ou `linear-gradient(<angle> \| to <side>, color, color, …)`                       |
| `background-color`, `color`                                                                                                                                 | idem, en camelCase                                                                                                                                             | couleur ([couleurs](#colors))                                                              |
| `opacity`                                                                                                                                                   | idem                                                                                                                                                           | 0–1                                                                                        |
| `padding`                                                                                                                                                   | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                                                                                   | 1 à 4 longueurs non négatives, comme en CSS                                                |
| `padding-top`, `padding-right`, `padding-bottom`, `padding-left`, `padding-horizontal`, `padding-vertical`                                                  | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                                                                                   | longueur non négative                                                                      |
| `gap`, `row-gap`, `column-gap`, `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height`, `aspect-ratio`                                     | `rowGap`, `columnGap`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `aspectRatio`                                                      | voir [Mise en page](#layout)                                                               |
| `overflow`, `direction`, `box-sizing`, `position`, `top`, `right`, `bottom`, `left`, `margin-top`, `margin-right`, `margin-bottom`, `margin-left`           | idem, en camelCase                                                                                                                                             | voir [Mise en page](#layout)                                                               |
| `flex-direction`, `flex-wrap`, `flex-grow`, `flex-shrink`, `flex-basis`, `flex-line-count`, `align-items`, `align-self`, `align-content`, `justify-content` | idem, en camelCase                                                                                                                                             | voir [Mise en page](#layout)                                                               |
| `inset`, `margin`, `margin-horizontal`, `margin-vertical`, `flex`, `flex-flow`                                                                              | `top`, `right`, `bottom`, `left`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`, `flexGrow`, `flexShrink`, `flexBasis`, `flexDirection`, `flexWrap` | voir [Mise en page](#layout)                                                               |
| `display`, `hidden`                                                                                                                                         | `hidden`                                                                                                                                                       | `none`, `flex` ; `hidden` prend `true` ou `false`                                          |
| `border`                                                                                                                                                    | `borderWidth`, `borderColor`                                                                                                                                   | `<width> solid <color>`, dans n'importe quel ordre, chacun au plus une fois ; ou `none`    |
| `border-radius`, `corner-radius`, `border-width`, `border-color`                                                                                            | `borderRadius`, `borderWidth`, `borderColor`                                                                                                                   | longueur non négative / couleur                                                            |
| `box-shadow`                                                                                                                                                | `shadowOffsetX`, `shadowOffsetY`, `shadowRadius`, `shadowColor`                                                                                                | `<x> <y> [blur] <color>` ; le flou est divisé par deux pour donner le rayon natif          |
| `shadow-color`, `shadow-radius`, `shadow-offset-x`, `shadow-offset-y`                                                                                       | idem, en camelCase                                                                                                                                             | couleur / longueur                                                                         |
| `font-size`, `letter-spacing`                                                                                                                               | idem, en camelCase                                                                                                                                             | longueur                                                                                   |
| `line-height`                                                                                                                                               | idem, en camelCase                                                                                                                                             | longueur, ou un multiple sans unité de la taille de police                                 |
| `font-weight`                                                                                                                                               | idem, en camelCase                                                                                                                                             | `normal`, `bold`, `100`–`900`                                                              |
| `font-family`, `font-style`                                                                                                                                 | idem, en camelCase                                                                                                                                             | une famille système, embarquée ou chargée ([polices](fonts.md)) ; `normal`, `italic`       |
| `text-align`, `text-transform`                                                                                                                              | idem, en camelCase                                                                                                                                             | `left`/`center`/`right` ; `none`/`uppercase`/`lowercase`/`capitalize`                      |
| `-webkit-line-clamp`, `number-of-lines`                                                                                                                     | `lineClamp`                                                                                                                                                    | nombre entier (`0` = illimité)                                                             |
| `transform`                                                                                                                                                 | `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`                                                                                              | `translate()`, `translateX/Y()`, `scale()`, `scaleX/Y()`, `rotate(deg\|rad\|turn)`, `none` |
| `translate-x`, `translate-y`, `scale`, `scale-x`, `scale-y`, `rotate`                                                                                       | idem, en camelCase                                                                                                                                             | longueur ; un nombre ; un angle (`deg`, `rad`, `turn`)                                     |
| `transition`                                                                                                                                                | idem                                                                                                                                                           | voir [Transitions](#transitions)                                                           |

<!-- end of generated style properties -->

## Mise en page

Kuito met en page avec le flexbox CSS et le positionnement absolu. Le moteur
(`native/shared/layout`) est un portage C++ de l'algorithme flexbox de
[Taffy](https://github.com/DioxusLabs/taffy), sous licence MIT et crédité dans
`native/shared/layout/LICENSE-taffy`. Il exécute la suite de conformité de
Taffy elle-même : 2 656 cas dont les mises en page attendues proviennent de
Chrome (`test/flex-conformance.test.ts`). UIKit et Android Views ne reçoivent
que les cadres qu'il calcule, si bien qu'un arbre se met en page à l'identique
sur iOS et Android.

La mise en page est incrémentale, comme dans Taffy : les résultats persistent
entre les passes, et un changement ne remet en page que le nœud qu'il touche
et les ancêtres de ce nœud. Les props de mise en page, les insets et les
modifications de l'arbre marquent leur nœud ; de même pour les props qui
peuvent changer la taille du contenu d'un texte, d'un contrôle ou d'une liste
(texte, police, placeholder, lignes), déclarées dans leurs tables de props. Une
prop de peinture (couleur, opacité, alignement) laisse la mise en page telle
quelle, et le texte d'un frère n'est jamais mesuré à nouveau parce qu'une
image est arrivée ailleurs. Un sous-arbre masqué se met en page à zéro, comme
dans Taffy, mais ses textes conservent leurs mesures, si bien que réafficher un
écran ne demande à la plateforme de rien mesurer.

Chaque nœud conserve un ensemble fixe de résultats en cache, les emplacements
de Taffy, si bien qu'une zone d'affichage qui change à chaque passe (un
redimensionnement, le clavier) remplace des entrées au lieu d'en ajouter.

Chaque conteneur est un conteneur flex, et le dimensionnement suit exactement
le CSS :

| Propriété                                                          | Valeurs                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `flex-direction`, `flex-wrap`, `flex-flow`                         | `row`, `column`, `row-reverse`, `column-reverse` ; `nowrap`, `wrap`, `wrap-reverse`, `balance`                                       |
| `flex`, `flex-grow`, `flex-shrink`, `flex-basis`                   | comme en CSS (`flex: 1` vaut `1 1 0%`, `flex: none`, `flex: 2 0 120px`) ; en JSX, `flex={n}` est celui de React Native               |
| `justify-content`, `align-content`                                 | `flex-start`, `flex-end`, `start`, `end`, `center`, `stretch`, `space-between`, `space-around`, `space-evenly`, avec `safe`/`unsafe` |
| `align-items`, `align-self`                                        | `flex-start`, `flex-end`, `start`, `end`, `self-start`, `self-end`, `center`, `baseline`, `stretch`, avec `safe`/`unsafe`            |
| `gap`, `row-gap`, `column-gap`                                     | longueur ou pourcentage ; `gap: <row> <column>`                                                                                      |
| `width`, `height`, `min-*`, `max-*`                                | longueur, pourcentage, `auto`, `min-content`, `max-content`, `fit-content`, `fit-content(<length>)`, `stretch`                       |
| `aspect-ratio`                                                     | `16 / 9` ou un nombre                                                                                                                |
| `margin` (1 à 4 valeurs), `margin-*`, `margin-horizontal/vertical` | longueur, pourcentage ou `auto` (les marges auto absorbent l'espace libre, comme en CSS)                                             |
| `position`, `top`, `right`, `bottom`, `left`, `inset`              | `relative` (les insets décalent la boîte) ou `absolute` ; longueur, pourcentage ou `auto`                                            |
| `padding`, `border-width`                                          | rétrécissent la boîte de contenu ; les pourcentages se résolvent par rapport à la largeur du bloc conteneur                          |
| `box-sizing`                                                       | `border-box` (par défaut) ou `content-box`                                                                                           |
| `overflow`                                                         | `visible`, `hidden`, `clip`, `scroll` ; hidden et scroll rognent aussi                                                               |
| `direction`                                                        | `ltr` ou `rtl` : les lignes vont de droite à gauche, et start/end s'inversent                                                        |
| `flex-line-count`                                                  | le nombre minimal de lignes qu'utilise un conteneur à retour à la ligne (CSS Flexbox 2)                                              |

Ce qui découle du CSS et surprend ceux qui viennent de React Native :

- `flex-shrink` vaut 1 par défaut, donc un élément avec une taille explicite
  rétrécit quand même quand sa ligne déborde. Donnez-lui `flex-shrink: 0` pour
  la conserver.
- La taille minimale automatique d'un élément flex est son contenu : un texte
  ne rétrécit pas en dessous de son mot le plus long, un conteneur pas en
  dessous de ses enfants. `overflow: hidden` (ou `min-width: 0`) lui permet de
  rétrécir davantage.
- `align-items: stretch` n'étire que les enfants sans taille transversale
  explicite.
- Les pourcentages se résolvent par rapport au bloc conteneur ; le padding et
  les marges par rapport à sa largeur, sur chaque côté.

Kuito diffère du web en un point : comme React Native, chaque vue est le bloc
conteneur de ses enfants en `position: absolute`, si bien que les insets sont
relatifs à la boîte de padding du parent, quelle que soit la `position` du
parent lui-même.

Chaque sorte de vue part de valeurs par défaut :

| Vue                           | Direction | Valeurs par défaut                                                                    |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `VStack`, `Box`, `Pressable`  | column    |                                                                                       |
| `HStack`                      | row       | `align-items: center`                                                                 |
| `Scroll`                      | column    | `flex-grow: 1` et un conteneur de défilement : remplit l'espace laissé par son parent |
| `Scroll horizontal`           | row       | idem, en défilant latéralement                                                        |
| `Spacer`                      | —         | `flex-grow: 1` : prend l'espace libre le long de son parent                           |
| `Divider`                     | —         | au moins 1pt de haut                                                                  |
| `Button`, `Toggle`, `Spinner` | —         | `flex-shrink: 0` : les contrôles débordent plutôt que de s'écraser                    |

Une vue de défilement met en page ses enfants sans limite le long de son axe
et fait défiler le débordement. `display: none` (`hidden`) retire une vue de la
mise en page. Les cadres sont arrondis aux pixels de l'appareil, si bien que
des voisins ne se séparent ni ne se chevauchent jamais.

Les vues racines s'empilent en une colonne qui remplit tout l'écran, bord à
bord sur les deux plateformes comme dans React Native : le contenu peut se
dessiner sous la barre d'état, l'encoche et l'indicateur d'accueil. Enveloppez
le contenu dans un `SafeArea` pour l'en tenir à l'écart. Un Scroll racine prend
toute la hauteur.

Non pris en charge : la mise en page en bloc et en grille, les flottants, les
modes d'écriture verticaux, et le positionnement statique du CSS (une boîte
absolue appartient toujours à son parent).

## Transitions

`transition` liste des propriétés avec une durée, une fonction de temporisation
et un délai, comme en CSS :

```css
transition:
  transform 400ms spring(14, 180),
  opacity 250ms ease-out 50ms;
```

- Propriétés animables : `opacity`, `background-color`, `transform` (toutes
  les props de transformation) et `all`.
- Fonctions de temporisation : `linear`, `ease`, `ease-in`, `ease-out`,
  `ease-in-out`, `cubic-bezier(x1, y1, x2, y2)`, et
  `spring(damping, stiffness[, mass])` (un ressort ignore la durée ; son second
  temps est le délai).
- Les animations s'exécutent sur le thread UI, dans l'exécuteur de valeurs de
  mouvement ([Mouvement](motion.md#animated-props-animate-and-transition)) ;
  JavaScript n'envoie que les valeurs cibles.

## Notes par plateforme

Les deux moteurs de rendu appliquent chaque propriété ci-dessus ; là où une
plateforme ne peut pas reproduire exactement le CSS, elle se dégrade comme
suit.

- **Rognage.** Comme en CSS, les enfants se dessinent hors de leur parent sauf
  avec `overflow: hidden` (le rognage par défaut d'Android est désactivé). Sur
  iOS, une vue arrondie rogne son contenu sauf si elle a une ombre ;
  `overflow: hidden` rogne toujours, ce qui masque aussi l'ombre.
- **Rayons.** `border-radius` est borné à la moitié de la taille de la vue, si
  bien que `999px` donne une pilule sur les deux plateformes.
- **Ombres.** iOS utilise l'intégralité du décalage, du flou et de la couleur.
  Android dessine des ombres d'élévation : le flou correspond à l'élévation, la
  couleur s'applique sur Android 9+, et le décalage est ignoré (la source de
  lumière est fixe).
- **Dégradés.** iOS accepte n'importe quel angle ; Android s'aligne sur le
  multiple de 45° le plus proche.
- **Mise en page.** Identique sur les deux plateformes (un seul moteur). Les
  contrôles natifs gardent la taille de leur plateforme : les boutons Material
  d'Android sont plus larges que ceux d'UIKit et peuvent faire déborder une
  ligne qui tient sur iOS. La largeur min-content d'un texte est son mot le
  plus large, mesuré avec la police de la plateforme.
- **Typographie.** Les graisses numériques et `line-height` exigent Android
  9+ ; les versions antérieures se rabattent sur regular/bold et la hauteur de
  ligne par défaut. Les familles embarquées et chargées choisissent leurs
  fichiers selon la graisse sur toutes les versions
  ([polices](fonts.md#how-fontfamily-resolves)) ; une `font-family` inconnue
  est une erreur qui la nomme.
