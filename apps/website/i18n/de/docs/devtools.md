# Devtools

Entwicklungs-Builds der Kuito-Shells enthalten Devtools. Sie bleiben der App
aus dem Weg: es gibt keinen schwebenden Button.

## Öffnen

| Wo                   | Wie                                        |
| -------------------- | ------------------------------------------ |
| iOS-Simulator        | ⌘D                                         |
| Android-Emulator     | ⌘M / Strg+M oder die Menütaste             |
| Ein physisches Gerät | Schütteln                                  |
| Die `kuito dev`-CLI | `m` drücken (funktioniert für jedes Gerät) |

Sie öffnen sich als natives Sheet mit:

- **Verbindung.** Ob die App mit dem Dev-Server verbunden ist, sowie Grund und
  Countdown, während sie neu verbindet.
- **Reload / Reconnect.** Reload startet die App in einer frischen
  Hermes-Laufzeitumgebung mit dem neuesten Quellcode neu; Reconnect öffnet den
  Dev-Link erneut.
- **Live Patch.** Die letzten Aktualisierungen und wie lange das Anwenden jeder
  einzelnen gedauert hat.
- **Letzter Fehler.** Patch-, Render- und Ereignisfehler, bis sie gelöscht
  werden. Die [LogBox](logbox.md) zeigt jeden vollständig, mit seiner Quelle.
