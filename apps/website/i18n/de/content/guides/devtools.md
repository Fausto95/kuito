# Devtools

Entwicklungs-Builds der Kuito-Shells enthalten Devtools. Sie bleiben der App aus dem Weg: Es gibt keinen schwebenden Button.

## Öffnen

| Wo                   | Wie                                        |
| -------------------- | ------------------------------------------ |
| iOS-Simulator        | Cmd+D                                      |
| Android-Emulator     | Cmd+M / Ctrl+M oder die Menütaste          |
| Ein physisches Gerät | Schütteln                                  |
| Die `kuito dev`-CLI  | `m` drücken (funktioniert für jedes Gerät) |

Sie öffnen sich als natives Sheet mit dem Verbindungsstatus, Reload und Reconnect, den letzten Live-Patch-Aktualisierungen, dem letzten Fehler, der Dev-Server-URL und zwei Monitoren. Der Performance-Monitor zeigt FPS des UI-Threads, die letzte Frame-Zeit, verlorene Frames und Kuitos Commits. Aktualisierungen hervorheben lässt jede View aufblitzen, die der Renderer aktualisiert, von Grün bis Rot, wenn dieselbe View innerhalb einer Sekunde weiter aktualisiert wird, mit dem Signal-Schreibvorgang, der es verursacht hat, unter jedem Aufblitzen.

## Debuggen mit Chrome DevTools

Beide Hermes-Laufzeitumgebungen der App sind über das Chrome DevTools Protocol debugbar: Der JS-Thread führt die App und den Kuito-Kernel aus; der UI-Thread führt Motion-Werte, Gesten und UI-Thread-Callbacks aus. In `kuito dev` `j` drücken, um DevTools auf dem JS-Thread des zuletzt verbundenen Geräts zu öffnen, oder `u` für dessen UI-Thread. Man erhält Chromes eigenes Frontend: Sources (das TypeScript, über Source Maps; Live Patch funktioniert weiter, solange verbunden), Console, Performance (ein CPU-Profil) und Memory (ein Heap-Snapshot).

Jeder andere CDP-Client funktioniert ebenfalls: `kuito dev` listet die Targets unter `http://127.0.0.1:8765/json/list`, sodass `chrome://inspect` sie findet, sobald `127.0.0.1:8765` unter Discover network targets hinzugefügt ist.

## Components-Panel

In `kuito dev` `k` drücken für das Components-Panel: Kuitos eigenes Modell der App, Signal zu Binding zu View.

- Baum: jede gemountete Komponenteninstanz, benannt wie deklariert. Beim Überfahren einer werden die Views umrandet, die sie gerendert hat.
- Komponente: ihre Props, ihre Hooks nach Name (`const visits = signal(1)` erscheint als `visits`), ihre Owner und die nativen Views, die sie gerendert hat.
- View: jede Prop mit dem Binding dahinter, die Signale, die sein letzter Lauf gelesen hat. Select on device, dann die View antippen.
- Signal: jede Prop, deren Binding es liest, und jeder Zweig, den es entscheidet.
- Bearbeiten: Werte sind JSON; Enter setzt einen. Ein Signal nimmt die Bearbeitung an, als hätte der Code `.value` geschrieben.
- Verlauf: die letzten 500 Schreibvorgänge der Signale, die Komponenten gehören. Step back here startet die App neu und spielt die Schreibvorgänge bis zu diesem ab.

Der Graph wird gelesen, wenn das Panel ihn anfordert, also kostet er die App nichts, solange niemand hinsieht.

## Aufzeichnung und Wiedergabe

Entwicklungs-Builds zeichnen jeden Batch auf, den die Laufzeit der App committet. In `kuito dev` `s` drücken, um die Aufzeichnung jedes verbundenen Geräts nach `.kuito/recordings/<time>-<device>.krec` zu speichern, mit dem nativen View-Baum, den sie gebaut hat, daneben als `<file>.tree`.

```sh
kuito replay .kuito/recordings/20261019-014618-p17-iphone-18-pro.krec ios
```

`kuito replay` startet die Shell ohne App und ohne Hermes-Laufzeitumgebung: Der Dev-Server sendet ihr die Aufzeichnung, und sie wendet die Batches im aufgezeichneten Tempo an. Die CLI speichert dann den View-Baum als `<file>.replayed` und meldet, ob er mit dem aufgezeichneten `.tree` übereinstimmt. Eine Wiedergabe reproduziert keinen UI-Thread-Code und keinen nativen Zustand wie Scroll-Offsets und läuft nur auf einer Shell, die aus demselben Kuito gebaut ist, auf der Plattform, die aufgezeichnet hat.

## Grenzen

- Breakpoints in einer bearbeiteten Datei fallen weg, wenn ihr Live Patch landet.
- UI-Thread-Code hat noch keine Source Map.
- Die Headless-Laufzeit, die Hintergrundaufgaben ausführt, ist nicht debugbar.
- Nur ein DevTools-Fenster debuggt eine Laufzeit gleichzeitig.
- Release-Builds enthalten nichts davon.

## Vertiefung

[Devtools](../../../../docs/devtools.md) behandelt den Startbildschirm und die Status-Pille, die Nachrichten des Dev-Links, den Browser, in dem DevTools sich öffnet, was jeder Thread tut, während er angehalten ist, das `.krec`-Format und seine Größengrenze, wie der Inspector-Proxy CDP weiterleitet, und was das Components-Panel noch nicht unterstützt.
