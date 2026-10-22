# LogBox

Entwicklungs-Builds zeigen, was die App loggt und wirft, auf dem Gerät und im Terminal, zurückgeführt auf das TSX.

## console

`console.log`, `info`, `debug`, `warn` und `error` funktionieren auf Geräte-Hermes. Werte werden auf einer Zeile so ausgegeben, wie Node sie ausgibt (`{ a: 1, b: [1, 'two'] }`, `[Circular]`, `[Function name]`), und jeder Eintrag erscheint außerdem in der Konsole von Xcode und in logcat (Tag `Kuito`) sowie im `kuito dev`-Terminal, mit der Zeile, die ihn geloggt hat:

```text
12:39:27  › hello { taps: 0 }                     src/App.tsx:14
12:39:28  ▲ Image cache is 90% full               src/Feed.tsx:31
12:39:47  ✖ TypeError: Cannot read property 'name' of undefined  src/Profile.tsx:5
```

## Was die LogBox erfasst

| Quelle                                                        | Angezeigt als             |
| ------------------------------------------------------------- | ------------------------- |
| `console.warn`                                                | Warnung                   |
| `console.error`                                               | Fehler                    |
| Ein Throw in einem Event-Handler, Timer oder `fetch`-Callback | Fehler                    |
| Eine unbehandelte Promise-Ablehnung                           | Fehler                    |
| Ein Live Patch oder die App beim Start, der bzw. die wirft    | Ausführung fehlgeschlagen |

Warnungen und Fehler sammeln sich in einer Leiste über dem Home-Indikator: der neueste Eintrag, wie viele Fehler und Warnungen warten, und ein ✕, um sie zu löschen. Antippen, um sie zu untersuchen. Code, dessen Ausführung fehlgeschlagen ist, öffnet den Inspektor von selbst, die vorherige Version der App bleibt dahinter aktiv, und der Inspektor schließt sich von selbst, wenn ein Live Patch den Code behebt.

## Der Inspektor

- Die Nachricht, und bei einer Wiederholung desselben Eintrags, wie oft er aufgetreten ist (x3), statt drei Kopien.
- Der Code-Frame: die fehlschlagende Zeile des Quellcodes, hervorgehoben, mit dem Ort als Link, der den Editor dort öffnet.
- Der Call-Stack, über die Live-Patch-Source-Maps zurückgeführt. Die eigenen Frames kommen zuerst; die Frames von Kuito und Bibliotheken sind hinter "Show N Kuito and library frames" eingeklappt. Einen beliebigen Frame antippen, um ihn im Editor zu öffnen.
- Dismiss / Copy / Reload. Copy legt Nachricht, Ort, Code-Frame und Stack als Text in die Zwischenablage, bereit für ein Issue oder einen Chat. Reload startet die App in einer frischen Laufzeit neu und leert die LogBox.
- Pfeile blättern durch die Einträge.

## Frames im Editor öffnen

Der Dev-Server startet den Editor, sodass es von einem Simulator, einem Emulator oder einem Gerät aus funktioniert. `KUITO_EDITOR` setzen, um ihn zu wählen (`code`, `cursor`, `zed`, `subl`, `webstorm`, `idea`, `studio`, bei Bedarf mit Flags: `KUITO_EDITOR="code --reuse-window"`); andernfalls ein grafisches `VISUAL` oder `EDITOR`, dann VS Code. Nur Dateien innerhalb des Projekts werden geöffnet.

## Vertiefung

[LogBox](../../../../docs/logbox.md) behandelt, wie Kernel, Shell und Dev-Server jeden Eintrag erzeugen und seinen Stack zurückführen.
