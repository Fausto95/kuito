# Native Listen

`List` wird von der Plattform virtualisiert: eine `UICollectionView` auf iOS
und eine `RecyclerView` auf Android besitzen das Scrollen, das Recycling und
die Entscheidung, welche Zeilen existieren. JavaScript rendert eine Zeile
nur, wenn die native Liste danach fragt, und eine recycelte Zelle wird durch
den gewöhnlichen Patch-Diff neu gebunden, statt erneut erstellt zu werden.
Das Scrollen wartet nie auf JavaScript.

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

## Wer besitzt was

- **Die native Liste** besitzt die Zellen und entscheidet, welche Zelle
  welchen Schlüssel zeigt. Für eine Zeile verwendet sie die Zelle wieder, die
  diesen Schlüssel bereits hält, sonst die am längsten nicht genutzte freie
  Zelle, sonst eine neue. Sie hält eine Zelle für jede Zeile innerhalb eines
  Bildschirms vor dem Viewport (ein halber Bildschirm dahinter) und acht
  Reservezellen außerhalb des Bildschirms, sodass Zeilen gerendert werden,
  bevor sie hereinscrollen, und ein kurzes Zurückscrollen gar kein
  JavaScript braucht.
- **JavaScript** rendert eine Zeile in die Zelle, nach der es gefragt wird.
  Jede Zelle ist ein eigenes Modul (`src/runtime/lists.ts`), dessen Wurzel
  die `ListCell`-View ist. Das Neubinden einer Zelle an einen anderen
  Schlüssel patcht dieses Modul: dieselben Views, Props gedifft. Die
  Komponenten der Zeile beginnen für das neue Element von vorn (Zustand,
  Mount-Hooks, Tasks), wie in React Native, wo der Zustand einer Zeile zu
  ihrem Element gehört.
  Wenn neue Daten den Schlüssel einer gebundenen Zeile fallen lassen,
  rendert ihre Zelle nichts: die native Liste kann diese Zelle behalten und
  sie ungefragt wieder zeigen, falls der Schlüssel zurückkehrt, und neue
  Daten rendern die Zeile wieder hinein.
- **Layout**: jede Zeile ist eine Layout-Wurzel in der gemeinsamen
  Flexbox-Engine, so breit wie ihre Spalte (eine vertikale Liste) oder wie
  ihr Inhalt (eine horizontale Liste). Gemessene Größen werden nach Schlüssel
  zwischengespeichert, sodass eine bereits gesehene Zeile in ihrer
  tatsächlichen Größe zurückkommt. Eine noch nicht gerenderte Zeile nimmt
  ihre zwischengespeicherte Größe, `estimatedItemSize` oder den Durchschnitt
  der gemessenen Zeilen und bleibt leer, bis sie eintrifft.

## Stores und feingranulare Zeilen

Eine Zeile ist reaktiv, nicht memoisiert. Jede gebundene Zeile hält eigene
Signale (`src/ui/flat-list.tsx`): ihr Element, ihren Index, ob sie die letzte
Zeile ist und ob sie auf dem Bildschirm ist. Neue Daten verschieben jede
Zeile an die Stelle ihres Elements, schreiben diese Signale, und nur die
Bindungen, die ein geändertes lesen, laufen erneut: eine Zeile, deren Element
dasselbe Objekt ist und die nie `index` liest, rendert nichts, wenn über ihr
Zeilen eingefügt werden.

