# Primitives

Les primitives portent le nom de ce qu'elles disposent ou font, et leurs props
reprennent les noms CSS là où CSS a le concept ([nommage](naming.md)).

Les props acceptent des scalaires ou n'importe quelle donnée JSON : objets,
tableaux (`edges={['top']}`) et combinaisons imbriquées passent à la vue native
en JSON. Les fonctions et les instances de classe ne le peuvent pas, à aucune
profondeur.

## SafeArea

Un VStack dont le padding couvre la partie de lui-même que le système
recouvre : barre d'état, encoche ou Dynamic Island, indicateur d'accueil, barre
de navigation. L'application dessine bord à bord, donc les arrière-plans passent
sous ces zones tandis que SafeArea garde le contenu dégagé.

```tsx
<Scroll backgroundColor="#0b1020">
  <SafeArea edges={['top']} padding={20}>
    <Text>Header</Text>
  </SafeArea>
</Scroll>
```

<!-- SafeArea props: generated from src/protocol/manifest.ts -->

| Prop    | Signification                                                                            |
| ------- | ---------------------------------------------------------------------------------------- |
| `edges` | Lesquels de `top`, `right`, `bottom`, `left` recevoir une marge ; les quatre par défaut. |

<!-- end of generated props -->

- **Seul le chevauchement compte**, comme avec la SafeArea native de
  react-native-safe-area-context : une SafeArea au milieu de l'écran ne reçoit
  aucune marge, et une en bas reçoit exactement la hauteur de l'indicateur
  d'accueil.
- La marge s'ajoute au `padding` propre de la vue.
- Les marges suivent la rotation et les changements des barres système.

## Sheet

Une feuille native en bas d'écran (bottom sheet) : `UISheetPresentationController`
sur iOS, le `BottomSheetDialog` de Material sur Android. Les gestes de la
plateforme, le relais défilement-vers-extension, l'accessibilité et la fermeture
par retour ou par le fond viennent avec. Ses enfants sont des vues Kuito
ordinaires disposées par le moteur partagé à l'intérieur de la feuille.

```tsx
<Sheet
  open={queueOpen.value}
  snapPoints={['content', '90%']}
  onClose={() => (queueOpen.value = false)}
  backgroundColor="#111827"
  padding={24}
>
  <Text>Up next</Text>
</Sheet>
```

<!-- Sheet props: generated from src/protocol/manifest.ts -->

| Prop           | Signification                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `open`         | Affiche la feuille. Contrôlé, comme le Modal de React Native.                                            |
| `onClose`      | L'utilisateur l'a fermée (balayage, fond ou retour) ; remettez `open` à false.                           |
| `snapPoints`   | Hauteurs de repos, de la plus petite à la plus grande : des points, `'50%'` ou `'content'` (par défaut). |
| `onSnap`       | `{ index }` du point d'accroche où la feuille s'est immobilisée.                                         |
| `grabber`      | La poignée de glissement ; affichée par défaut.                                                          |
| `dismissible`  | Si un balayage vers le bas ou un tap à l'extérieur la ferme ; true par défaut.                           |
| `borderRadius` | Le rayon des coins de la feuille.                                                                        |

<!-- end of generated props -->

- **Tient compte de la zone sûre.** Le contenu reste dégagé de l'indicateur
  d'accueil, de la barre de navigation et, en paysage, des bords de l'écran ;
  le padding s'y ajoute. `'content'` dimensionne la feuille à ses enfants plus
  cette marge.
- Les props de style (arrière-plan, padding, gap) s'appliquent à l'intérieur de
  la feuille.
- La feuille Android se repose sur au plus trois hauteurs (repliée, à demi
  dépliée et dépliée), donc au plus trois points d'accroche y prennent effet.
- Sur iOS 26 et ultérieur, le système dessine les feuilles flottantes, en
  retrait des bords de l'écran.

## Pressable

Un conteneur (disposé comme un `VStack`) qui réagit aux touchers.

```tsx
<Pressable
  onPress={open}
  onLongPress={showMenu}
  pressedOpacity={0.7}
  pressedScale={0.97}
  haptic="light"
>
  <Text>Open</Text>
</Pressable>
```

<!-- Pressable props: generated from src/protocol/manifest.ts -->

