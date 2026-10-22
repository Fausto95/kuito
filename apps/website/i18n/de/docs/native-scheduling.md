# Natives Scheduling und der Host-Batch

Hermes ruft C++ im selben Prozess über JSI auf; es gibt keine serialisierte
Bridge. Jeder JS-Job (eine Auswertung, ein Ereignis, ein Timer, ein
Netzwerkabschluss, ein Modul-Callback) sendet der Plattform höchstens einen
Batch typisierter View-Mutationen, und die Plattform wendet die Batches der
Reihe nach auf ihrem UI-Thread an.

## Threads

- Android: Ein `HandlerThread("KuitoHermes")` erzeugt, betreibt und zerstört
  die Hermes-Laufzeit. Der Main-Looper besitzt jede View. Timer und
  OkHttp-Abschlüsse posten zurück auf den Hermes-Thread.
- iOS: Eine serielle Queue `dev.kuito.hermes` besitzt die Laufzeit,
  Auswertungen, Ereignisse, Timer und URLSession-Abschlüsse. Batches gehen an
  die Main-Queue.
- Die UI-Thread-Laufzeit (docs/motion.md) läuft auf dem UI-Thread der
  Plattform neben den Views; die Props, die sie schreibt, werden angewendet,
  bevor ihr Einstiegspunkt zurückkehrt.

## Der Batch: ein Aufruf pro Job

Der Kernel schreibt jede View-Mutation eines Jobs als Datensatz in einen
`ArrayBuffer` (`src/runtime/wire.ts`) und sendet ihn mit einem Aufruf,
`__kuitoHostCommit(buffer, byteLength, strings)`. C++ dekodiert ihn einmal in
typisierte `Mutation`s (`native/shared/Wire.h`, `Mutation.h`).

Datensätze sind little-endian und gepackt; Strings reisen neben dem Buffer,
und ein Datensatz benennt sie per Index:

| Op           | Felder                                                             |
| ------------ | ------------------------------------------------------------------ |
| 1 `Create`   | `u32 id`, `u32 parent` (0: die Wurzel), Art, Label, `u8` flattened |
| 2 `Remove`   | `u32 id`                                                           |
| 3 `Move`     | `u32 id`, `u32 parent`, `u32 index`                                |
| 4 `Flatten`  | `u32 id`, `u8` flattened                                           |
| 5 `Prop`     | `u32 id`, `u16 key` (0xffff: ein Name folgt), Wert                 |
| 6 `Command`  | `u32 id` (0: die App), Name, Argument                              |
| 7 `UI`       | ein JSON-Array von UI-Thread-Operationen                           |
| 8 `UIScript` | Quelltext, URL                                                     |

