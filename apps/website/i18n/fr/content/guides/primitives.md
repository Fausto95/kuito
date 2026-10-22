# Primitives

Les primitives portent le nom de ce qu'elles disposent ou font, et leurs props reprennent les noms CSS là où CSS a le concept. Les props acceptent des scalaires ou n'importe quelle donnée JSON : objets, tableaux (`edges={['top']}`) et combinaisons imbriquées passent à la vue native en JSON ; les fonctions et les instances de classe ne le peuvent pas, à aucune profondeur.

## SafeArea et Scroll

`SafeArea` est un VStack dont le padding couvre la partie de lui-même que le système recouvre : barre d'état, encoche ou Dynamic Island, indicateur d'accueil, barre de navigation. L'app dessine bord à bord, donc les arrière-plans passent sous ces zones tandis que SafeArea garde le contenu dégagé. Seul le chevauchement compte : un SafeArea au milieu de l'écran ne reçoit aucune marge. La marge s'ajoute au `padding` propre de la vue.

`Scroll` fait défiler son contenu, verticalement ou, avec `horizontal`, en travers ; padding et gap s'appliquent au contenu. Le travail de défilement est opt-in : la vue native n'envoie des événements de défilement que tant que `onScroll` est défini et n'installe le tirer-pour-rafraîchir que tant que `onRefresh` l'est.

```tsx
<Scroll backgroundColor="#0b1020">
  <SafeArea edges={['top']} padding={20}>
    <Text>Header</Text>
  </SafeArea>
</Scroll>
```

## Sheet

Une feuille native du bas : `UISheetPresentationController` sur iOS, le `BottomSheetDialog` de Material sur Android. Les gestes de la plateforme, le passage de relais du défilement à l'expansion, l'accessibilité et la fermeture par retour ou par le fond viennent avec. Ses enfants sont des vues Kuito ordinaires disposées dans la feuille. `open` est contrôlé ; `onClose` signale une fermeture, donc remettez `open` à false. Le contenu reste dégagé de l'indicateur d'accueil et de la barre de navigation, et les props de style s'appliquent à l'intérieur de la feuille.

```tsx
<Sheet
  open={queueOpen.value}
  snapPoints={['content', '90%']}
  onClose={() => (queueOpen.value = false)}
  padding={24}
>
  <Text>Up next</Text>
</Sheet>
```

## Pressable

Un conteneur, disposé comme `VStack`, qui répond aux touchers. Le retour est natif : opacité, échelle et retours haptiques s'exécutent au toucher posé dans UIKit ou Android Views, sans attendre JavaScript. Le Pressable le plus interne gère un appui : un appui sur un Pressable imbriqué n'appuie pas aussi sur son parent. Un Pressable est un seul élément du lecteur d'écran, lu comme le texte de ses enfants sauf s'il a un `label`.

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

## TextField

Un champ de saisie de texte : `value` (son texte, bidirectionnel quand on lui donne un signal), `placeholder`, `disabled`, et les événements `onChange`, `onSubmit`, `onFocus` et `onBlur`. Les styles de texte (`color`, `font-size`) s'appliquent au texte saisi. `enterKeyHint`, `submitBehavior`, `autoFocus` et `ref.focus()` fonctionnent comme en HTML ; `enterKeyHint="next"` passe au champ suivant nativement.

```tsx
<TextField class={css.field} placeholder="Search" value={query} />
```

## Image et Symbol

`Image` affiche des URL (`https`, `file` et `data:`) et des images embarquées avec l'app, avec le cache et la finition de chargement intégrés. Une Image d'une URL n'a pas de taille intrinsèque : donnez-lui `width`/`height`, étirez-la dans un stack, ou définissez `aspectRatio`. Une image importée est embarquée dans les deux shells par le compilateur ; sa taille est connue à la compilation de l'app, donc elle n'a pas besoin de taille.

```tsx
import cover from './assets/cover.png';

<Image src={cover} />;
<Image src={{ uri: 'https://example.com/cover.jpg' }} aspectRatio={1.5} placeholder="#1e293b" />;
```

`Symbol` dessine les symboles propres à la plateforme par leur nom : un SF Symbol sur iOS et un Material Symbol sur Android. Un nom littéral qu'une plateforme n'a pas est une erreur de compilation à sa ligne.

```tsx
<Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" />
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} />
```

## List

Une liste virtualisée par la plateforme : un UICollectionView ou un RecyclerView possède le défilement et le recyclage, et JavaScript ne rend que les lignes proches de l'écran. Les lignes sont recyclées nativement, et l'état des composants d'une ligne appartient à son élément. Une nouvelle `data` atteint la liste native sous forme de clés, qu'elle diffe en insertions, suppressions et déplacements ; seul ce qui a changé est rendu. Il n'y a pas de `getItemLayout` : les lignes se mesurent elles-mêmes. Donnez aux listes leur propre défilement : une liste verticale dans un Scroll vertical rend chaque ligne.

```tsx
<List
  data={tracks.value}
  itemKey={(track) => track.id}
  renderItem={({ item, index }) => <TrackRow track={item} position={index + 1} />}
  separator={Divider}
  empty={<Text>No tracks yet</Text>}
  onReachEnd={loadMore}
/>
```

## En profondeur

[Primitives](../../../../docs/primitives.md) couvre les props de chaque primitive, le cache d'Image, les sections et colonnes de List, et les différences délibérées avec React Native.