| Prop                          | Signification                                                     |
| ----------------------------- | ----------------------------------------------------------------- |
| `onPress`                     | Un appui terminé. Non appelé quand un appui long s'est déclenché. |
| `onPressStart` / `onPressEnd` | Toucher posé / levé ou annulé.                                    |
| `onLongPress`                 | Maintenu pendant `longPressDuration` ms (500 par défaut).         |
| `disabled`                    | Ignore les touchers.                                              |
| `hitArea`                     | Marge tactile supplémentaire en points.                           |
| `pressedOpacity` _(Kuito)_   | Opacité pendant l'appui, comme `TouchableOpacity`. 1 = aucune.    |
| `pressedScale` _(Kuito)_     | Échelle pendant l'appui, p. ex. `0.97`. 1 = aucune.               |
| `haptic` _(Kuito)_           | `light`, `medium`, `heavy` ou `selection` au toucher posé.        |

<!-- end of generated props -->

Les événements portent `locationX`/`locationY` (dans la vue) et `pageX`/`pageY`
(à l'écran), en points. Un Pressable est un seul élément pour le lecteur
d'écran, lu comme le texte de ses enfants sauf s'il a un `label` (voir
[accessibilité](accessibility.md)).

- **Le retour est natif.** Opacité, échelle et haptique s'exécutent au toucher
  posé dans UIKit ou Android Views, sans attendre JavaScript. Ils se composent
  avec l'`opacity` et les transformations propres de la vue, de sorte qu'une
  carte pressée conserve son style.
- **Le Pressable le plus interne gère un appui**, comme avec le responder de
  React Native : un appui sur un Pressable imbriqué n'appuie pas aussi sur son
  parent.
- Un toucher qui s'éloigne de plus de 20 points au-delà de la vue (plus
  `hitArea`) annule l'appui.
- Android étend la zone tactile via le `TouchDelegate` du parent, qui ne tient
  qu'une seule vue : un seul Pressable à `hitArea` par parent y prend effet.

## TextField

Un champ de saisie : `value` (son texte, bidirectionnel quand on lui donne un
signal), `placeholder`, `placeholderColor`, `selectionColor` (curseur et
sélection), `disabled`, et les événements `onChange` (le texte), `onSubmit`,
`onFocus` et `onBlur`. Les styles de texte (`color`, `font-size`) s'appliquent
au texte saisi. Un TextField avec un arrière-plan ne dessine que cet
arrière-plan ; sans, il garde l'apparence de champ de la plateforme.
`enterKeyHint`, `submitBehavior`, `autoFocus` et `ref.focus()` fonctionnent
comme en HTML ; `enterKeyHint="next"` passe nativement au champ suivant
([clavier](keyboard.md)).

```tsx
<TextField
  class={css.field}
  placeholder="Search"
  placeholderColor="#8a8a96"
  selectionColor="#ff5a5f"
  value={query}
/>
```

## Image

L'Image de React Native pour les URL (`https`, `file` et `data:`) et pour les
images embarquées avec l'application, avec cache et soin du chargement
intégrés.

```tsx
<Image
  src={{ uri: 'https://example.com/cover.jpg' }}
  aspectRatio={1.5}
  placeholder="#1e293b"
  fadeDuration={250}
  onLoad={(event) => console.log(event.width, event.height)}
/>
```

Une image importée est embarquée dans les deux shells par le compilateur
([ressources](assets.md)) : PNG et JPEG avec leurs variantes `@2x` et `@3x`, et
SVG et PDF dessinés en vectoriel. Sa taille est connue à la compilation de
l'application, donc elle n'a besoin ni de `width`, ni de `height`, ni
d'`aspectRatio` :

```tsx
import cover from './assets/cover.png';

<Image src={cover} />;
```

<!-- Image props: generated from src/protocol/manifest.ts -->

