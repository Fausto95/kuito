# Primitive

Primitive sind nach dem benannt, was sie anordnen oder tun, und ihre Props
verwenden CSS-Namen, wo CSS das Konzept kennt ([Benennung](naming.md)).

Props nehmen Skalare oder beliebige JSON-Daten an: Objekte, Arrays
(`edges={['top']}`) und verschachtelte Kombinationen gelangen als JSON in die
native View. Funktionen und Klasseninstanzen können das nicht, auf keiner
Ebene.

## SafeArea

Ein VStack mit Innenabstand für den Teil, den das System überdeckt:
Statusleiste, Notch oder Dynamic Island, Home-Indikator, Navigationsleiste.
Die App zeichnet bis zum Rand, sodass Hintergründe unter diesen Bereichen
durchlaufen, während SafeArea den Inhalt frei hält.

```tsx
<Scroll backgroundColor="#0b1020">
  <SafeArea edges={['top']} padding={20}>
    <Text>Header</Text>
  </SafeArea>
</Scroll>
```

<!-- SafeArea props: generated from src/protocol/manifest.ts -->

| Prop    | Bedeutung                                                                                    |
| ------- | -------------------------------------------------------------------------------------------- |
| `edges` | Welche von `top`, `right`, `bottom`, `left` einen Abstand erhalten; standardmäßig alle vier. |

<!-- end of generated props -->

- **Nur die Überlappung zählt**, wie bei der nativen SafeArea von
  react-native-safe-area-context: eine SafeArea in der Bildschirmmitte erhält
  keinen Inset, eine am unteren Rand genau die Höhe des Home-Indikators.
- Der Inset addiert sich zum eigenen `padding` der View.
- Insets folgen der Drehung und Änderungen der Systemleisten.

## Sheet

Ein natives Bottom Sheet: `UISheetPresentationController` auf iOS, Materials
`BottomSheetDialog` auf Android. Plattformgesten, die Übergabe vom Scrollen
zum Aufklappen, Barrierefreiheit und das Schließen über Zurück oder den
Hintergrund sind inbegriffen. Seine Kinder sind gewöhnliche Kuito-Views, die
von der gemeinsamen Engine innerhalb des Sheets angeordnet werden.

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

| Prop           | Bedeutung                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `open`         | Zeigt das Sheet an. Kontrolliert, wie das Modal von React Native.                                   |
| `onClose`      | Der Benutzer hat es geschlossen (Wischen, Hintergrund oder Zurück); `open` wieder auf false setzen. |
| `snapPoints`   | Ruhehöhen, die kleinste zuerst: Punkte, `'50%'` oder `'content'` (Standard).                        |
| `onSnap`       | `{ index }` des Snap-Punkts, an dem das Sheet zur Ruhe kam.                                         |
| `grabber`      | Der Ziehgriff; standardmäßig sichtbar.                                                              |
| `dismissible`  | Ob Herunterwischen oder Tippen außerhalb es schließt; standardmäßig true.                           |
| `borderRadius` | Der Eckenradius des Sheets.                                                                         |

<!-- end of generated props -->

- **Berücksichtigt den Safe Area.** Der Inhalt bleibt frei vom Home-Indikator,
  der Navigationsleiste und, im Querformat, den Bildschirmseiten; Padding
  addiert sich dazu. `'content'` bemisst das Sheet nach seinen Kindern plus
  diesem Inset.
- Style-Props (Hintergrund, Padding, Gap) gelten innerhalb des Sheets.
- Das Sheet auf Android ruht auf bis zu drei Höhen (eingeklappt, halb
  ausgeklappt und ausgeklappt), sodass dort höchstens drei Snap-Punkte
  wirksam werden.
- Ab iOS 26 zeichnet das System Sheets schwebend, von den Bildschirmrändern
  eingerückt.

## Pressable

Ein Container (angeordnet wie `VStack`), der auf Berührungen reagiert.

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

| Prop                          | Bedeutung                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `onPress`                     | Ein abgeschlossener Druck. Wird nicht aufgerufen, wenn ein langer Druck ausgelöst wurde. |
| `onPressStart` / `onPressEnd` | Berührung beginnt / endet oder wird abgebrochen.                                         |
| `onLongPress`                 | `longPressDuration` ms lang gehalten (standardmäßig 500).                                |
| `disabled`                    | Ignoriert Berührungen.                                                                   |
| `hitArea`                     | Zusätzlicher berührbarer Rand in Punkten.                                                |
| `pressedOpacity` _(Kuito)_    | Deckkraft während des Drucks, wie `TouchableOpacity`. 1 = keine.                         |
| `pressedScale` _(Kuito)_      | Skalierung während des Drucks, z. B. `0.97`. 1 = keine.                                  |
| `haptic` _(Kuito)_            | `light`, `medium`, `heavy` oder `selection` beim Berühren.                               |

