# Primitive

Primitive sind nach dem benannt, was sie anordnen oder tun, und ihre Props verwenden CSS-Namen, wo CSS das Konzept hat. Props nehmen Skalare oder beliebige JSON-Daten: Objekte, Arrays (`edges={['top']}`) und verschachtelte Kombinationen gelangen als JSON zur nativen View; Funktionen und Klasseninstanzen nicht, in keiner Tiefe.

## SafeArea und Scroll

`SafeArea` ist ein VStack mit Padding um den Teil, den das System verdeckt: Statusleiste, Notch oder Dynamic Island, Home-Indikator, Navigationsleiste. Die App zeichnet randlos, sodass Hintergründe unter diese Bereiche laufen, während SafeArea den Inhalt frei hält. Nur die Überlappung zählt: eine SafeArea in der Bildschirmmitte bekommt keinen Inset. Der Inset addiert sich zum eigenen `padding` der View.

`Scroll` scrollt seinen Inhalt, vertikal oder, mit `horizontal`, quer; Padding und Gap gelten für den Inhalt. Scroll-Arbeit ist Opt-in: die native View sendet Scroll-Ereignisse nur, solange `onScroll` gesetzt ist, und installiert Pull-to-Refresh nur, solange `onRefresh` es ist.

```tsx
<Scroll backgroundColor="#0b1020">
  <SafeArea edges={['top']} padding={20}>
    <Text>Header</Text>
  </SafeArea>
</Scroll>
```

## Sheet

Ein natives Bottom Sheet: `UISheetPresentationController` auf iOS, Materials `BottomSheetDialog` auf Android. Plattformgesten, die Übergabe vom Scrollen zum Aufklappen, Barrierefreiheit und Schließen per Zurück oder Backdrop kommen mit. Seine Kinder sind gewöhnliche Kuito-Views, im Sheet angeordnet. `open` ist kontrolliert; `onClose` meldet ein Schließen, also `open` wieder auf false setzen. Der Inhalt bleibt frei von Home-Indikator und Navigationsleiste, und Style-Props gelten im Sheet.

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

Ein Container, angeordnet wie `VStack`, der auf Berührungen reagiert. Das Feedback ist nativ: Opazität, Skalierung und Haptik laufen beim Touch-down in UIKit oder Android Views, ohne auf JavaScript zu warten. Das innerste Pressable behandelt einen Druck: ein Druck auf ein verschachteltes Pressable drückt nicht auch sein Elternelement. Ein Pressable ist ein Screenreader-Element, vorgelesen als Text seiner Kinder, sofern es kein `label` hat.

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

Ein Texteingabefeld: `value` (sein Text, bidirektional mit einem Signal), `placeholder`, `disabled` und die Ereignisse `onChange`, `onSubmit`, `onFocus` und `onBlur`. Text-Styles (`color`, `font-size`) gelten für den eingegebenen Text. `enterKeyHint`, `submitBehavior`, `autoFocus` und `ref.focus()` funktionieren wie in HTML; `enterKeyHint="next"` springt nativ zum nächsten Eingabefeld.

```tsx
<TextField class={css.field} placeholder="Search" value={query} />
```

## Image und Symbol

`Image` zeigt URLs (`https`, `file` und `data:`) und mit der App gebündelte Bilder, mit eingebautem Caching und Ladefeinschliff. Ein Image einer URL hat keine intrinsische Größe: `width`/`height` angeben, es in einem Stack dehnen oder `aspectRatio` setzen. Ein importiertes Bild bündelt der Compiler in beide Shells; seine Größe ist beim Kompilieren der App bekannt, also braucht es keine.

```tsx
import cover from './assets/cover.png';

<Image src={cover} />;
<Image src={{ uri: 'https://example.com/cover.jpg' }} aspectRatio={1.5} placeholder="#1e293b" />;
```

`Symbol` zeichnet die eigenen Symbole der Plattform nach Namen: ein SF Symbol auf iOS und ein Material Symbol auf Android. Ein literaler Name, den eine Plattform nicht hat, ist ein Kompilierfehler an seiner Zeile.

```tsx
<Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" />
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} />
```

## List

Eine von der Plattform virtualisierte Liste: eine UICollectionView oder RecyclerView besitzt Scrollen und Recycling, und JavaScript rendert nur die Zeilen nahe dem Bildschirm. Zeilen werden nativ wiederverwendet, und der Komponentenzustand einer Zeile gehört zu ihrem Element. Neue `data` erreichen die native Liste als Schlüssel, die sie in Einfügungen, Entfernungen und Verschiebungen diffst; nur was sich geändert hat, rendert. Es gibt kein `getItemLayout`: Zeilen messen sich selbst. Listen bekommen ihr eigenes Scrollen: eine vertikale Liste in einem vertikalen Scroll rendert jede Zeile.

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

## Vertiefung

[Primitive](../../../../docs/primitives.md) behandelt die Props jedes Primitivs, Image-Caching, List-Abschnitte und -Spalten sowie die bewussten Unterschiede zu React Native.
