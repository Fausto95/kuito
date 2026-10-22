# Listes natives

`List` est virtualisée par la plateforme : un `UICollectionView` sur iOS et un
`RecyclerView` sur Android possèdent le défilement, le recyclage et l'existence
des lignes. JavaScript ne rend une ligne que lorsque la liste native le
demande, et une cellule recyclée est reliée de nouveau par le diff de patch
ordinaire au lieu d'être créée à nouveau. Le défilement n'attend jamais
JavaScript.

```
List (src/ui/flat-list.tsx)          native List (Views/KuitoListView)
  keys as edits ────────────────────────▶  inserts, removes, moves rows
                                            picks a cell for each row near
  bind(cell, key) ◀────────────────────── the viewport (render-ahead window)
  renderCell: patch the cell's module ──▶  ListCell + row views, cellKey ack
  row signals: item, index, visible ────▶  one prop write per field write
                                            measures the row (its own layout
                                            root), shows it, keeps its size
```

## Qui possède quoi

- **La liste native** possède les cellules et décide quelle cellule affiche
  quelle clé. Pour une ligne, elle réutilise la cellule qui tient déjà cette
  clé, sinon la cellule libre la moins récemment utilisée, sinon une nouvelle.
  Elle garde une cellule pour chaque ligne jusqu'à un écran devant la fenêtre
  visible (un demi-écran derrière) et huit cellules de réserve hors écran, de
  sorte que les lignes sont rendues avant d'apparaître et qu'un léger retour
  en arrière ne demande rien du tout à JavaScript.
- **JavaScript** rend une ligne dans la cellule qu'on lui demande. Chaque
  cellule est un module à part (`src/runtime/lists.ts`) dont la racine est la
  vue `ListCell`. Relier une cellule à une autre clé patche ce module : mêmes
  vues, props diffées. Les composants de la ligne repartent de zéro pour le
  nouvel élément (état, hooks de montage, tâches), comme dans React Native, où
  l'état d'une ligne appartient à son élément.
  Quand de nouvelles données retirent la clé d'une ligne liée, sa cellule ne
  rend rien : la liste native peut conserver cette cellule et la réafficher,
  sans qu'on le lui demande, si la clé revient, et de nouvelles données y
  rendent la ligne à nouveau.
- **Mise en page** : chaque ligne est une racine de mise en page dans le moteur
  flexbox partagé, aussi large que sa colonne (liste verticale) ou que son
  contenu (liste horizontale). Les tailles mesurées sont mises en cache par
  clé, donc une ligne déjà vue revient à sa taille réelle. Une ligne pas encore
  rendue prend sa taille en cache, `estimatedItemSize`, ou la moyenne des
  lignes mesurées, et reste vide jusqu'à son arrivée.

## Stores et lignes à grain fin

Une ligne est réactive, pas mémoïsée. Chaque ligne liée garde ses propres
signaux (`src/ui/flat-list.tsx`) : son élément, son index, si elle est la
dernière ligne, et si elle est à l'écran. De nouvelles données déplacent chaque
ligne à la place de son élément, en écrivant ces signaux, et seules les
liaisons qui lisent un signal modifié s'exécutent à nouveau : une ligne dont
l'élément est le même objet et qui ne lit jamais `index` ne rend rien quand des
lignes sont insérées au-dessus d'elle.

