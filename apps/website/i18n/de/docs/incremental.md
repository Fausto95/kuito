# Inkrementelle Aktualisierung auf Komponentenebene

Kuitos Entwicklungs-Compiler weist benannten Komponentenfunktionen stabile
`modulePath#functionName`-IDs und Quell-Fingerabdrücke zu. Die Runtime hält einen
Deskriptor-Cache pro Instanz, geschlüsselt nach Modul-ID und logischem Komponentenpfad.

Der Fingerabdruck einer Komponente umfasst ihren eigenen Code und jede Top-Level-Anweisung
ihres Moduls, die sie liest, direkt oder über andere Top-Level-Anweisungen: das Bearbeiten
einer Konstante oder eines Helfers führt die Komponenten erneut aus, die sie lesen, und nur diese. Lesezugriffe
werden über die Bindung aufgelöst, sodass ein Name, den die Komponente selbst deklariert, kein Lesezugriff
auf die Anweisung des Moduls mit diesem Namen ist. Eine Komponente, die eine andere nur als
JSX rendert (`<Card />`), wird nicht gelesen: ihr eigener Fingerabdruck deckt ihre Bearbeitungen ab.

Ein Fingerabdruck hasht den Syntaxbaum, nicht den Text: Positionen, Kommentare,
Klammern, Anführungszeichenstile und JSX-Einrückung zählen nicht. Eine Bearbeitung, die Code nur
neu formatiert oder kommentiert, führt keine Komponente erneut aus und sendet kein Prop. JSX-Ausdrücke
werden auf dieselbe Weise geschlüsselt, ebenso UI-Thread-Funktionen
(`docs/motion.md`).

Bei einer Quellaktualisierung verwenden unveränderte Komponenten mit unveränderter Prop-Identität ihren
vorherigen Deskriptorbaum wieder, was erneute Ausführungen beliebigen Codes in diesen
Komponenten verhindert. Verschachtelte Kindkomponenten werden über eine frische Definitions-Registry
aufgelöst, sodass das Bearbeiten eines Kindes es aktualisieren kann, auch wenn sein Elternteil gecacht bleibt.

Eine Komponenteninstanz ist ihr Platz im Baum, ihre Komponentendefinition und
ihr `key`, alle drei in ihrem Pfad: `<parent path>.<place>.c<definition>:<key>`.
Ein `key` zählt überall dort, wo ein Element ist, in einer Liste oder als einzelnes Kind. Ein
Platz, der eine andere Komponente rendert, oder dieselbe mit einem anderen Key, hält also
eine neue Instanz mit eigenem Pfad, deren Views neue Labels erhalten und neu gemountet werden,
und die Instanz, die gegangen ist, gibt ihren Zustand frei (`docs/control-flow.md`). Eine View
mit einem `id`-Prop ist die Ausnahme: ihr Label ist die ID, sodass sie dieselbe
native View bleibt, wo immer sie rendert, solange ihre Art und ihr Elternteil gleich bleiben.

Jede Neuplanung, eine Aktualisierung oder ein `Show`-Umschalten, sendet einer nativen View nur die Props,
die sich geändert haben: Skalare werden mit `Object.is` verglichen, und Objekt-Props (`style`,
`gestures`, Verläufe) anhand des JSON, als das sie zuletzt die Host-Grenze überquert haben,
da der Planer sie bei jedem Durchlauf neu aufbaut. Ein `Show`-Umschalten plant nur seinen
Zweig (`docs/control-flow.md`).

Zustands-Slots, native View-Identität, Refs und `onMount`-Einträge mit Instanzlebensdauer
werden beibehalten, solange der Pfad einer Instanz besteht. Innerhalb einer
Instanz behält jeder Hook seinen Slot nach Name, nicht nach Aufrufreihenfolge
(`docs/reactivity.md`): das Hinzufügen, Umordnen oder bedingte Aufrufen von Hooks bewahrt
den Zustand der übrigen.
Effekt-/Watch-Scopes und asynchrone Arbeit werden verworfen und ersetzt, wenn ihre besitzende
Komponente erneut ausgeführt wird; unveränderte Komponenten-Scopes bleiben intakt. Ein Hook, den ein
Patch entfernt, wird verworfen, und entfernte Komponenten geben die Zustands-, Async-
und Lifecycle-Scopes aller ihrer Hooks frei.

**Verbleibende Einschränkungen:** Dies ist Memoisierung pro Komponente während HMR, kein
inkrementeller Quell-Bundler: Rolldown erzeugt weiterhin ein JS-Bundle neu. Eine
Komponente mit geändertem Quellcode führt ihre Funktion erneut aus, sodass Ausdrücke außerhalb
feingranular gecachter Bindungen neu ausgewertet werden können. Ein aus einer anderen Datei importierter Wert wird nur durch
seine `import`-Anweisung abgedeckt, sodass eine Komponente, die eine in einer anderen Datei bearbeitete Konstante
liest, gecacht bleibt, bis sich ihr eigenes Modul ändert. Der Prop-Vergleich ist ein flaches
`Object.is`; veränderliche Objekte können die Korrektheit untergraben. Neu zusammengesetzte
Komponenten ohne stabile Compiler-Identitäten fallen auf erneute Ausführung zurück.
Bedingte Kinder ohne stabile Keys können beim Umordnen ihre Identität ändern.
Host-Mutationen sind nicht transaktional umkehrbar, und Effekte laufen auf dem
aktuellen VM-/UI-Thread. Nebenwirkungen in Komponentenfunktionsrümpfen sind zu vermeiden.
