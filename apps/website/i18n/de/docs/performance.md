# Performance

Wie man die Bildrate von Kuito auf Android und den Kaltstart auf beiden Plattformen misst,
und was die Zahlen bedeuten.

## Der Android-Frame-Benchmark

`scripts/benchmark-android.ts` spielt die Reel-Demo (`demo/app.tsx`) auf einem
Emulator oder Gerät mit `input`-Gesten auf dem Gerät ab:

| Szenario   | Was es tut                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `launch`   | Kaltstart, dann Katalog, Poster und Layout, bis die App in den Leerlauf geht                    |
| `sheet`    | Öffnet und schließt das Details-Sheet zweimal                                                   |
| `tabs`     | Search → Library → Lab → Discover, zweimal                                                      |
| `discover` | Wischt zwei Rails, scrollt Discover mit einem Rail-Wisch pro Bildschirm nach unten, wieder hoch |
| `library`  | Scrollt Library sechs Bildschirme nach unten und zurück                                         |

Jeder Lauf startet die App kalt. Jedes Szenario beginnt, sobald die App im Leerlauf ist, das
heißt, sie nutzt zwei Sekunden lang weniger als ein Zehntel eines Kerns. Eine feste Wartezeit reicht
nicht: Auf einem langsamen Emulator kann der erste Inhalt eine Minute nach dem Start erscheinen.

### Ausführen

Den Dev-Server für das Gerät starten, der auch die App installiert, und ihn laufen lassen:

```bash
kuito dev android -d emulator-5554 --port 8766
```

Dann die installierte App messen:

```bash
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 3 --label mine
```

Um zwei Builds zu vergleichen, beide APKs übergeben. Sie wechseln sich innerhalb jedes Laufs ab, sodass Last
auf dem Host (andere Emulatoren, Builds) auf beide gleichermaßen fällt:

```bash
node scripts/benchmark-android.ts --runs 4 --build before=before.apk --build after=after.apk
```

Ein APK mit JDK 21 und Gradle 8 bauen, dann
`native/android/app/build/outputs/apk/debug/app-debug.apk` beiseitekopieren, bevor das nächste gebaut wird:

```bash
cd native/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) PATH=/opt/homebrew/opt/gradle@8/bin:$PATH gradle :app:assembleDebug
```

`--scenario discover` führt ein einzelnes Szenario aus, und `--report` gibt die Zusammenfassung
eines früheren Laufs aus seinen gespeicherten Traces erneut aus. Die Koordinaten gelten für einen 1080×2220-Bildschirm bei
480 dpi (Pixel 3a).

