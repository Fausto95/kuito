# Listes

`List` est virtualisée par la plateforme : un `UICollectionView` sur iOS et un `RecyclerView` sur Android possèdent le défilement, le recyclage et l'existence des lignes. JavaScript ne rend une ligne que lorsque la liste native le demande, et le défilement n'attend jamais JavaScript.

## Qui possède quoi

- **La liste native** possède les cellules et décide quelle cellule affiche quelle clé. Elle garde une cellule pour chaque ligne à un écran d'avance sur la zone visible et huit cellules de réserve hors écran, donc les lignes sont rendues avant de défiler à l'écran.
- **JavaScript** rend une ligne dans la cellule qu'on lui demande. Relier une cellule à une autre clé la patche : mêmes vues, props diffées. Les composants de la ligne repartent de zéro pour le nouvel élément.
- **Mise en page** : chaque ligne est une racine de mise en page, aussi large que sa colonne (liste verticale) ou que son contenu (liste horizontale). Les tailles mesurées sont mises en cache par clé. Une ligne pas encore rendue prend sa taille en cache, `estimatedItemSize`, ou la moyenne des lignes mesurées.

## Stores et lignes à grain fin

Une ligne est réactive, pas mémoïsée. Chaque ligne liée garde ses propres signaux : son élément, son index, si elle est la dernière ligne, et si elle est à l'écran. Seules les liaisons qui lisent un signal qui a changé s'exécutent de nouveau.

Sur un tableau de [store](../../../../docs/reactivity.md#stores), les éléments sont les objets du store, donc une écriture de champ ne change jamais l'élément :

```tsx
const shelf = store({ books: [] as Book[] });

<List
  data={shelf.books}
  renderItem={({ item, visible }) => (
    <Pressable onPress={() => (item.liked = !item.liked)}>
      <Text>{item.title}</Text>
      <Spinner animating={visible.value} />
    </Pressable>
  )}
/>;
```

- `items[3].liked = true` atteint la seule liaison qui le lit : une écriture de prop sur une cellule, aucune ligne rendue à nouveau.
- `push`, `splice` et `sort` envoient à la liste les modifications de ses clés ; les lignes gardent leurs cellules.
- Un élément sans `key` ni `id` est identifié par son identité dans le store. Remplacer un index par un autre objet est un nouvel élément.

`visible` est un signal par ligne, alimenté par la plage visible native et le seuil `viewability` : démarrez une vidéo ou un fetch pendant que la ligne est à l'écran, et arrêtez-le quand elle en sort. `onViewableChange` signale la même plage.

## Sections et en-têtes collants

`sectionKey` nomme la section de chaque élément, et chaque suite d'éléments de même section reçoit une ligne d'en-tête que `renderSection` rend. `stickySections` garde l'en-tête d'une section en haut de la liste pendant que sa section défile dessous.

```tsx
<List
  data={library.songs}
  sectionKey={(song) => song.album}
  renderSection={({ section }) => <Text class={css.albumTitle}>{section}</Text>}
  stickySections
  renderItem={({ item }) => <SongRow song={item} />}
/>
```

- Les éléments d'une section doivent se suivre dans `data` : une section qui apparaît deux fois est une erreur.
- Les lignes d'en-tête s'étendent sur toutes les colonnes d'une grille, et aucun séparateur ne suit le dernier élément d'une section.
- Les en-têtes collants demandent une liste verticale non inversée ; tout le reste est une erreur.

## Listes courtes : `For`

Une liste de quelques dizaines de lignes dans un `Scroll` n'a pas besoin de virtualisation : utilisez [`For`](../../../../docs/control-flow.md#for). Il rend chaque ligne, identifiée par élément, et un réordonnancement déplace les vues des lignes au lieu de replanifier l'écran. Sur un tableau de store, il reçoit les mêmes mises à jour d'une prop par écriture de champ que `List`.

## Les problèmes habituels des listes

- **Zones vides en défilant vite** : les lignes à un écran d'avance sont liées avant d'apparaître, et une ligne garde sa taille en attendant.
- **`onReachEnd` qui se déclenche à répétition** : il se déclenche une fois par nombre de lignes, pas par longueur de contenu.
- **Lignes cachées derrière le clavier** : une liste verticale décale son contenu de la partie que le clavier couvre et fait remonter un champ focalisé dans une ligne au-dessus. Pas de `KeyboardAvoidingView` autour.
- **Rendre chaque ligne à nouveau quand les données changent** : seules les lignes liées sont rendues à nouveau, quand leur élément a changé.

## En profondeur

[Listes natives](../../../../docs/lists.md) couvre le flux de liaison des cellules, comment les clés traversent sous forme de modifications, les clés de lignes réservées et le protocole hôte.