- **Monitore** (über Starts hinweg gemerkt):
  - **Performance-Monitor**: FPS des UI-Threads, die letzte Frame-Zeit,
    verlorene Frames und eine FPS-Linie über die letzten 15 Sekunden gegen das
    Ziel des Displays. Seine letzte Zeile sind Kuitos Commits: Prop-Parses pro
    Commit und die letzte Latenz von Berührung bis Anwendung mit ihrem p95
    ([Performance](performance.md#native-counters)).
    Er lässt sich überallhin ziehen; er rastet in der nächstgelegenen Ecke ein.
  - **Aktualisierungen hervorheben**: wie bei react-scan blitzt jede View, die
    der Renderer aktualisiert, auf — grün, dann gelb, dann rot, wenn dieselbe
    View innerhalb einer Sekunde weiter aktualisiert wird, mit einem ×N-Zähler.
    Dauerhaftes Rot heißt, dass etwas öfter neu rendert, als es sollte. Unter
    jedem Aufblitzen der Signal-Schreibvorgang, der es verursacht hat
    (`visits = 2`): der Schreibvorgang, dessen Binding die Prop gesetzt hat
    oder dessen Zweig neu geplant wurde. Eine Aktualisierung, die kein
    Schreibvorgang verursacht hat (ein Live Patch, ein natives Ereignis, das
    die View gemeldet hat), hat kein Label.

  Beide Monitore zeichnen das Fenster selbst neu, kosten also eigene
  Frame-Zeit; [Performance](performance.md) misst mit ausgeschalteten Monitoren.

- **Dev-Server.** Die WebSocket-URL, bearbeitbar.

## Während die App lädt

Ein Startbildschirm sagt, worauf die Shell wartet — Hermes, den Dev-Server, den
ersten Frame der App — und blendet beim ersten Frame aus. Danach meldet eine
Pille unter der Statusleiste Live Patch (`Updated in 18 ms`), Fehlschläge
(antippen öffnet die Devtools) und einen verlorenen Dev-Server, bis er zurück
ist (`Reconnected`). Warnungen und Fehler, die die App protokolliert oder
wirft, sammeln sich in der [LogBox](logbox.md).

## Der Dev-Link

Die Shell verbindet sich von selbst neu: sie pingt den Dev-Server, um eine tote
Verbindung zu bemerken, und versucht es mit Backoff (0,5 s bis 5 s) erneut, bis
der Server zurück ist, sodass ein neu gestartetes `kuito dev` keine Aktion auf
dem Gerät erfordert. Ein Patch, den das Gerät bereits angewendet hat, wird nicht
erneut angewendet, wenn der Server ihn wiederholt.

Der Link transportiert JSON-Nachrichten, die über `type` unterschieden werden
und einmal in `src/protocol/dev-link.ts` deklariert sind; `npm run generate`
schreibt sie nach `KuitoDevLink.generated` in Swift und Kotlin, und das
`handle()` jeder Shell verzweigt über das generierte Enum, sodass eine neue
Nachricht nicht kompiliert, bis beide sie behandeln. Der Server sendet `patch`
(den Quellcode einer Revision), `command` und `symbolicated`; eine Shell sendet
`hello` (ihre ID, ihren Namen und ihre Plattform), `log`, `open` und ein Ack
für jeden Patch, den sie erhält: `applied` (die Revision und wie lange das
Auswerten gedauert hat) oder `rejected` (die Revision, ein Code wie
`EVALUATION` und die Meldung). Der Server validiert jede Nachricht gegen
dieselbe Tabelle und meldet eine fehlerhafte mit ihrem Grund.

## Debugging mit Chrome DevTools

Entwicklungs-Builds machen beide Hermes-Laufzeitumgebungen der App über das
Chrome DevTools Protocol debugbar, so wie React Native DevTools Hermes debuggt:

| Ziel      | Was dort läuft                                                 |
| --------- | -------------------------------------------------------------- |
| JS-Thread | Die App und der Kuito-Kernel (`src/runtime`)                  |
| UI-Thread | Motion-Werte, Gesten und UI-Thread-Callbacks (`src/ui-thread`) |

In `kuito dev` `j` drücken, um DevTools auf dem JS-Thread des zuletzt
verbundenen Geräts zu öffnen, oder `u` für dessen UI-Thread (`k` öffnet das
[Components-Panel](#components)). Es erscheint Chromes eigenes Frontend:

- **Sources**: das TypeScript der App, über die Source Maps des Compilers.
  Breakpoints, Schrittausführung, Scopes, Watch-Ausdrücke und
  `debugger;`-Anweisungen funktionieren alle. Live Patch funktioniert weiter,
  während DevTools angehängt ist; jeder Patch erscheint als neues Skript.
- **Console**: `console.*`-Ausgaben mit den protokollierten Objekten selbst,
  verlinkt mit der Zeile, die sie protokolliert hat, und Auswertung im
  angehaltenen Frame oder im globalen Scope. Einträge, die vor dem Öffnen von
  DevTools protokolliert wurden, bleiben erhalten (die letzten 1000).
- **Performance**: ein CPU-Profil aufzeichnen.
- **Memory**: einen Heap-Snapshot erstellen.

DevTools öffnet sich in einem eigenen Browser: dem ersten installierten
Chromium-basierten Browser (Chrome, Chrome Canary, Chromium, Edge, Brave),
gestartet mit einem dedizierten Profil in `.kuito/devtools-browser` und einem
Debugging-Port auf Loopback. `KUITO_DEVTOOLS_BROWSER` auf eine
Chromium-Executable setzen, um einen anderen zu wählen. Chromium weigert sich,
`devtools://`-URLs von außen zu öffnen, daher öffnet Kuito dasselbe gebündelte
Frontend, wie dieser Browser es auf seinem Debugging-Port ausliefert: nichts
wird heruntergeladen, und das Frontend passt immer zum Browser.

Jeder andere CDP-Client funktioniert ebenfalls. `kuito dev` listet die Ziele
unter `http://127.0.0.1:8765/json/list` auf, wie Chrome es tut, sodass
`chrome://inspect` sie findet, sobald `127.0.0.1:8765` unter _Discover network
targets_ hinzugefügt ist, und Editoren, die Node debuggen, hängen sich an ihre
`webSocketDebuggerUrl`.

### Components

In `kuito dev` `k` drücken für das Components-Panel. Es zeigt Kuitos eigenes
Modell der App, **Signal → Binding → View**, für das zuletzt verbundene Gerät,
im selben Browser wie DevTools.

- **Baum.** Jede gemountete Komponenteninstanz, benannt wie deklariert, mit
  ihrem Listen-`key`. Er folgt der App, während Komponenten mounten und
  unmounten. Beim Überfahren einer Komponente werden die Views umrandet, die
  sie auf dem Gerät gerendert hat.
- **Komponente.** Ihre Props, wie sie sie liest, ihre Hooks nach Name, die
  Komponenten, die sie rendern (Owner), und die nativen Views, die sie
  gerendert hat. Der Compiler gibt jedem `signal()` die Variable mit, als die
  es deklariert ist, sodass `const visits = signal(1)` als `visits` erscheint;
  ein Hook, den er nicht gesehen hat, zeigt seine Ordnungszahl (`state 1`).
  `task()` und `resource()` zeigen, ob sie laufen, ihre Daten und ihren Fehler;
  `motion()`-Werte zeigen ihren letzten Wert; Refs zeigen, was sie halten.
- **View.** Das Auswählen einer View, aus einer Komponente oder mit **Select on
  device** (dann die View antippen), zeigt jede ihrer Props mit dem Binding
  dahinter: die Signale, die sein letzter Lauf gelesen hat, jedes mit seinem
  Wert und der Komponente, der es gehört. Eine Prop ohne Binding ist eine
  Konstante. Eine Prop, die aktualisiert wurde, während das Panel offen war,
  zeigt den Signal-Schreibvorgang, der das verursacht hat.
- **Signal.** Das Auswählen eines Signals zeigt, was es antreibt: jede Prop,
  deren Binding es liest, und jeden Zweig, den es entscheidet (ein `Show`, ein
  Flow-`Switch`, ein reaktiver Kindausdruck oder die Struktur eines ganzen
  Moduls). Signale, die außerhalb einer Komponente erstellt wurden, und
  Computeds erscheinen nach Art und Nummer.
- **Bearbeiten.** Werte sind JSON; Enter setzt einen. Ein State-Wert oder
  Signal nimmt die Bearbeitung an, als hätte der Code `.value` geschrieben,
  sodass Bindings und Struktur folgen. Ein `motion()`-Wert bewegt sich zur
  Bearbeitung hin. Die Prop einer View übernimmt die Bearbeitung auf der
  nativen View, bis ihr Binding sie das nächste Mal schreibt. Computeds sind
  schreibgeschützt.

- **Verlauf.** Der Verlauf des Panels listet die letzten 500 Schreibvorgänge
  der Signale, die Komponenten gehören (`signal()` in einer Komponente), neueste zuerst, mit der Komponente, der
  jedes gehört. **Step back here** startet die App in einer frischen
  Laufzeitumgebung neu und spielt die Schreibvorgänge bis zu diesem der Reihe
  nach ab: jeder landet, sobald seine Komponente gemountet ist und die
  Neuplanungen des Schreibvorgangs davor gelaufen sind, sodass die App diesen
  Punkt so erreicht wie beim ersten Mal. Schreibvorgänge, die älter als die
  letzten 500 sind, werden nicht mehr aufbewahrt, und ein Zurückschritt beginnt
  dann nach ihnen. Nur JSON-Werte werden wiedergegeben; ein Schreibvorgang mit
  einer Funktion oder Klasseninstanz ist als nicht wiedergebbar gelistet. Was
  die App in der frischen Laufzeitumgebung von sich aus tut, passiert trotzdem
  (ein `resource()` lädt erneut, Timer laufen), und nativer Zustand wie ein
  Scroll-Offset beginnt von vorn. Schreibvorgänge von Tasks, Motion-Werten und
  Refs werden nicht gelistet: sie stammen aus dem, was diese Hooks ausführen.

Der Graph wird aus dem Store des Kernels gelesen, wenn das Panel danach fragt
(die Auswahl wird jede Sekunde aktualisiert, solange das Panel offen ist), er
kostet die App also nichts, solange niemand hinsieht. Das Panel spricht mit
einem kleinen Backend im Kernel (`src/runtime/devtools.ts`, sein Graph in
`devtools-graph.ts`); die Nachrichten sind einmal in
`src/runtime/devtools-protocol.ts` typisiert und reisen über den Geräte-Socket
des Inspectors als `panel`-Frames neben CDP, sodass das Panel und ein
DevTools-Fenster dieselbe Laufzeitumgebung Seite an Seite debuggen. Eine
Nachricht, die der Kernel nicht annehmen kann, wird mit ihrem Grund
zurückgewiesen, der im Kopf des Panels erscheint. Nach einem Reload begrüßt die
neue Laufzeitumgebung das Panel, das mit seinem Baum von vorn beginnt.

Noch nicht unterstützt: das Bearbeiten der Props einer Komponente (stattdessen
die Prop der View oder das Signal dahinter bearbeiten), die eigenen Quellen
eines Computed und das Anzeigen des Quellcodes einer Komponente.

### Aufzeichnung und Wiedergabe

Entwicklungs-Builds zeichnen jeden Batch auf, den die Laufzeitumgebung der App
committet, so wie der Kernel ihn geschrieben hat (der typisierte Host-Batch des
[nativen Scheduling](native-scheduling.md)), vom Start der Laufzeitumgebung an.
Ein Job, der wirft, verliert seine Batches auf dem Gerät wie in der
Aufzeichnung.

In `kuito dev` `s` drücken (oder `record` an eine nicht-interaktive Sitzung
senden), um die Aufzeichnung jedes verbundenen Geräts nach
`.kuito/recordings/<time>-<device>.krec` zu speichern, mit dem nativen
View-Baum, den es gebaut hat, daneben als `<file>.tree`: eine Zeile pro View,
in ID-Reihenfolge, mit ihrer Art, ihrem Parent, dem Frame, den die
Layout-Engine ihr gegeben hat, und dem Text einer Text-View. Eine Listenzeile
erscheint ohne ihren Frame: die Plattform layoutet eine Zeile, wenn ihre Liste
sie zeigt, was dem eigenen Scrollen der Liste folgt und nicht den Batches.

```bash
kuito replay .kuito/recordings/20261019-014618-p17-iphone-18-pro.krec ios
```

`kuito replay` baut und startet die Shell wie `kuito dev`, aber die Shell
startet keine App und keine Hermes-Laufzeitumgebung: der Dev-Server sendet ihr
die Aufzeichnung, und sie wendet die Batches über dieselbe Frame-Pipeline an,
im Tempo der Aufzeichnung. Wenn der letzte auf dem Bildschirm ist, beschreibt
die Shell ihren View-Baum, die CLI speichert ihn als `<file>.replayed` und
meldet, ob er mit dem aufgezeichneten `.tree` übereinstimmt, oder die erste
Zeile, in der er abweicht.

Was eine Wiedergabe nicht reproduziert:

- **UI-Thread-Code.** Motion-Werte, Gesten und Animationen laufen in der
  UI-Laufzeitumgebung, die eine Wiedergabe nicht startet; ihre Datensätze
  werden ausgelassen.
- **Nativer Zustand.** Scroll-Offsets, in Felder getippter Text und anderer
  Zustand, den die Plattform besitzt, sind nicht in den Batches; ebenso wenig
  die nativen Ereignisse, die die App beantwortet hat. Der Baum vergleicht das
  Layout, nicht, wohin eine Scroll-View gescrollt ist.
- **Größe.** Eine Aufzeichnung stoppt bei 32 MB und sagt das auch (die CLI
  vermerkt "stopped at its size limit"); sie wird trotzdem von Anfang an
  wiedergegeben.

Eine `.krec`-Datei ist Little-Endian: `KREC`, eine Version (2), ein
Truncated-Flag, dann für jeden Batch die Millisekunden seit dem Start der
Laufzeitumgebung, die Bytes des Batches und seine Strings
(`native/shared/Recording.h`). Props werden über ihre Nummer im Manifest
übertragen, eine Aufzeichnung wird also auf einer Shell wiedergegeben, die aus
demselben Kuito gebaut ist, auf der Plattform, die sie aufgezeichnet hat; ihr
Baum ist der dieser Plattform.

### Im angehaltenen Zustand

Anhalten stoppt einen Thread; der Rest der App läuft weiter, so weit er kann:

- **JS-Thread**: Die UI bleibt reaktionsfähig, und Animationen auf dem
  UI-Thread laufen weiter. Ereignisse, Timer und Live Patches werden
  eingereiht und laufen nach dem Fortsetzen.
- **UI-Thread**: Der Bildschirm friert bis zum Fortsetzen ein, da der
  UI-Thread der Plattform der gestoppte ist. Auf Android kann Eingabe während
  einer langen Pause den Systemdialog _App isn't responding_ hervorrufen;
  _Wait_ wählen.

Der Dev-Link bleibt in beiden Fällen bestehen: seine Pings werden abseits des
angehaltenen Threads beantwortet, die Shell verbindet sich also während des
Schrittdebuggens nicht neu.

### Funktionsweise

Jede Laufzeitumgebung erhält Hermes' eigenen CDP-Agenten (`hermes/cdp`), Kuito
spricht also selbst kein CDP. Die Shell öffnet einen zweiten Socket zum
Dev-Server, `/inspector/device`, auf einem eigenen Thread: Befehle erreichen
eine Laufzeitumgebung auch dann, wenn deren Thread an einem Breakpoint
angehalten ist. Der Dev-Server (`src/dev/inspector-proxy.ts`) leitet CDP
zwischen diesem Socket und jedem DevTools-Fenster weiter und fügt unterwegs
eines hinzu: die Source Map jedes Live Patch, inline, sodass jedes Frontend
Skripte auf TypeScript zurückführt, ohne etwas abzurufen.

Eine DevTools-Sitzung überlebt die Laufzeitumgebung, die sie debuggt. Reload
aus dem Dev-Menü, oder alles andere, was eine neue Laufzeitumgebung
hervorbringt, und die Sitzung wandert mit ihren Breakpoints dorthin: DevTools
löscht die Skripte der alten Laufzeitumgebung, wie bei einer Seitennavigation,
und listet die der neuen.

Hermes' Agent behält keinen Skriptquellcode, daher antwortet der Dev-Server
DevTools an seiner Stelle: jeder Live Patch, die Kernel und das
UI-Thread-Bundle, das der Compiler nach seinem Inhalt benennt
(`kuito://ui/<hash>`) und neben die Patches schreibt. Auf iOS läuft die
JS-Laufzeitumgebung auf einem eigenen Thread statt in einer Dispatch-Queue,
weil der CPU-Profiler den Thread sampelt, der die Laufzeitumgebung registriert
hat.

### Grenzen

- Breakpoints in einer bearbeiteten Datei werden verworfen, wenn ihr Live
  Patch landet: der Code der Datei hat sich unter ihnen geändert. Breakpoints
  in anderen Dateien bleiben erhalten.
- UI-Thread-Code erscheint als das vom Compiler generierte JavaScript: sein
  Bundle hat noch keine Source Map.
- Die Headless-Laufzeitumgebung, die Hintergrund-Tasks ausführt, ist nicht
  debugbar.
- Nur ein DevTools-Fenster debuggt eine Laufzeitumgebung zur selben Zeit: ein
  weiteres zu öffnen schließt das erste.
- Release-Builds enthalten nichts davon: der Inspector wird nur in
  Debug-Builds kompiliert (`KUITO_INSPECTOR`), und Androids Release-Hermes
  hat keinen Debugger.