| Prop                        | Signification                                                               |
| --------------------------- | --------------------------------------------------------------------------- |
| `src`                       | Une chaîne URL, `{ uri }`, ou une image importée ([ressources](assets.md)). |
| `objectFit`                 | L'`object-fit` de CSS : `cover` (par défaut), `contain`, `fill` ou `none`.  |
| `tintColor`                 | Recolore les pixels opaques, pour les icônes.                               |
| `onLoadStart` / `onLoadEnd` | Autour de chaque chargement, réussi ou non.                                 |
| `onLoad`                    | `{ width, height }` de l'image en pixels.                                   |
| `onError`                   | `{ error }`, p. ex. `"HTTP 404"`.                                           |
| `aspectRatio` _(Kuito)_    | Largeur ÷ hauteur : dimensionne la vue avant l'arrivée de l'image.          |
| `placeholder` _(Kuito)_    | Couleur affichée pendant le chargement.                                     |
| `fadeDuration` _(Kuito)_   | Fondu enchaîné en millisecondes à l'apparition de l'image ; 0 par défaut.   |
| `cache` _(Kuito)_          | `memory-disk` (par défaut), `memory`, `disk` ou `none`.                     |

<!-- end of generated props -->

- **Cache.** Les images décodées restent dans un cache mémoire (64 Mo sur iOS,
  un huitième du tas sur Android) ; les octets distants restent dans un cache
  disque sous le répertoire de caches de l'application, indépendamment des
  en-têtes de cache HTTP.
- **Une requête par URL.** Les vues qui demandent une image déjà en cours de
  chargement attendent cette requête au lieu d'en lancer une autre.
- **Le décodage a lieu hors du thread principal**, donc faire défiler jusqu'à
  une nouvelle image ne bloque pas une frame.
- Comme les images réseau de React Native, une Image d'URL n'a pas de taille
  intrinsèque : donnez-lui `width`/`height`, étirez-la dans une pile, ou
  définissez `aspectRatio`. Une image embarquée a sa propre taille en points
  sauf si une prop de taille ou une classe en décide autrement, et conserve son
  rapport d'aspect quand un seul côté est donné.
- Changer `src` ignore un chargement antérieur plus lent qui se termine plus
  tard.

## Symbol

