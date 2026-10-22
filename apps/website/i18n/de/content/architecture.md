# Architektur

Kuito besteht aus sechs Teilen: einem Compiler, einem Reaktivitätsmodell, einer Laufzeit auf dem Gerät, zwei Renderern mit einer Form, View-Flattening und Live Patch. Native Module erweitern all das. Jeder Teil unten verlinkt auf die Seite, die tiefer geht.

<!-- diagram: kuito-architecture.svg -->

## Compiler

TSX und CSS werden zur Build-Zeit zu einem JavaScript-Bundle und nativen Style-Eigenschaften.

- **Oxc** senkt TSX ab. Ein JSX-Ausdruck, der ein Signal liest (`opacity={visible.value ? 1 : 0}`), wird zu einer Closure, die die Laufzeit abonniert.
- **Rolldown** bündelt die App mit ihren npm-Abhängigkeiten, unverändert.
- **Der Style-Compiler** verwandelt `.css`-Dateien und `styles()` in numerische native Eigenschaften, plus kleine schriftrelative Anweisungen für `em`. Nicht unterstütztes CSS lässt den Build fehlschlagen; nichts parst CSS auf dem Gerät.

Vertiefung: [Stylesheets](../../../docs/styles.md), [CSS-Einheiten](../../../docs/css-units.md), [Nativer Renderer](../../../docs/native-renderer.md).

## Reaktivität

Ein Signal hält einen Wert. JSX, das es liest, folgt ihm; ein Schreibzugriff aktualisiert die nativen Eigenschaften, die es lesen, und die Komponentenfunktion läuft nicht erneut.

<!-- diagram: kuito-reactivity.svg -->

- `computed` leitet ab, `watch` und `effect` reagieren, `store` macht jeden Pfad eines Objekts zu einem Signal.
- Schreibzugriffe batchen sich selbst: Alles, was ein Event schreibt, erreicht den Bildschirm zusammen.
- `Show`, `Switch` und `For` besitzen ihren Zweig; eine Änderung plant nur diesen Zweig neu.
- Eine Komponenteninstanz ist ihr Platz, ihre Definition und ihr `key`. Jeder Hook behält seinen Slot über den Namen, nicht über die Aufrufreihenfolge, sodass State Bearbeitungen überlebt.

Vertiefung: [Reaktivität](../../../docs/reactivity.md), [Kontrollfluss](../../../docs/control-flow.md), [Live Patch](../../../docs/incremental.md).

## Laufzeit

JavaScript läuft in Hermes innerhalb des nativen Prozesses, auf einem eigenen Thread. Views leben auf dem UI-Thread.

<!-- diagram: kuito-threads.svg -->

- Jeder Job (ein Event, ein Timer, ein Netzwerkabschluss) sendet höchstens einen Batch typisierter View-Mutationen: `Create`, `Remove`, `Move`, `Flatten`, `Prop`, `Command`.
- Der Batch ist ein `ArrayBuffer`, einmal in C++ dekodiert. Hermes ruft C++ über JSI auf; es gibt keine serialisierte Bridge.
- Der UI-Thread wendet Batches der Reihe nach an. Native Events gehen auf demselben Weg zurück in die Warteschlange von Hermes.
- Animationen und Gesten können auf dem UI-Thread laufen, direkt bei den Views, ohne einen JavaScript-Callback pro Frame.

Vertiefung: [Threads und der Host-Batch](../../../docs/native-scheduling.md), [Hermes auf dem Gerät](../../../docs/on-device-hermes.md), [Motion](../../../docs/motion.md).

## Renderer

UIKit auf iOS und Android Views auf Android implementieren dieselben View-Operationen mit demselben Layout.

<!-- diagram: kuito-renderer.svg -->

- Der Kernel nummeriert Views und committet einen Plan; ein Label wird auf ein natives Objekt abgebildet, das über kompatible Patches hinweg erhalten bleibt.
- Eine View-Factory bildet jede Art auf eine native View ab. Eigenschaftstabellen, eine pro Belang, sind nach Prop-Namen indiziert; ein Paritätstest hält beide Plattformen am Manifest.
- Jeder Renderer führt einen Datensatz pro View: ihre native View, ihren Layout-Knoten, ihre Gesten, ob sie gerade verschwindet.
- Eine Prop landet auf beiden Plattformen in derselben Änderung, oder die Dokumentation sagt, welcher sie fehlt.

Vertiefung: [Nativer Renderer](../../../docs/native-renderer.md), [Events](../../../docs/events.md).

## Flattening

Ein Container, der seine Kinder nur gruppiert und positioniert, bekommt keine native View.

<!-- diagram: kuito-flattening.svg -->

- Nur Layout: `VStack`, `HStack`, `Box` oder `Spacer`, nur Layout-Props, kein Handler, kein Ref, keine Animation.
- Sein Knoten bleibt im Layout-Baum; die Views seiner Kinder schließen sich dem nächsten Vorfahren mit einer View an.
- Der Schlüssel der Prop entscheidet, nicht ihr Wert: `backgroundColor={on.value ? 'red' : null}` behält seine View, während die Farbe aus ist, sodass Umschalten nie Views erzeugt und zerstört.
- Der Kernel entscheidet beim Commit; die Renderer führen es aus. Keine `collapsable`-Prop.

Vertiefung: [View-Flattening](../../../docs/flattening.md).

## Live Patch

Eine gespeicherte Datei aktualisiert die laufende App. State und native Views überleben, wenn die Bearbeitung kompatibel ist.

<!-- diagram: kuito-live-patch.svg -->

- Komponenten tragen eine stabile ID und einen Fingerabdruck der Syntax, von der sie abhängen. Eine Bearbeitung führt die Komponenten erneut aus, die lesen, was sich geändert hat, und nur diese; eine Neuformatierung führt keine erneut aus.
- Patches sind JavaScript-Quelltext über einen lokalen WebSocket, angewendet von der persistenten Hermes-Laufzeit. Änderungen an nativem Code brauchen einen Rebuild.
- Ein Patch, der sich nicht anwenden lässt, wird abgelehnt; die vorherige Version bleibt live und die LogBox sagt, warum.

Vertiefung: [Live Patch](../../../docs/incremental.md), [Devtools](../../../docs/devtools.md), [LogBox](../../../docs/logbox.md).

## Native Module

Plattformcode, den eine App aufruft: eine Swift-Klasse, eine Kotlin-Klasse und eine TypeScript-Spezifikation, die beide deklariert.

<!-- diagram: kuito-native-modules.svg -->

- Der Compiler liest die Spezifikation, ohne sie auszuführen, und behält einen Stub pro Funktion, die die App aufruft; das Bundle enthält nur diese.
- Module werden per ID in die Shells gelinkt, die die CLI generiert. Die App checkt kein natives Projekt ein.
- Ein Modul kann Funktionen, von der Plattform aktualisierte Signals und in JSX gerenderte Views bereitstellen, wie `Camera`, `Video` und `WebView` es tun.
- Kuitos eigene Fähigkeiten (`haptics`, `location`, `storage`, …) sind Module dieser Art.

Vertiefung: [Native Module](../../../docs/native-modules.md), [App-Projekte](../../../docs/apps.md).

## Entscheidungen

Die Regeln, die jeder Teil einhält, und was noch offen ist, stehen im [Decision Record](../../../docs/architecture.md).