Sur un tableau de [store](reactivity.md#stores), les éléments sont les objets
du store, donc l'écriture d'un champ ne change jamais l'élément :

```tsx
const shelf = store({ books: [] as Book[] });

<List
  data={shelf.books}
  renderItem={({ item, visible }) => (
    <Pressable onPress={() => (item.liked = !item.liked)}>
      <Text>{item.title}</Text>
      <Text>{item.liked ? '♥' : '♡'}</Text>
      <Spinner animating={visible.value} />
    </Pressable>
  )}
/>;
```

- `items[3].liked = true` atteint la seule liaison qui le lit : une écriture de
  prop sur une cellule, aucune ligne re-rendue et aucune clé envoyée.
- `push`, `splice` et `sort` envoient à la liste les modifications de ses clés
  (voir [Clés](#keys)) ; les lignes gardent leurs cellules.
- Un élément sans `key` ni `id` est identifié par son identité dans le store,
  donc il garde sa clé où qu'il se déplace. Remplacer un index par un autre
  objet est un nouvel élément.

`visible` est un signal par ligne, alimenté par la plage native `viewable` et
le seuil `viewability` : lancez une vidéo ou un fetch tant que la ligne est à
l'écran, et arrêtez-les quand elle le quitte. `onViewableChange` signale la
même plage que les jetons de visibilité de React Native. Signaler la plage
coûte du travail à la liste native à chaque défilement, donc cela ne commence
qu'une fois qu'une ligne lit `visible` ou que `onViewableChange` est défini.

## Sections et en-têtes collants

`List` a des sections sans second type de liste : `sectionKey` nomme la section
de chaque élément, et chaque suite d'éléments de même section reçoit une ligne
d'en-tête que `renderSection` rend, à partir de la section et de son premier
élément. `stickySections` maintient l'en-tête d'une section en haut de la liste
pendant que sa section défile dessous ; l'en-tête suivant le pousse vers le
haut en arrivant.

```tsx
<List
  data={library.songs}
  sectionKey={(song) => song.album}
  renderSection={({ section }) => <Text class={css.albumTitle}>{section}</Text>}
  stickySections
  renderItem={({ item }) => <SongRow song={item} />}
/>
```

- Les éléments d'une section doivent se suivre dans `data` : une section qui
  apparaît deux fois est une erreur.
- Les lignes d'en-tête s'étendent sur toutes les colonnes d'une grille, et
  aucun séparateur ne suit le dernier élément d'une section.
- `sectionKey` est lu comme `itemKey` : sur un tableau de store, un élément
  dont la section change passe dans sa nouvelle section.
- Les en-têtes collants exigent une liste verticale non inversée ; tout le
  reste est une erreur. Sur iOS la mise en page de la liste épingle la ligne
  d'en-tête en place ; sur Android une superposition au-dessus du RecyclerView
  héberge la cellule de l'en-tête tant qu'il est épinglé. Dans les deux cas
  l'en-tête est la ligne que JavaScript a rendue, avec ses gestionnaires.

## Listes courtes : For

Une liste de quelques dizaines de lignes dans un `Scroll` n'a pas besoin de
virtualisation : utilisez [`For`](control-flow.md#for). Il rend chaque ligne,
identifiée par son élément, et un réordonnancement déplace les vues des lignes
au lieu de replanifier l'écran. Sur un tableau de store, il bénéficie des mêmes
mises à jour d'une écriture de prop par écriture de champ que `List`.

## Clés

Les clés d'une liste franchissent la frontière de l'hôte sous forme de
modifications des clés envoyées la dernière fois, jamais comme le tableau
entier à nouveau : un ajout est une insertion, un retrait une suppression,
quelle que soit la longueur de la liste. Le noyau (`src/runtime/key-diff.ts`)
compare les clés avec celles qu'il a envoyées et écrit, dans l'ordre :

1. une suppression pour chaque clé partie, à son index une fois les
   suppressions précédentes effectuées ;
2. un déplacement pour chaque clé qui a changé de place, le minimum qui
   atteigne le nouvel ordre : les clés d'une plus longue suite déjà en ordre
   restent, comme lorsque le noyau réordonne les enfants d'une vue
   (`src/runtime/reconcile.ts`) ;
3. une insertion pour chaque nouvelle clé, à son index final, de la première à
   la dernière.

Chaque modification s'applique aux clés laissées par les précédentes ; l'index
d'un déplacement compte une fois la clé partie de sa place. Les premières clés
sont toutes des insertions à la fin, et null vide la liste.

Les renderers appliquent un diff en entier (`Views/KuitoListKeys`) : une
suppression doit nommer la clé à son index, un déplacement une clé que la liste
possède, une insertion une clé qui lui manque et un index à l'intérieur de la
liste. Une modification qui ne convient pas lève `unsupportedValue` sur `keys`
et laisse les clés telles quelles ; une clé insérée deux fois est la même
erreur, puisque les clés doivent être uniques. La liste réindexe ensuite ses
clés, lignes collantes comprises, de sorte qu'un en-tête collant s'épingle à la
nouvelle place de sa clé. Sur iOS la source de données diffable anime le
changement ; sur Android l'adaptateur est informé de chaque insertion,
suppression et déplacement au fur et à mesure, sans passe `DiffUtil`. Les
premières lignes et une liste vidée se chargent d'un coup.

## Protocole hôte

Types natifs : `List`, `HorizontalList` (l'axe est fixé à la création de la
vue, comme pour Scroll) et `ListCell`.

| Prop de List                         | Valeur                                                                                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`                               | Modifications des clés de lignes envoyées la dernière fois (voir [Clés](#keys)) ; les clés sont uniques, et les changements s'animent                                                                                                                                       |
| `stickyKeys`                         | Tableau JSON des lignes qui restent collées en haut pendant que leur section défile (`List` uniquement)                                                                                                                                                                     |
| `spanningKeys`                       | Tableau JSON des lignes qui s'étendent sur toutes les colonnes (en-tête, pied, vide, sections)                                                                                                                                                                              |
| `numColumns`                         | Colonnes d'une liste verticale                                                                                                                                                                                                                                              |
| `gap`, `rowGap`, `columnGap`         | Points entre les lignes et entre les colonnes, comme dans un conteneur flex : `rowGap` entre les lignes d'une liste verticale, `columnGap` entre les colonnes d'une grille et les lignes d'une liste horizontale ; `gap` définit les deux (props de mise en page également) |
| `inverted`                           | Première ligne à la fin ; la liste et chaque ligne sont retournées                                                                                                                                                                                                          |
| `estimatedItemSize`                  | Longueur d'une ligne pas encore mesurée                                                                                                                                                                                                                                     |
| `initialScrollKey`                   | Ligne à afficher en premier, dès qu'elle existe                                                                                                                                                                                                                             |
| `scrollTo`                           | Une demande, en JSON : `{ key, animated, viewPosition, viewOffset }`, `{ offset, animated }` ou `{ end, animated }`, numérotée par `request`                                                                                                                                |
| `emitsViewable`, `viewableThreshold` | Signaler les lignes visibles ; fraction d'une ligne qui compte                                                                                                                                                                                                              |
| props de défilement                  | `emitsScroll`, `scrollInterval`, `reachEndThreshold`, `refreshable`, `refreshing`, `scrollbar`, `keyboard`, comme Scroll                                                                                                                                                    |

| Prop de ListCell | Valeur                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `cellKey`        | La clé que JavaScript a rendue dans la cellule ; la ligne s'affiche quand elle correspond à la clé demandée par la liste |

| Événement de List   | Charge utile                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `bind`              | `{ cell, key }` : rendre `key` dans `cell` (`<list>:cell-<n>`), en créant la ListCell la première fois |
| `viewable`          | `{ first, last }` : clés de la première et de la dernière ligne visibles                               |
| `reachend`          | Une fois par nombre de lignes                                                                          |
| `scroll`, `refresh` | Comme Scroll                                                                                           |

Les lignes d'en-tête, de pied et vide sont des lignes aux clés `#header`,
`#footer` et `#empty`, et l'en-tête d'une section est `#section:<section>` ;
une clé d'élément ne doit pas en prendre une. Quand une liste est retirée, le
noyau retire d'abord ses cellules (et leurs lignes).

## Comment elle évite les problèmes habituels des listes

- **Zones vides en défilement rapide** : les lignes jusqu'à un écran devant
  sont liées avant d'apparaître, et une ligne garde sa taille en attendant,
  donc rien ne saute. Un fling très rapide peut encore dépasser JavaScript ;
  ces lignes restent vides une frame ou deux, jamais avec un contenu périmé.
- **`onReachEnd` qui se déclenche à répétition** : il se déclenche une fois par
  nombre de lignes, pas par longueur de contenu, donc des lignes qui se
  mesurent ne peuvent pas le redéclencher.
- **`getItemLayout` pour le scroll-to-index** : la liste défile jusqu'à la
  position estimée de la ligne et y atterrit exactement à mesure que les lignes
  autour sont mesurées. Un saut animé lointain coupe jusqu'à un écran avant la
  cible et anime le reste.
- **Lignes cachées derrière le clavier** : une liste verticale met son contenu
  en retrait de la partie couverte par le clavier, en plus de son padding, et
  fait défiler un champ de saisie focalisé d'une ligne au-dessus de lui, comme
  le fait Scroll (docs/keyboard.md). Pas de `KeyboardAvoidingView` autour.
- **Re-rendu de toutes les lignes quand des données extérieures changent** :
  seules les lignes liées (à l'écran ou à proximité) sont rendues à nouveau,
  quand leur élément a changé, et un signal ou un chemin de store lu dans
  `renderItem` ne re-rend que les parties des lignes qui le lisent.