Die Ergebnisse landen in `dist/benchmarks/android/<label>/`: `results.json` und eine atrace-
Textdatei pro Szenario und Lauf (etwa 60 MB pro Stück; nach Gebrauch löschen).
Einen Trace in [Perfetto](https://ui.perfetto.dev) öffnen, um ihn anzusehen.

### Was es meldet

Pro Szenario den Median über die Läufe von:

- **Aus `dumpsys gfxinfo`**: gerenderte Frames, Jank-% (Frames, die ihre
  Frist verpasst haben), p50/p90/p99-Frame-Zeit. Das ist, was ein Benutzer sieht, aber auf einem
  Emulator wird es von der Host-GPU dominiert (siehe unten).
- **Aus dem UI-Thread des Traces**: `uiSlowPercent` (Frames, deren eigene Hauptthread-
  Zeit 16,7 ms übersteigt), `uiP90`, `uiMaxMs` (der längste Frame) und `uiTotalMs`.
  Die "eigene Zeit" lässt `postAndWait`, das Warten auf den RenderThread, außen vor. Das ist die
  Arbeit, die Kuitos Renderer kontrolliert, und sie ist deutlich weniger verrauscht.
- `startMs` (nur launch): die Zeit von `am start -W` bis zum ersten Zeichnen der Activity,
  also des Startbildschirms.
- `contentMs` (nur launch): vom ersten getracten Ereignis des Prozesses bis zum Ende
  seines größten `Kuito commit`. Bei Reel ist das der Katalog: die Zeit, die ein Benutzer
  auf Inhalt wartet.
- `evaluateMs` (nur launch): die Wanduhrzeit jedes `Kuito evaluate`. Auf einem
  Kern ist es überwiegend Warten auf den Kern, nicht laufendes Hermes.
- `anrs`: "Application Not Responding"-Meldungen während des Szenarios.

`results.json` bewahrt außerdem die 40 größten Hauptthread-Abschnitte jedes Laufs auf.

### Trace-Abschnitte

Shell und Renderer markieren ihre Arbeit, damit ein Trace sie zuordnet:

| Abschnitt              | Thread | Was                                                              |
| ---------------------- | ------ | ---------------------------------------------------------------- |
| `Kuito commit <rows>` | main   | Anwenden eines Mutations-Batches von Hermes                      |
| `Kuito layout`        | main   | Ein Durchlauf der Flexbox-Engine über die Wurzel                 |
| `Kuito measureLeaf`   | main   | Die Engine bittet Android, einen Text oder ein Control zu messen |
| `Kuito image ready`   | main   | Ausliefern eines dekodierten Bilds an seine Views                |
| `Kuito image decode`  | worker | Dekodieren von Bildbytes                                         |
| `Kuito evaluate`      | Hermes | Ausführen eines Skripts: der Kernel, die App, ein Patch          |
| `Kuito dispatch`      | Hermes | Zustellen eines Ereignisses an JS                                |
| `Kuito timer`         | Hermes | Ein JS-Timer feuert                                              |

Eine nachgestellte Zahl ist Detail: Der Benchmark addiert jedes `Kuito commit` zusammen.

## Kaltstart

Beide Shells starten aus Hermes-Bytecode (`docs/on-device-hermes.md`):
Kernel und App kommen kompiliert an, sodass Hermes sie weder parst noch kompiliert.
Auf dem Pixel-3a-Emulator senkte das Hermes' eigene Zeit in `Kuito evaluate`
von etwa 46 ms auf 9 ms pro Start. `evaluateMs` bleibt deutlich darüber: Auf einem
Kern verbringt der Hermes-Thread den Großteil eines evaluate wartend, während der Hauptthread
den ersten Frame zeichnet. Alles andere, was während des Starts läuft, etwa ein
animierter Startbildschirm, verlängert dieses Warten. Dieser Bytecode ist für das
Debugging kompiliert, unoptimiert und mit vollständigen Debug-Informationen, damit Chrome DevTools
jeden Scope anzeigen können ([devtools](devtools.md#debugging-with-chrome-devtools)).

`contentMs` enthält auch Reels Anfrage an die TVMaze-API, die zwischen Läufen um
Hunderte von Millisekunden schwankt. Mediane über mehrere Läufe vergleichen.

### iOS

`scripts/benchmark-ios.ts` misst dieselbe `launch`-Zeitleiste auf einem iOS-
Simulator. Die Shell markiert `Kuito evaluate` und `Kuito commit <mutations>` als
Signposts in Points of Interest (`native/ios/App/KuitoTrace.swift`); das Skript
liest sie aus dem `log stream` des Simulators und misst `contentMs` ab dem
ersten Log-Ereignis des Prozesses. Die Shell bauen und installieren (`kuito dev ios`), dann:

```bash
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label mine
```

Ohne `--port` startet die App offline, allein aus ihrem gebündelten Bytecode. Der
erste Lauf nach einer Installation zahlt für kalte Datei-Caches; Mediane vergleichen.
Die Ergebnisse landen in `dist/benchmarks/ios-launch-<label>.json`. Aufgezeichnete Zahlen liegen
in `benchmarks/`.

## Kernel-Zähler

`__kuito.stats()` gibt einen Schnappschuss der Arbeit zurück, die der Kernel geleistet hat, sodass ein
Test oder eine Debugger-Sitzung zwei Schnappschüsse um eine Interaktion herum vergleicht:

| Zähler                   | Zählt                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `replans`                | Committete `patch()`-Läufe, den ersten Plan jedes Moduls eingeschlossen                                                            |
| `thunkEvaluations`       | Ausgeführte getrackte Ausdrücke: `when`s, Kind-Ausdrücke, berechnete Props                                                         |
| `subscriptionsCreated`   | Angelegte Signal-Subscriptions                                                                                                     |
| `subscriptionsDestroyed` | Freigegebene Signal-Subscriptions                                                                                                  |
| `sendPropCalls`          | An den Host gesendete Props, animierte und UI-Thread-gebundene eingeschlossen                                                      |
| `bytesStringified`       | Länge des JSON, das zum Überqueren der Host-Grenze erzeugt wurde (Props, UI-Thread-Operationen, Argumente nativer Module, Befehle) |

`total` hält die fünf Arbeitszähler seit dem Laden des Kernels; `lastReplan`
hält, was der letzte committete `patch()` getan hat, von der Registrierung bis zu seinen
Mounts. Ein `patch()`, der wirft, committet nichts und lässt `lastReplan`, wie es
war. Tests lesen sie über `installKernel` (`test/support/kuito-host.ts`).

`held` zählt, was der Kernel gerade hält, Store für Store: Hook-`states`,
`motions`, die JS-Thread-Funktionen (`remotes`) und `signals`, die der UI-Thread
aufrufen oder schreiben darf, Gesten-Tags, entfernte Views, die für ihre späten Ereignisse behalten werden,
`views` und `handlers`. Jeder bleibt flach, solange eine App es tut: Der Zustand eines Hooks
lebt so lange wie seine Instanz (`docs/reactivity.md`), ein Remote oder Signal so
lange, wie der committete Plan irgendeines Moduls es kodiert, und das Entsorgen eines Moduls gibt
alles davon frei. Der UI-Kernel beantwortet dieselbe Frage für seine eigenen Stores mit
`__kuitoUI.stats()`: UI-Thread-`functions`, `motions`, `handlers` und
`bindings`. `test/demo.test.ts` und `test/motion-app.test.ts` halten beide flach
über 200 Live Patches.

## Native Zähler

Die letzte Zeile des Performance-Monitors (`JS · 12 parses/commit · touch 48 ms (p95
61)`) zählt zwei Kosten, die die Renderer für jeden Kuito-Commit zahlen, auf iOS
und Android gleichermaßen (`KuitoCommitStats`, `KuitoParses`):

- **Parses pro Commit.** Der Host-Batch typisiert den Wert jeder eingebauten Prop
  (docs/native-scheduling.md), sodass eingebaute Setter keinen Text parsen. Die eigenen Props einer
  nativen Modul-View kommen als Skalare an; die Farbhelfer, die sie verwenden
  (`UIColor(kuitoHex:)`, `cssColor`), zählen jeden Parse. JSON-Props parsen
  ihr JSON laut Vertrag und werden nicht gezählt. Angezeigt als Mittelwert über das halbsekündige
  Fenster des Monitors, für darin angewandte Batches; UI-Thread-getriebene Props sind keine Commits
  und werden nicht gezählt.
- **Touch-bis-angewandt-Latenz.** Von einem Touch-Down oder -Up (der eigene
  Zeitstempel des Ereignisses, vom Fenster gelesen, bevor irgendeine View es sieht) bis zum Ende des Anwendens
  des ersten Batches, den der JS-Thread danach gesendet hat. Ein späterer Touch ersetzt einen noch
  wartenden; ein Touch, den kein Batch innerhalb von 5 s beantwortet, wird verworfen, da er
  nichts zum Anwenden gesendet hat. Das p95 gilt über die letzten 64 beantworteten Touches. Ein Batch, den der
  JS-Thread nach dem Touch aus einem anderen Grund gesendet hat (ein Timer), beantwortet ihn ebenfalls.

## Was Messungen verzerrt

- **Devtools-Overlays.** Der Performance-Monitor und der Update-Highlighter zeichnen
  das Fenster von sich aus neu, und ein Emulator ohne partielle Updates zeichnet es jedes Mal
  ganz neu. Der Benchmark schaltet beide für den Lauf über `run-as` aus und
  stellt die Einstellungen danach wieder her, auch bei Unterbrechung; `--overlays` lässt sie
  an, um sie zu messen. Auf dem Pixel-3a-Image fügten sie etwa ein Drittel zur
  UI-Thread-Zeit von Discover hinzu.
- **CPU-Anzahl des Emulators.** Das Standard-Pixel-3a-AVD auf Apple Silicon hat
  `hw.cpu.ncore = 1`: UI-Thread, RenderThread, Hermes und Bilddekodierung
  teilen sich einen Kern, und ein UI-Thread, der Arbeit hat, kann den Großteil eines Frames
  mit Warten auf diesen Kern verbringen. In der `config.ini` des AVD erhöhen für Zahlen, die näher
  an einem Telefon liegen; über Vorher und Nachher hinweg konstant halten.
- **Die Host-GPU.** Jeder Emulator-Frame geht durch die GPU des Hosts, geteilt
  mit jedem anderen laufenden Emulator und Simulator. `eglSwapBuffers` und
  `dequeueBuffer` dominieren dann den RenderThread, und der Jank von gfxinfo schwankt stark
  zwischen Läufen desselben Builds. UI-Thread-Zahlen vergleichen, Builds abwechseln
  und andere Emulatoren schließen.
- **Debug-Builds.** Der Benchmark misst Debug-APKs, wie `kuito dev` sie
  baut. Builds desselben Typs vergleichen.
