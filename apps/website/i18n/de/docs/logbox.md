# LogBox

Entwicklungs-Builds zeigen, was Ihre App loggt und wirft, auf dem Gerät und im
Terminal, zurückgeführt auf Ihr TSX.

## console

`console.log`, `info`, `debug`, `warn` und `error` funktionieren auf
Geräte-Hermes. Werte werden auf einer Zeile so ausgegeben, wie Node sie ausgibt
(`{ a: 1, b: [1, 'two'] }`, `[Circular]`, `[Function name]`), und jeder Eintrag
erscheint außerdem:

- im `kuito dev`-Terminal, mit der Zeile, die ihn geloggt hat:

  ```
  12:39:27  › hello { taps: 0 }                     src/App.tsx:14
  12:39:28  ▲ Image cache is 90% full               src/Feed.tsx:31
  12:39:47  ✖ TypeError: Cannot read property 'name' of undefined  src/Profile.tsx:5
  ```

- in der Konsole von Xcode und in logcat (Tag `Kuito`).

## Was die LogBox erfasst

| Quelle                                                        | Angezeigt als             |
| ------------------------------------------------------------- | ------------------------- |
| `console.warn`                                                | Warnung                   |
| `console.error`                                               | Fehler                    |
| Ein Throw in einem Event-Handler, Timer oder `fetch`-Callback | Fehler                    |
| Eine unbehandelte Promise-Ablehnung                           | Fehler                    |
| Ein Live Patch oder Ihre App beim Start, der bzw. die wirft   | Ausführung fehlgeschlagen |

Warnungen und Fehler sammeln sich in einer Leiste über dem Home-Indikator: der
neueste Eintrag, wie viele Fehler und Warnungen warten, und ein ✕, um sie zu
löschen. Tippen Sie darauf, um sie zu untersuchen. Code, dessen **Ausführung
fehlgeschlagen** ist, öffnet den Inspektor von selbst — die vorherige Version
der App bleibt dahinter aktiv — und der Inspektor schließt sich von selbst,
wenn ein Live Patch den Code behebt.

## Der Inspektor

- **Die Nachricht**, und bei einer Wiederholung desselben Eintrags, wie oft er
  aufgetreten ist (×3), statt drei Kopien.
- **Der Code-Frame**: die fehlschlagende Zeile Ihres Quellcodes, hervorgehoben,
  mit dem Ort als Link, der Ihren Editor dort öffnet.
- **Der Call-Stack**, über die Live-Patch-Source-Maps zurückgeführt. Ihre
  Frames kommen zuerst; die Frames von Kuito und Bibliotheken sind hinter
  "Show N Kuito and library frames" eingeklappt. Tippen Sie auf einen
  beliebigen Frame, um ihn in Ihrem Editor zu öffnen.
- **Dismiss / Copy / Reload.** Copy legt Nachricht, Ort, Code-Frame und Stack
  als Text in die Zwischenablage, bereit für ein Issue oder einen Chat. Reload
  startet die App in einer frischen Laufzeit neu und leert die LogBox.
- **‹ ›** blättert durch die Einträge.

## Frames in Ihrem Editor öffnen

Der Dev-Server startet den Editor, sodass es von einem Simulator, einem
Emulator oder einem Gerät aus funktioniert. Setzen Sie `KUITO_EDITOR`, um ihn
zu wählen (`code`, `cursor`, `zed`, `subl`, `webstorm`, `idea`, `studio`, …,
bei Bedarf mit Flags: `KUITO_EDITOR="code --reuse-window"`); andernfalls ein
grafisches `VISUAL` oder `EDITOR`, dann VS Code. Nur Dateien innerhalb des
Projekts werden geöffnet.

## Wie es funktioniert

Der Kernel installiert `console`, wenn der native Host `__kuitoHostLog`
bereitstellt; jeder Eintrag trägt einen Stack (den eigenen eines
`Error`-Arguments oder den der Aufrufstelle). Fehler, die von Callbacks
geworfen werden, die der native Host startet (Events, Timer, fetch), gehen
durch dasselbe Log, ebenso wie die unbehandelten Ablehnungen von Hermes. Die
Shell zeigt Warnungen und Fehler an und sendet jeden Eintrag an den Dev-Server,
der den Stack über die Source Map des Bundles zurückführt, das ihn ausgeführt
hat (`kuito://patch/N`), und mit Frames und einem Code-Frame antwortet.