<!-- end of generated props -->

Events tragen `locationX`/`locationY` (in der View) und `pageX`/`pageY` (auf
dem Bildschirm), in Punkten. Ein Pressable ist ein einzelnes
Screenreader-Element, das als Text seiner Kinder vorgelesen wird, sofern es
kein `label` hat (siehe [Barrierefreiheit](accessibility.md)).

- **Das Feedback ist nativ.** Deckkraft, Skalierung und Haptik laufen beim
  Berühren in UIKit oder Android Views, ohne auf JavaScript zu warten. Sie
  kombinieren sich mit der eigenen `opacity` und den Transformationen der
  View, sodass eine gedrückte Karte ihr Styling behält.
- **Das innerste Pressable verarbeitet einen Druck**, wie beim Responder von
  React Native: ein Druck auf ein verschachteltes Pressable drückt nicht
  zusätzlich sein Elternelement.
- Eine Berührung, die sich 20 Punkte über die View (plus `hitArea`) hinaus
  bewegt, bricht den Druck ab.
- Android erweitert den Trefferbereich über den `TouchDelegate` des
  Elternelements, der eine einzige View hält: nur ein Pressable mit `hitArea`
  pro Elternelement wird dort wirksam.

## TextField

Ein Texteingabefeld: `value` (sein Text, bidirektional, wenn ein Signal
übergeben wird), `placeholder`, `placeholderColor`, `selectionColor` (Cursor
und Auswahl), `disabled` sowie die Events `onChange` (der Text), `onSubmit`,
`onFocus` und `onBlur`. Textstile (`color`, `font-size`) gelten für den
eingegebenen Text. Ein TextField mit Hintergrund zeichnet nur diesen
Hintergrund; ohne behält es das Aussehen des Plattformfelds. `enterKeyHint`,
`submitBehavior`, `autoFocus` und `ref.focus()` funktionieren wie in HTML;
`enterKeyHint="next"` wechselt nativ zur nächsten Eingabe
([Tastatur](keyboard.md)).

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

Das Image von React Native für URLs (`https`, `file` und `data:`) und für mit
der App gebündelte Bilder, mit eingebautem Caching und Ladekomfort.

```tsx
<Image
  src={{ uri: 'https://example.com/cover.jpg' }}
  aspectRatio={1.5}
  placeholder="#1e293b"
  fadeDuration={250}
  onLoad={(event) => console.log(event.width, event.height)}
/>
```

Ein importiertes Bild wird vom Compiler in beide Shells gebündelt
([Assets](assets.md)): PNG und JPEG mit ihren `@2x`- und `@3x`-Geschwistern
sowie SVG und PDF als Vektoren gezeichnet. Seine Größe ist beim Kompilieren
der App bekannt, daher braucht es weder `width`, `height` noch
`aspectRatio`:

```tsx
import cover from './assets/cover.png';

<Image src={cover} />;
```

<!-- Image props: generated from src/protocol/manifest.ts -->

| Prop                        | Bedeutung                                                                   |
| --------------------------- | --------------------------------------------------------------------------- |
| `src`                       | Ein URL-String, `{ uri }` oder ein importiertes Bild ([Assets](assets.md)). |
| `objectFit`                 | CSS' `object-fit`: `cover` (Standard), `contain`, `fill` oder `none`.       |
| `tintColor`                 | Färbt deckende Pixel um, für Icons.                                         |
| `onLoadStart` / `onLoadEnd` | Um jeden Ladevorgang herum, bei Erfolg wie bei Fehlschlag.                  |
| `onLoad`                    | `{ width, height }` des Bildes in Pixeln.                                   |
| `onError`                   | `{ error }`, z. B. `"HTTP 404"`.                                            |
| `aspectRatio` _(Kuito)_     | Breite ÷ Höhe: bemisst die View, bevor das Bild ankommt.                    |
| `placeholder` _(Kuito)_     | Farbe, die während des Ladens angezeigt wird.                               |
| `fadeDuration` _(Kuito)_    | Überblendung in Millisekunden, wenn das Bild erscheint; standardmäßig 0.    |
| `cache` _(Kuito)_           | `memory-disk` (Standard), `memory`, `disk` oder `none`.                     |

