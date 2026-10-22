# Listen

`List` wird von der Plattform virtualisiert: eine `UICollectionView` auf iOS und eine `RecyclerView` auf Android besitzen Scrollen, Recycling und welche Zeilen existieren. JavaScript rendert eine Zeile nur, wenn die native Liste danach fragt, und Scrollen wartet nie auf JavaScript.

## Wer besitzt was

- **Die native Liste** besitzt die Zellen und entscheidet, welche Zelle welchen Schlüssel zeigt. Sie hält eine Zelle für jede Zeile innerhalb eines Bildschirms vor dem Viewport und acht Reservezellen außerhalb des Bildschirms, sodass Zeilen gerendert werden, bevor sie hereinscrollen.
- **JavaScript** rendert eine Zeile in die Zelle, nach der es gefragt wird. Eine Zelle an einen anderen Schlüssel neu zu binden patcht sie: dieselben Views, Props gediffst. Die Komponenten der Zeile beginnen für das neue Element von vorn.
- **Layout**: jede Zeile ist eine Layout-Wurzel, so breit wie ihre Spalte (eine vertikale Liste) oder wie ihr Inhalt (eine horizontale Liste). Gemessene Größen werden nach Schlüssel gecacht. Eine noch nicht gerenderte Zeile nimmt ihre gecachte Größe, `estimatedItemSize` oder die durchschnittliche gemessene Zeile.

## Stores und feingranulare Zeilen

Eine Zeile ist reaktiv, nicht memoisiert. Jede gebundene Zeile hält eigene Signale: ihr Element, ihren Index, ob sie die letzte Zeile ist und ob sie auf dem Bildschirm ist. Nur die Bindungen, die ein geändertes lesen, laufen erneut.

Über einem [Store](../../../../docs/reactivity.md#stores)-Array sind die Elemente die Objekte des Stores, sodass ein Feld-Schreibvorgang das Element nie ändert:

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

- `items[3].liked = true` erreicht die eine Bindung, die es liest: ein Prop-Schreibvorgang auf einer Zelle, keine Zeile neu gerendert.
- `push`, `splice` und `sort` senden der Liste die Änderungen an ihren Schlüsseln; Zeilen behalten ihre Zellen.
- Ein Element ohne `key` oder `id` wird über seine Identität im Store geschlüsselt. Einen Index durch ein anderes Objekt zu ersetzen ist ein neues Element.

`visible` ist ein Signal pro Zeile, gespeist vom nativen sichtbaren Bereich und der `viewability`-Schwelle: ein Video oder einen Fetch starten, solange die Zeile auf dem Bildschirm ist, und stoppen, wenn sie ihn verlässt. `onViewableChange` meldet denselben Bereich.

## Abschnitte und haftende Kopfzeilen

`sectionKey` benennt den Abschnitt jedes Elements, und jede Folge von Elementen mit demselben Abschnitt bekommt eine Kopfzeile, die `renderSection` rendert. `stickySections` hält die Kopfzeile eines Abschnitts oben in der Liste, während sein Abschnitt darunter scrollt.

```tsx
<List
  data={library.songs}
  sectionKey={(song) => song.album}
  renderSection={({ section }) => <Text class={css.albumTitle}>{section}</Text>}
  stickySections
  renderItem={({ item }) => <SongRow song={item} />}
/>
```

- Die Elemente eines Abschnitts müssen in `data` nebeneinander liegen: ein Abschnitt, der zweimal vorkommt, ist ein Fehler.
- Kopfzeilen überspannen jede Spalte eines Rasters, und auf das letzte Element eines Abschnitts folgt kein Trenner.
- Haftende Kopfzeilen brauchen eine vertikale, nicht invertierte Liste; alles andere ist ein Fehler.

## Kurze Listen: `For`

Eine Liste aus ein paar Dutzend Zeilen in einem `Scroll` braucht keine Virtualisierung: [`For`](../../../../docs/control-flow.md#for) verwenden. Es rendert jede Zeile, nach Element geschlüsselt, und eine Umordnung verschiebt die Views der Zeilen, statt den Bildschirm neu zu planen. Über einem Store-Array bekommt es dieselben Aktualisierungen von einer Prop pro Feld-Schreibvorgang wie `List`.

## Die üblichen Listenprobleme

- **Leere Bereiche beim schnellen Scrollen**: Zeilen einen Bildschirm voraus werden gebunden, bevor sie erscheinen, und eine Zeile behält ihre Größe, während sie wartet.
- **`onReachEnd` feuert wiederholt**: es feuert einmal pro Zeilenanzahl, nicht pro Inhaltslänge.
- **Zeilen hinter der Tastatur verborgen**: eine vertikale Liste rückt ihren Inhalt um den von der Tastatur verdeckten Teil ein und scrollt ein fokussiertes Eingabefeld in einer Zeile darüber. Kein `KeyboardAvoidingView` darum.
- **Jede Zeile wird neu gerendert, wenn sich Daten ändern**: nur gebundene Zeilen rendern erneut, wenn sich ihr Element geändert hat.

## Vertiefung

[Native Listen](../../../../docs/lists.md) behandelt den Zellbindungsablauf, wie Schlüssel als Änderungen übergehen, die reservierten Zeilenschlüssel und das Host-Protokoll.