Ein Wert ist ein Tag und seine Nutzlast: null, eine `f64`-Zahl, false, true,
Text, JSON-Text oder ein Key-Diff. Ein Key-Diff ist eine `u32`-Anzahl, dann
jede Änderung als `u8`-Op (insert, remove, move), ein `u32`-Index und der Key:
die Keys einer Liste als Änderungen gegenüber den zuvor gesendeten Keys
(docs/lists.md#keys). Nur eine Prop vom Manifest-Typ `keys` nimmt einen
entgegen, und eine solche Prop nimmt sonst nichts als null entgegen.

Ein Prop-Key ist der Index der Prop in `src/protocol/manifest.ts`
(`native/shared/PropKeys.generated.h`, die `PROP_KEYS` des Kernels); die
eigene Prop einer Modul-View geht per Name. Views sind Nummern, die der Kernel
vergibt und nie wiederverwendet; das Label (die `id` der App oder der Pfad des
Kernels) überquert die Grenze einmal, mit dem Create, für Fehlermeldungen und
damit eine Liste die von ihr angeforderte Zelle übernehmen kann.

C++ typisiert jeden Wert nach der Manifest-Art seiner Prop: Eine Farbe kommt
als Hex-Text an und wird einmal zu `0xRRGGBBAA` geparst, ein Enum wird zu
seinem Index unter den Werten des Manifests, eine Zahl muss eine Zahl sein.
Ein Wert der falschen Art weist den Batch zurück und nennt die Prop.

Wann der Batch geht:

- Ein Commit (`src/runtime/transaction.ts`) sendet seine Datensätze allein,
  wenn seine Arbeit endet: Ein Batch, den der Host zurückweist, ist genau der
  Commit, den der Kernel rückgängig macht.
- Andere Schreibvorgänge (der neue Wert einer Bindung, das `setProperty`
  eines Elements, ein Command) warten, bis der sie umgebende Scope endet, das
  Dispatchen eines nativen Ereignisses, und gehen außerhalb eines solchen
  sofort.
- UI-Thread-Operationen gehen mit dem nächsten Batch, nach den Views, die sie
  benennen; kommt kein Batch, am Ende des Tasks.

## Die View-Tabelle

`native/shared/ViewTable.{h,cpp}` hält `id → { kind, label, parent }` für jede
View, die die Batches erstellt haben, und prüft jeden Batch dagegen, bevor
irgendetwas davon die Plattform erreicht. Sie weist als Ganzes zurück:

- ein Create einer id, die existiert,
- ein Einfügen (ein Create oder ein Move) unter einem Parent, der nicht
  existiert,
- ein Remove eines Parents vor seinen Kindern,
- einen Schreibvorgang oder Command an eine View, die nicht mehr existiert.

Ein zurückgewiesener Batch wirft im `__kuitoHostCommit`-Aufruf des Kernels,
wo das Journal des Commits die Kernel-Seite rückgängig macht. Die
akzeptierten Batches des Jobs gehen in die `MutationQueue` des Jobs; ein Job,
der später wirft, verwirft sie, und die Tabelle nimmt sie zurück, sodass
Tabelle und Plattform nie einen halben Job sehen.

`MutationQueue` behält strukturelle Datensätze in Reihenfolge und nur den
letzten Schreibvorgang pro Prop innerhalb jedes eingezäunten Abschnitts
(Creates, Removes, Flattens, Commands und UI-Datensätze bilden Zäune; Moves
nicht), an der Position dieses letzten Schreibvorgangs. Ein Key-Diff ändert,
was vor ihm kam, daher wird er nie verworfen und kein Schreibvorgang seiner
Prop verschmilzt über ihn hinweg.

## Die Plattformen

- iOS: Die Bridge übergibt Swift die Mutationen des Jobs als C-Array von
  `KuitoMutationRecord` (`native/ios/Renderer/KuitoMutationRecord.h`), eine
  Sicht auf die C++-`Mutation`s, die an Ort und Stelle gelesen werden;
  `KuitoUIKitRenderer.apply(_:)` führt jede davon aus. Swift importiert die
  C++-Typen selbst nicht: Das würde jedes Swift-Target für ein einziges Struct
  auf C++-Interop umstellen.
- Android: ein JNI-Aufruf pro Batch mit parallelen primitiven Arrays (Op,
  Wert-Art, Key, id, Parent, ein Int, eine Zahl, Text, Name und die Änderungen
  eines Key-Diffs), gelesen von `KuitoMutations`;
  `KuitoAndroidRenderer.apply` führt jeden Datensatz aus.
- Renderer schlüsseln ihre Views nach Nummer und halten eine Map, id → der
  Style der View; der Parent einer View steht an ihrem Style. Er ist nicht
  immer der Parent ihres Layout-Knotens: Eine Page, ein Sheet oder eine
  Listenzeile ist eine eigene Layout-Wurzel, daher kann der Layout-Baum allein
  nicht die Hierarchie sein. Setter erhalten einen typisierten `KuitoValue`
  und parsen keinen Skalar; die eigenen Props einer nativen Modul-View
  dekodieren `untyped`, den Wert als Skalar (docs/native-modules.md#views).

## Der Frame

Batches wechseln an einer Stelle auf den UI-Thread,
`native/shared/FrameHandoff.h`, die beide Laufzeiten teilen. Der JS-Thread
pusht den Batch jedes Jobs; der erste, den ein untätiger Handoff erhält,
fordert bei der Plattform einen Display-Frame an (ein `CADisplayLink` auf
iOS, `Choreographer` auf Android), den einzigen Frame-Callback, den eine der
beiden Shells hat.

In diesem Frame wendet `UIRuntime::drain(now, budget)` die wartenden Batches
der Reihe nach für bis zu ~4 ms an, mindestens einen, was immer er kostet,
jeden über den Renderer der Plattform (dessen `ui`- und `ui-script`-Datensätze
der Reihe nach zurück an die UI-Laufzeit gehen). Dann führt er den Frame des
UI-Kernels aus, nach den Batches, damit Motion die von ihnen erzeugten Views
sieht. Er fordert einen weiteren Frame an, solange Batches warten oder etwas
animiert. Ein Batch, der während des Drains gepusht wird, wartet auf den
nächsten Frame.

Ein Frame, der mit Batches endet, die er hätte anwenden sollen, markiert den
Handoff als beschäftigt: Der UI-Thread hängt zurück. Der Kernel liest das
über `__kuitoHostBusy()` und hält seine strukturellen Neuplanungen solange
zurück, da deren Batches sich nur hinter den noch nicht angewendeten einreihen
würden. Schreibvorgänge gehen weiterhin sofort. Der Drain, der aufholt,
sendet das App-Ereignis `host.idle` (docs/events.md), und jede Neuplanung,
die gewartet hat, läuft einmal, für alle Schreibvorgänge hinter ihr.

## Ereignisse

Native Ereignisse überqueren die Grenze in die andere Richtung als
`(handle, event, payload)`: die Nummer der View (0 für die App), der Name des
Ereignisses und seine JSON-Nutzlast (docs/events.md).

## Verifikation

`test/native-batch.cpp` (ausgeführt von `npm test`) dekodiert Datensätze
jeder Art, weist fehlerhafte und Werte der falschen Art zurück und prüft die
Zurückweisungen der Tabelle, ihr Rollback ganzer Batches, das Zusammenführen
der Queue sowie Budget und Busy-Flag des Frame-Handoffs.
`test/incremental.test.ts` prüft, dass Neuplanungen warten, solange der Host
beschäftigt ist, und bei `host.idle` einmal laufen.
`test/native-batch.test.ts` prüft die Kernel-Seite: ein Host-Aufruf für ein
erstes Rendern und für ein Ereignis, typisierte Werte, UI-Operationen nach
den Views, die sie benennen, und ein zurückgewiesener Batch, der im Kernel
rückgängig gemacht wird.