<!-- end of generated props -->

- **Caching.** Dekodierte Bilder bleiben in einem Speicher-Cache (64 MB auf
  iOS, ein Achtel des Heaps auf Android); entfernte Bytes bleiben in einem
  Festplatten-Cache im Caches-Verzeichnis der App, unabhängig von
  HTTP-Cache-Headern.
- **Eine Anfrage pro URL.** Views, die ein bereits angefordertes Bild
  verlangen, warten auf diese Anfrage, statt eine weitere zu starten.
- **Die Dekodierung läuft außerhalb des Hauptthreads**, sodass das Scrollen
  an einem neuen Bild vorbei keinen Frame anhält.
- Wie die Netzwerkbilder von React Native hat ein Image mit einer URL keine
  intrinsische Größe: `width`/`height` angeben, es in einem Stack dehnen oder
  `aspectRatio` setzen. Ein gebündeltes Bild hat seine eigene Größe in
  Punkten, sofern keine Größen-Prop oder Klasse etwas anderes vorgibt, und
  behält sein Seitenverhältnis, wenn nur eine Seite angegeben ist.
- Eine Änderung von `src` ignoriert einen langsameren früheren Ladevorgang,
  der später abgeschlossen wird.

## Symbol

Die plattformeigenen Symbole, nach Name: ein [SF Symbol](https://developer.apple.com/sf-symbols/)
auf iOS und ein [Material Symbol](https://fonts.google.com/icons) auf Android, so wie
Tabs sie anzeigen ([Assets](assets.md#symbols)).

```tsx
<Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" />
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} />
```

<!-- Symbol props: generated from src/protocol/manifest.ts -->

| Prop                  | Bedeutung                                                                           |
| --------------------- | ----------------------------------------------------------------------------------- |
| `name` _(Kuito)_      | Ein SF Symbol auf iOS und ein Material Symbol auf Android, oder `{ ios, android }`. |
| `size` _(Kuito)_      | In Punkten; standardmäßig 24, zugleich die Größe der View.                          |
| `weight` _(Kuito)_    | `ultralight` bis `black`; standardmäßig `regular`.                                  |
| `tintColor` _(Kuito)_ | Die Farbe des Symbols; standardmäßig Schwarz.                                       |

<!-- end of generated props -->

Ein literaler Name, den eine Plattform nicht kennt, ist ein Kompilierfehler
an seiner Zeile.

## Scroll

Eine View, die ihren Inhalt scrollt, vertikal oder, mit `horizontal`, quer:
eine UIScrollView auf iOS. Ihre Kinder werden entlang ihrer Achse angeordnet;
Padding und Gap gelten für den Inhalt.

<!-- Scroll props: generated from src/protocol/manifest.ts -->

| Prop                              | Bedeutung                                                                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `horizontal`                      | Seitwärts scrollen. Eine Änderung mountet die View neu.                                                                                                                                                                 |
| `onScroll`, `scrollInterval`      | `{ x, y, contentWidth, contentHeight, layoutWidth, layoutHeight }` in Punkten, höchstens einmal pro Drosselintervall (standardmäßig 50 ms).                                                                             |
| `onReachEnd`, `reachEndThreshold` | Einmal, sobald das Ende in den Schwellenbereich kommt, in sichtbaren Längen (standardmäßig 0.5).                                                                                                                        |
| `onRefresh`, `refreshing`         | Pull-to-Refresh (nur vertikal, wie in React Native).                                                                                                                                                                    |
| `scrollbar`                       | Zeigt oder verbirgt die Scrollleiste.                                                                                                                                                                                   |
| `keyboard`                        | `{ dismiss, persistTaps, inset, avoid }`: wann Ziehen die Tastatur schließt, was ein Tippen außerhalb des Felds bewirkt, ob der Inhalt frei von ihr bleibt (standardmäßig true) ([Tastatur](keyboard.md#scroll-views)). |

<!-- end of generated props -->

- **Scroll-Arbeit ist Opt-in.** Die native View sendet Scroll-Events nur,
  solange `onScroll` gesetzt ist, und installiert Pull-to-Refresh nur,
  solange `onRefresh` gesetzt ist, sodass ein einfaches Scroll beim Scrollen
  nie nach JavaScript übergeht.
- Das Erreichen des Endes wird einmal pro Inhaltslänge ausgelöst: wenn der
  Inhalt wächst, wird es neu scharfgeschaltet. Inhalt, der kürzer als die
  View ist, gilt als Erreichen des Endes, wie in React Native.

## List

Eine von der Plattform virtualisierte Liste: eine UICollectionView oder
RecyclerView besitzt das Scrollen und Recycling, und JavaScript rendert nur
die Zeilen nahe am Bildschirm ([Funktionsweise](lists.md)).

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

Unterstützt `data` (die Elemente, ein Signal davon oder ein
[Store](reactivity.md#stores)-Array), `renderItem` (erhält `item`, `index`
und `visible`, ein Signal, ob die Zeile auf dem Bildschirm ist), `itemKey`
(Standard: `item.key`, dann `item.id`, dann die Identität eines
Store-Elements, dann der Index; Schlüssel müssen eindeutig sein),
`sectionKey`, `renderSection` und `stickySections` ([Abschnitte](lists.md#sections-and-sticky-headers)),
`separator`, `header`, `footer`,
`empty` (jeweils eine Komponente oder ein Element), `columns`,
`horizontal`, `inverted`, `initialIndex`, `estimatedItemSize`,
`onViewableChange` mit `viewability.itemVisiblePercentThreshold`,
`onReachEnd`/`reachEndThreshold`, Pull-to-Refresh und die Scroll-Props. Eine
Ref (`ref<ListHandle>()`) hat `scrollToIndex`, `scrollToItem`, `scrollTo` und
`scrollToEnd`.

- **Zeilen werden nativ recycelt.** Eine weggescrollte Zelle wird an eine
  andere Zeile neu gebunden: dieselben nativen Views, nur geänderte Props.
  Der Komponentenzustand einer Zeile gehört zu ihrem Element und beginnt
  von vorn, wenn ihre Zelle ein anderes Element zeigt.
- **Datenänderungen werden animiert.** Neue `data` erreichen die native Liste
  als Schlüssel, die sie in Einfügungen, Entfernungen und Verschiebungen
  diffen.
- **Nur was sich geändert hat, wird gerendert.** Neue `data` rendern die
  gebundenen Zeilen neu, deren Element sich geändert hat, sowie die Teile
  einer Zeile, die `index` lesen, wenn sie verschoben wurde; ein in
  `renderItem` gelesenes Signal rendert die Zeilen neu, die es lesen, sodass
  eine Zeile nie eine äußere Abhängigkeit braucht. Über einem Store-Array
  ist ein Feldschreibvorgang (`items[3].liked = true`) ein einzelner
  Prop-Schreibvorgang auf der Zelle dieser Zeile.
- **Kein `getItemLayout`.** Zeilen messen sich selbst; `scrollToIndex` landet
  auf der Zeile, während die Zeilen um sie herum gemessen werden.
- `columns` ordnet Elemente in Spalten an; `gap` (oder `rowGap` und
  `columnGap`, wie das `gap` eines Stylesheets kompiliert) setzt den Abstand
  zwischen Zeilen und Spalten. Die Header-, Footer- und Empty-Zeilen
  erstrecken sich über alle Spalten, und Raster haben keine Trennlinien.

Bewusste Unterschiede zu React Native:

- `getItemLayout`, `windowSize`, `initialNumToRender`, `maxToRenderPerBatch`,
  `removeClippedSubviews` und `CellRendererComponent` existieren nicht: die
  Plattform entscheidet, was gerendert wird.
- Die Events einer Zeile steigen durch ihre Zelle zur Liste und deren
  Vorfahren auf, aber eine Zeile ist ein eigenes Modul: sie rendert sich
  selbstständig neu, nie zusammen mit dem Bildschirm.
- Die Min-Content-Länge einer Liste ist null (CSS würde die ihres Inhalts
  verwenden), sodass eine `flex: 1`-Spalte, die eine Liste enthält, nicht auf
  die Länge aller Zeilen gedehnt wird.
- `renderItem` erhält `{ item, index }`; es gibt keinen `separators`-Helfer.
- Wie in React Native rendert eine vertikale Liste in einem vertikalen Scroll
  jede Zeile: Listen ihr eigenes Scrollen geben.
