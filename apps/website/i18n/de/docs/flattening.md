# View-Flattening

Ein Container, der seine Kinder nur gruppiert und positioniert, bekommt keine
native View. Er behält seinen Knoten im gemeinsamen Layout-Baum
(`native/shared/layout`), sodass er seine Kinder weiterhin dimensioniert und
platziert; deren Views schließen sich dem nächsten Vorfahren an, der eine View
hat, verschoben um die Position des Containers. Das Flattening ist automatisch:
Es gibt kein `collapsable`-Prop. React Natives Fabric tut dasselbe in seinem
Differentiator.

## Was layout-only ist

Ein Knoten ist layout-only, wenn all dies gilt:

- Seine Art ist ein einfacher Container: `VStack`, `HStack`, `Box` oder `Spacer`.
- Jedes Prop, das er hat, ist ein Layout-Prop in `src/protocol/manifest.ts`
  (Anliegen `layout`, generiert in `LAYOUT_PROPS`): Padding, Margin, Größe,
  Position und Flexbox-Props.
- Er hat keinen Event-Handler (`onPress`, `onScroll`, ...) und keine `ref`.
- Kein Prop ist eine Animation (`timing(200).to(0)`, `spring().to(12)`) oder
  wird von einem Motion-Wert auf dem UI-Thread gesteuert (`docs/motion.md`).

Jedes andere Prop behält die View: Hintergrund, Verlauf, Rahmen, Eckenradius,
Schatten, Deckkraft, Transformationen, `overflow`, `hidden`, `transition`,
`animate`, `enter`/`exit`, Barrierefreiheits-Props. Die Tabelle listet, was
geflattet werden darf, statt was nicht, sodass ein neues Prop seine View
behält, sofern sein Manifest-Eintrag kein Layout-Prop ist; `hidden` ist eines,
das dennoch eine View braucht (`needsView`).

Der Schlüssel entscheidet, nicht der Wert: `backgroundColor={on.value ? 'red' : null}` behält seine View, solange die Farbe aus ist, sodass das Umschalten nie Views erzeugt
und zerstört.

## Wo es geschieht

Der Kernel entscheidet, wenn er einen Plan committet; die Renderer führen es
aus. Der Kernel ist die einzige Stelle, die alles sieht, was eine View braucht,
da Event-Handler, Refs und Animationen den Host nie als Props erreichen. Er
wendet zudem dieselbe Regel auf beiden Plattformen an und wird ohne Gerät
getestet (`test/flattening.test.ts`).

Der Host-Batch trägt es in zwei Records (docs/native-scheduling.md):

- `Create` mit gesetztem Flattened-Flag erzeugt einen Layout-only-Knoten.
- `Flatten` gibt einem committeten Knoten seine View oder nimmt sie ihm weg.

## Promotion und Demotion

Wenn ein Commit einem geflatteten Knoten ein View-erzwingendes Prop hinzufügt,
sendet der Kernel `setFlattened(id, false)` vor dem Prop. Der Renderer erzeugt
die View, setzt sie dorthin, wo der Knoten in der Baumreihenfolge steht, und
verschiebt die Views der Kinder des Knotens hinein. Ein später gesetztes Prop,
aus einer Bindung oder dem `setProperty` eines Element-Handles, promotet den
Knoten auf dieselbe Weise.

Wenn ein Commit das letzte View-erzwingende Prop entfernt, löscht der Kernel
zuerst die Props auf der View und sendet dann `setFlattened(id, true)`. Der
Renderer verschiebt die Views der Kinder zum nächsten Vorfahren mit einer
View, in derselben Reihenfolge, und entfernt die View. Ein Knoten wird nur bei
einem Commit wieder geflattet, sodass ein Prop, das sich jeden Frame ändert,
nie Views hin und her erzeugt.

Keiner der beiden Vorgänge remountet die Kinder: Ihre nativen Views und ihr
Zustand (der Text eines Feldes, eine Scroll-Position) bleiben erhalten.

## In den Renderern

Beide Renderer behalten dieselbe Form:

- Jeder Knoten hat einen Layout-Knoten und einen Stil. Ein geflatteter Knoten
  hat keine View.
- `place` setzt die View eines Knotens in seinen Host (den nächsten Vorfahren
  mit einer View, den Inhalt eines Scroll oder die Wurzel) vor die nächste View
  in Baumreihenfolge. Ein geflatteter Knoten platziert stattdessen die Views
  seiner Kinder.
- Frames: Die Kinder eines geflatteten Knotens werden an ihrem eigenen Frame
  plus den Frames jedes geflatteten Vorfahren bis zum Host platziert
  (`applyFramesToChildren` auf iOS, `KuitoFlexLayout.forEachChildView` auf
  Android).

## Events, Hit-Testing und Barrierefreiheit

Events ändern sich nicht. Ein Press geht an die native View, die berührt
wurde, und bubbelt durch den Baum des Kernels, der geflattete Knoten
einschließt: `composedPath()`, `currentTarget` und `parent` sind dieselben wie
ohne Flattening. Geflattete Arten geben keine eigenen nativen Events aus.

Hit-Testing ändert sich ebenfalls nicht, mit einer Ausnahme, derselben wie in
Fabric. UIKit und Android hit-testen ein Kind nur innerhalb der Grenzen seines
Elternelements. Ein Kind, das über einen geflatteten Container hinausragt, kann
außerhalb der Box dieses Containers berührt werden, solange es innerhalb des
nächsten echten Vorfahren liegt.

Einfache Container sind auf keiner der beiden Plattformen
Barrierefreiheitselemente, und die Views behalten ihre Reihenfolge, sodass
VoiceOver und TalkBack dieselben Elemente in derselben Reihenfolge vorlesen.
Ein Container mit Barrierefreiheits-Props behält seine View.