Les symboles propres à la plateforme, par nom : un [SF Symbol](https://developer.apple.com/sf-symbols/)
sur iOS et un [Material Symbol](https://fonts.google.com/icons) sur Android, tels
que les onglets les affichent ([ressources](assets.md#symbols)).

```tsx
<Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" />
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} />
```

<!-- Symbol props: generated from src/protocol/manifest.ts -->

| Prop                   | Signification                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ |
| `name` _(Kuito)_      | Un SF Symbol sur iOS et un Material Symbol sur Android, ou `{ ios, android }`. |
| `size` _(Kuito)_      | En points ; 24 par défaut, et la taille de la vue.                             |
| `weight` _(Kuito)_    | De `ultralight` à `black` ; `regular` par défaut.                              |
| `tintColor` _(Kuito)_ | La couleur du symbole ; noir par défaut.                                       |

<!-- end of generated props -->

Un nom littéral qu'une plateforme ne possède pas est une erreur de compilation
à sa ligne.

## Scroll

Une vue qui fait défiler son contenu, verticalement ou, avec `horizontal`,
latéralement : un UIScrollView sur iOS. Ses enfants sont disposés le long de
son axe ; padding et gap s'appliquent au contenu.

<!-- Scroll props: generated from src/protocol/manifest.ts -->

| Prop                              | Signification                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `horizontal`                      | Défilement latéral. Le changer remonte la vue.                                                                                                                                                                     |
| `onScroll`, `scrollInterval`      | `{ x, y, contentWidth, contentHeight, layoutWidth, layoutHeight }` en points, au plus une fois par intervalle (50 ms par défaut).                                                                                  |
| `onReachEnd`, `reachEndThreshold` | Une fois chaque fois que la fin arrive à portée du seuil, en longueurs visibles (0.5 par défaut).                                                                                                                  |
| `onRefresh`, `refreshing`         | Tirer pour rafraîchir (vertical uniquement, comme dans React Native).                                                                                                                                              |
| `scrollbar`                       | Affiche ou masque la barre de défilement.                                                                                                                                                                          |
| `keyboard`                        | `{ dismiss, persistTaps, inset, avoid }` : quand le glissement ferme le clavier, ce que fait un tap hors du champ, si le contenu reste dégagé de celui-ci (true par défaut) ([clavier](keyboard.md#scroll-views)). |

<!-- end of generated props -->

- **Le travail de défilement est optionnel.** La vue native n'envoie des
  événements de défilement que tant que `onScroll` est défini et n'installe le
  tirer-pour-rafraîchir que tant que `onRefresh` l'est, de sorte qu'un Scroll
  simple ne passe jamais côté JavaScript en défilant.
- La fin atteinte se déclenche une fois par longueur de contenu : quand le
  contenu grandit, elle se réarme. Un contenu plus court que la vue compte
  comme fin atteinte, comme dans React Native.

## List

Une liste virtualisée par la plateforme : un UICollectionView ou un
RecyclerView possède le défilement et le recyclage, et JavaScript ne rend que
les lignes proches de l'écran ([fonctionnement](lists.md)).

```tsx
<List
  ref={list}
  data={tracks.value}
  itemKey={(track) => track.id}
  renderItem={({ item, index }) => <TrackRow track={item} position={index + 1} />}
  separator={Divider}
  header={<Header />}
  empty={<Text>No tracks yet</Text>}
  onReachEnd={loadMore}
  refreshing={refreshing.value}
  onRefresh={reload}
/>
```

Prend en charge `data` (les éléments, un signal de ceux-ci, ou un tableau de
[store](reactivity.md#stores)), `renderItem` (il reçoit `item`, `index` et
`visible`, un signal indiquant si la ligne est à l'écran), `itemKey` (par
défaut : `item.key`, puis `item.id`, puis l'identité d'un élément du store, puis
l'index ; les clés doivent être uniques), `sectionKey`, `renderSection` et
`stickySections` ([sections](lists.md#sections-and-sticky-headers)),
`separator`, `header`, `footer`, `empty` (chacun un composant ou un élément),
`columns`, `horizontal`, `inverted`, `initialIndex`, `estimatedItemSize`,
`onViewableChange` avec `viewability.itemVisiblePercentThreshold`,
`onReachEnd`/`reachEndThreshold`, le tirer-pour-rafraîchir, et les props de
Scroll. Une ref (`ref<ListHandle>()`) possède `scrollToIndex`, `scrollToItem`,
`scrollTo` et `scrollToEnd`.

- **Les lignes sont recyclées nativement.** Une cellule sortie de l'écran est
  reliée à une autre ligne : mêmes vues natives, seules les props changent.
  L'état du composant d'une ligne appartient à son élément et repart de zéro
  quand sa cellule affiche un autre élément.
- **Les changements de données s'animent.** Un nouveau `data` parvient à la
  liste native sous forme de clés, qu'elle diffe en insertions, suppressions et
  déplacements.
- **Seul ce qui a changé est rendu.** Un nouveau `data` re-rend les lignes
  liées dont l'élément a changé, et les parties d'une ligne qui lisent `index`
  quand elle a bougé ; un signal lu dans `renderItem` re-rend les lignes qui le
  lisent, de sorte qu'une ligne n'a jamais besoin d'une dépendance externe. Sur
  un tableau de store, l'écriture d'un champ (`items[3].liked = true`) est une
  seule écriture de prop sur la cellule de cette ligne.
- **Pas de `getItemLayout`.** Les lignes se mesurent elles-mêmes ;
  `scrollToIndex` atterrit sur la ligne à mesure que les lignes autour d'elle
  sont mesurées.
- `columns` dispose les éléments en colonnes ; `gap` (ou `rowGap` et
  `columnGap`, comme se compile le `gap` d'une feuille de style) espace lignes
  et colonnes. L'en-tête, le pied et la ligne vide s'étendent sur toutes les
  colonnes, et les grilles n'ont pas de séparateurs.

Différences délibérées avec React Native :

- `getItemLayout`, `windowSize`, `initialNumToRender`, `maxToRenderPerBatch`,
  `removeClippedSubviews` et `CellRendererComponent` n'existent pas : la
  plateforme décide de ce qu'elle rend.
- Les événements d'une ligne remontent par sa cellule jusqu'à la liste et ses
  ancêtres, mais une ligne est un module séparé : elle se re-rend seule, jamais
  avec l'écran.
- La longueur min-content d'une liste est zéro (CSS utiliserait celle de son
  contenu), donc une colonne `flex: 1` contenant une liste n'est pas étirée à
  la longueur de toutes les lignes.
- `renderItem` reçoit `{ item, index }` ; il n'y a pas d'utilitaire
  `separators`.
- Comme dans React Native, une liste verticale dans un Scroll vertical rend
  toutes ses lignes : donnez aux listes leur propre défilement.