Über einem [Store](reactivity.md#stores)-Array sind die Elemente die Objekte
des Stores, sodass ein Feldschreibvorgang das Element nie verändert:

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

- `items[3].liked = true` erreicht die eine Bindung, die es liest: ein
  Prop-Schreibvorgang auf einer Zelle, keine Zeile neu gerendert und keine
  Schlüssel gesendet.
- `push`, `splice` und `sort` senden der Liste die Änderungen an ihren
  Schlüsseln (siehe [Schlüssel](#keys)); Zeilen behalten ihre Zellen.
- Ein Element ohne `key` oder `id` wird über seine Identität im Store
  geschlüsselt, sodass es seinen Schlüssel behält, wohin es auch verschoben
  wird. Einen Index durch ein anderes Objekt zu ersetzen ist ein neues
  Element.

`visible` ist ein Signal pro Zeile, gespeist vom nativen `viewable`-Bereich
und dem `viewability`-Schwellenwert: ein Video oder einen Fetch starten,
während die Zeile auf dem Bildschirm ist, und stoppen, wenn sie ihn verlässt.
`onViewableChange` meldet denselben Bereich wie die Viewability-Tokens von
React Native. Das Melden des Bereichs kostet die native Liste bei jedem
Scrollen Arbeit, daher beginnt es erst, sobald eine Zeile `visible` liest
oder `onViewableChange` gesetzt ist.

## Abschnitte und haftende Kopfzeilen

`List` hat Abschnitte ohne einen zweiten Listentyp: `sectionKey` benennt den
Abschnitt jedes Elements, und jede Folge von Elementen mit demselben
Abschnitt erhält eine Kopfzeile, die `renderSection` rendert, mit dem
Abschnitt und seinem ersten Element als Eingabe. `stickySections` hält die
Kopfzeile eines Abschnitts oben in der Liste, während ihr Abschnitt darunter
scrollt; die nächste Kopfzeile schiebt sie beim Eintreffen nach oben.

```tsx
<List
  data={library.songs}
  sectionKey={(song) => song.album}
  renderSection={({ section }) => <Text class={css.albumTitle}>{section}</Text>}
  stickySections
  renderItem={({ item }) => <SongRow song={item} />}
/>
```

- Die Elemente eines Abschnitts müssen in `data` nebeneinander liegen: ein
  Abschnitt, der zweimal vorkommt, ist ein Fehler.
- Kopfzeilen erstrecken sich über alle Spalten eines Rasters, und auf das
  letzte Element eines Abschnitts folgt keine Trennlinie.
- `sectionKey` wird wie `itemKey` gelesen: über einem Store-Array wandert ein
  Element, dessen Abschnitt sich ändert, in seinen neuen Abschnitt.
- Haftende Kopfzeilen brauchen eine vertikale, nicht invertierte Liste;
  alles andere ist ein Fehler. Auf iOS fixiert das Layout der Liste die
  Kopfzeile an Ort und Stelle; auf Android hostet ein Overlay über der
  RecyclerView die Zelle der Kopfzeile, solange sie fixiert ist. In beiden
  Fällen ist die Kopfzeile die von JavaScript gerenderte Zeile, mit ihren
  Handlern.

## Kurze Listen: For

Eine Liste mit einigen Dutzend Zeilen innerhalb eines `Scroll` braucht keine
Virtualisierung: [`For`](control-flow.md#for) verwenden. Es rendert jede
Zeile, nach Element geschlüsselt, und eine Umsortierung verschiebt die Views
der Zeilen, statt den Bildschirm neu zu planen. Über einem Store-Array erhält
es dieselben Ein-Prop-pro-Feldschreibvorgang-Updates wie `List`.

## Schlüssel

Die Schlüssel einer Liste überqueren die Host-Grenze als Änderungen an den
zuletzt gesendeten Schlüsseln, nie erneut als das ganze Array: ein Anhängen
ist eine Einfügung, ein Entfernen eine Entfernung, unabhängig von der Länge
der Liste. Der Kernel (`src/runtime/key-diff.ts`) vergleicht die Schlüssel mit
den von ihm gesendeten und schreibt, in dieser Reihenfolge:

1. eine Entfernung für jeden Schlüssel, der weggefallen ist, an seinem Index,
   sobald die Entfernungen davor abgeschlossen sind;
2. eine Verschiebung für jeden Schlüssel, der seinen Platz gewechselt hat,
   so wenige wie nötig, um die neue Reihenfolge zu erreichen: Schlüssel auf
   einer längsten bereits geordneten Folge bleiben, wie wenn der Kernel die
   Kinder einer View umordnet (`src/runtime/reconcile.ts`);
3. eine Einfügung für jeden neuen Schlüssel, an seinem endgültigen Index,
   vom ersten bis zum letzten.

Jede Änderung gilt für die Schlüssel, die die Änderungen davor hinterlassen
haben; der Index einer Verschiebung zählt, sobald der Schlüssel seinen Platz
verlassen hat. Die ersten Schlüssel sind alle Einfügungen am Ende, und null
leert die Liste.

Die Renderer wenden einen Diff als Ganzes an (`Views/KuitoListKeys`): eine
Entfernung muss den Schlüssel an ihrem Index benennen, eine Verschiebung
einen Schlüssel, den die Liste hat, eine Einfügung einen Schlüssel, der ihr
fehlt, und einen Index innerhalb der Liste. Eine Änderung, die nicht passt,
wirft `unsupportedValue` auf `keys` und lässt die Schlüssel, wie sie waren;
ein zweimal eingefügter Schlüssel ist derselbe Fehler, da Schlüssel eindeutig
sein müssen. Die Liste indiziert ihre Schlüssel dann neu, haftende Zeilen
eingeschlossen, sodass eine haftende Kopfzeile am neuen Platz ihres
Schlüssels fixiert wird. Auf iOS animiert die Diffable Data Source die
Änderung; auf Android wird dem Adapter jede Einfügung, Entfernung und
Verschiebung mitgeteilt, während sie geschieht, ohne `DiffUtil`-Durchlauf.
Die ersten Zeilen und eine geleerte Liste werden sofort geladen.

## Host-Protokoll

Native Arten: `List`, `HorizontalList` (die Achse ist beim Erstellen der
View festgelegt, wie bei Scroll) und `ListCell`.

| List-Prop                            | Wert                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `keys`                               | Änderungen an den zuletzt gesendeten Zeilenschlüsseln (siehe [Schlüssel](#keys)); die Schlüssel sind eindeutig, und Änderungen werden animiert                                                                                                                     |
| `stickyKeys`                         | JSON-Array der Zeilen, die oben haften, während ihr Abschnitt scrollt (nur `List`)                                                                                                                                                                                 |
| `spanningKeys`                       | JSON-Array der Zeilen, die sich über alle Spalten erstrecken (Header, Footer, Empty, Abschnitte)                                                                                                                                                                   |
| `numColumns`                         | Spalten einer vertikalen Liste                                                                                                                                                                                                                                     |
| `gap`, `rowGap`, `columnGap`         | Punkte zwischen Zeilen und zwischen Spalten, wie in einem Flex-Container: `rowGap` zwischen den Zeilen einer vertikalen Liste, `columnGap` zwischen den Spalten eines Rasters und den Zeilen einer horizontalen Liste; `gap` setzt beide (ebenso als Layout-Props) |
| `inverted`                           | Erste Zeile am Ende; die Liste und jede Zeile sind gespiegelt                                                                                                                                                                                                      |
| `estimatedItemSize`                  | Länge einer noch nicht gemessenen Zeile                                                                                                                                                                                                                            |
| `initialScrollKey`                   | Zeile, die zuerst angezeigt wird, sobald sie existiert                                                                                                                                                                                                             |
| `scrollTo`                           | Eine Anfrage, JSON: `{ key, animated, viewPosition, viewOffset }`, `{ offset, animated }` oder `{ end, animated }`, nummeriert durch `request`                                                                                                                     |
| `emitsViewable`, `viewableThreshold` | Die sichtbaren Zeilen melden; Anteil einer Zeile, der zählt                                                                                                                                                                                                        |
| Scroll-Props                         | `emitsScroll`, `scrollInterval`, `reachEndThreshold`, `refreshable`, `refreshing`, `scrollbar`, `keyboard`, wie bei Scroll                                                                                                                                         |

| ListCell-Prop | Wert                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `cellKey`     | Der Schlüssel, den JavaScript in die Zelle gerendert hat; die Zeile wird angezeigt, wenn er dem von der Liste angefragten Schlüssel entspricht |

| List-Event          | Payload                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `bind`              | `{ cell, key }`: `key` in `cell` (`<list>:cell-<n>`) rendern, beim ersten Mal wird die ListCell erstellt |
| `viewable`          | `{ first, last }`: Schlüssel der ersten und letzten sichtbaren Zeile                                     |
| `reachend`          | Einmal pro Zeilenanzahl                                                                                  |
| `scroll`, `refresh` | Wie bei Scroll                                                                                           |

Header-, Footer- und Empty-Zeilen sind Zeilen mit den Schlüsseln `#header`,
`#footer` und `#empty`, und die Kopfzeile eines Abschnitts ist
`#section:<section>`; ein Elementschlüssel darf keinen davon annehmen. Wenn
eine Liste entfernt wird, entfernt der Kernel zuerst ihre Zellen (und deren
Zeilen).

## Wie sie die üblichen Listenprobleme vermeidet

- **Leere Bereiche beim schnellen Scrollen**: Zeilen einen Bildschirm voraus
  werden gebunden, bevor sie erscheinen, und eine Zeile behält ihre Größe,
  während sie wartet, sodass nichts springt. Ein sehr schnelles Schleudern
  kann JavaScript dennoch überholen; diese Zeilen bleiben für ein oder zwei
  Frames leer, zeigen aber nie veralteten Inhalt.
- **Wiederholtes Auslösen von `onReachEnd`**: es wird einmal pro
  Zeilenanzahl ausgelöst, nicht pro Inhaltslänge, sodass Zeilen, die sich
  selbst messen, es nicht erneut auslösen können.
- **`getItemLayout` für Scroll-to-Index**: die Liste scrollt zur geschätzten
  Position der Zeile und landet exakt auf ihr, während die Zeilen um sie
  herum gemessen werden. Ein weiter animierter Sprung springt auf einen
  Bildschirm vor dem Ziel und animiert den Rest.
- **Hinter der Tastatur verborgene Zeilen**: eine vertikale Liste rückt
  ihren Inhalt um den von der Tastatur verdeckten Teil ein, zusätzlich zu
  ihrem Padding, und scrollt eine fokussierte Eingabe in einer Zeile darüber,
  wie Scroll es tut (docs/keyboard.md). Keine `KeyboardAvoidingView`
  darum herum.
- **Neurendern jeder Zeile, wenn sich äußere Daten ändern**: nur gebundene
  Zeilen (auf oder nahe dem Bildschirm) rendern erneut, wenn sich ihr Element
  geändert hat, und ein in `renderItem` gelesenes Signal oder ein
  Store-Pfad rendert nur die Teile der Zeilen neu, die es lesen.
