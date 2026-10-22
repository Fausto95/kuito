# Performance

Wie man die Bildrate von Kuito auf Android und den Kaltstart auf beiden Plattformen misst, und was die Zahlen bedeuten.

## Der Android-Frame-Benchmark

`scripts/benchmark-android.ts` spielt die Reel-Demo (`demo/app.tsx`) auf einem Emulator oder Gerät mit `input`-Gesten auf dem Gerät ab. Jeder Lauf startet die App kalt, und jedes Szenario beginnt, sobald die App im Leerlauf ist.

- `launch`: Kaltstart, dann Katalog, Poster und Layout, bis die App in den Leerlauf geht
- `sheet`: öffnet und schließt das Details-Sheet zweimal
- `tabs`: Search, Library, Lab, Discover, zweimal
- `discover`: wischt zwei Rails, scrollt Discover nach unten und wieder hoch
- `library`: scrollt Library sechs Bildschirme nach unten und zurück

Den Dev-Server für das Gerät starten, der auch die App installiert, und ihn laufen lassen. Dann die installierte App messen:

```sh
kuito dev android -d emulator-5554 --port 8766
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 3 --label mine
```

Um zwei Builds zu vergleichen, beide APKs übergeben. Sie wechseln sich innerhalb jedes Laufs ab, sodass Last auf dem Host auf beide gleichermaßen fällt:

```sh
node scripts/benchmark-android.ts --runs 4 --build before=before.apk --build after=after.apk
```

`--scenario discover` führt ein Szenario aus, und `--report` gibt die Zusammenfassung eines früheren Laufs erneut aus. Ergebnisse landen in `dist/benchmarks/android/<label>/`: `results.json` und eine atrace-Textdatei pro Szenario und Lauf (etwa 60 MB je Datei). Einen Trace in [Perfetto](https://ui.perfetto.dev) öffnen, um ihn anzusehen.

## Was er meldet

Pro Szenario der Median über die Läufe von:

- Aus `dumpsys gfxinfo`: gerenderte Frames, Jank % (Frames, die ihre Deadline verpasst haben), p50/p90/p99-Frame-Zeit. Das ist, was ein Benutzer sieht, aber auf einem Emulator wird es von der Host-GPU dominiert.
- Aus dem UI-Thread des Traces: `uiSlowPercent` (Frames, deren eigene Main-Thread-Zeit 16,7 ms überschreitet), `uiP90`, `uiMaxMs` und `uiTotalMs`. Das ist die Arbeit, die Kuitos Renderer kontrolliert, und sie rauscht deutlich weniger.
- `startMs` (nur launch): Zeit bis zum ersten Draw der Activity.
- `contentMs` (nur launch): vom ersten getracten Ereignis des Prozesses bis zum Ende seines größten `Kuito commit`: die Zeit, die ein Benutzer auf Inhalt wartet.
- `anrs`: "Application Not Responding"-Meldungen.

## Kaltstart

Beide Shells starten aus Hermes-Bytecode: Kernel und App kommen kompiliert an, Hermes parst und kompiliert sie also nicht. `contentMs` enthält Reels Anfrage an die TVMaze-API, die zwischen Läufen um Hunderte von Millisekunden schwankt. Mediane über mehrere Läufe vergleichen.

Auf iOS misst `scripts/benchmark-ios.ts` dieselbe `launch`-Zeitleiste auf einem Simulator. Die Shell bauen und installieren (`kuito dev ios`), dann:

```sh
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label mine
```

Ohne `--port` startet die App offline, allein aus ihrem gebündelten Bytecode. Der erste Lauf nach einer Installation zahlt für kalte Datei-Caches. Ergebnisse landen in `dist/benchmarks/ios-launch-<label>.json`.

## Kernel-Zähler

`__kuito.stats()` gibt einen Schnappschuss der Arbeit zurück, die der Kernel geleistet hat, sodass ein Test oder eine Debugger-Sitzung zwei Schnappschüsse rund um eine Interaktion vergleicht: `replans`, `thunkEvaluations`, `subscriptionsCreated`, `subscriptionsDestroyed`, `sendPropCalls` und `bytesStringified`. `total` hält sie seit dem Laden des Kernels; `lastReplan` hält, was das letzte committete `patch()` getan hat.

## Was Messungen verzerrt

- Devtools-Overlays: Der Performance-Monitor und die Aktualisierungshervorhebung zeichnen das Fenster selbst neu. Der Benchmark schaltet beide für den Lauf aus und stellt die Einstellungen danach wieder her; `--overlays` lässt sie an, um sie zu messen.
- CPU-Anzahl des Emulators: Das Standard-AVD Pixel 3a auf Apple Silicon hat `hw.cpu.ncore = 1`. In der `config.ini` des AVD erhöhen, für Zahlen näher an einem Telefon; über Vorher und Nachher hinweg fest lassen.
- Die Host-GPU: Jeder Emulator-Frame geht durch die GPU des Hosts, geteilt mit jedem anderen laufenden Emulator und Simulator. UI-Thread-Zahlen vergleichen, Builds abwechseln und andere Emulatoren schließen.
- Debug-Builds: Der Benchmark misst Debug-APKs, wie `kuito dev` sie baut. Builds desselben Typs vergleichen.

## Vertiefung

[Performance](../../../../docs/performance.md) behandelt die Trace-Abschnitte, die die Shell markiert, jeden Kernel-Zähler, die nativen Zähler hinter dem Performance-Monitor und wie man ein APK zum Vergleichen baut.
