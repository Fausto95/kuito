# Vertikaler Durchstich mit Hermes auf dem Gerät (experimentell)

Dies ist ein **Implementierungsprototyp**, keine validierte Mobile-Veröffentlichung.

## Ziel

Kuitos Bootstrap, UI-Reaktivität, Event-Handler und App-Quellcode **innerhalb jedes nativen Mobilprozesses** ausführen, statt JS auf dem Desktop auszuführen und UI-Ereignisse über WebSocket zu spiegeln.

- Das gemeinsame `native/shared/KuitoRuntime.{h,cpp}` bettet eine persistente `facebook::hermes::HermesRuntime` ein und stellt typisierte View-Mutationen in einer C++-Warteschlange bereit. Nach jedem VM-Eintritt leert es einen Batch und dedupliziert wiederholte Property-Schreibvorgänge, ohne die Erzeugung/Entfernung von Views umzuordnen.
- Android `KuitoJNI.cpp` und `KuitoNativeRuntime.kt` besitzen Hermes auf einem `HandlerThread`, liefern einen JNI-Array-Batch pro VM-Task und wenden Mutationen auf dem Haupt-Looper auf `KuitoAndroidRenderer` an. Der native Gradle-Build nutzt das Hermes-V1-Prefab aus `com.facebook.hermes:hermes-android` und baut `libjsi.so` aus Hermes' `API/jsi` am Tag desselben Release (`native/android/app/src/main/cpp/jsi`, dessen `jsi/jsi/VERSION` den Commit benennt), die ABI, gegen die `libhermesvm.so` linkt. Es wird keine React-Native-Bibliothek paketiert.
  - Eine Kotlin-Exception während eines Host-Aufrufs (eine Anfrage, ein Timer, ein natives Modul, ein Log) wird vor jedem weiteren JNI-Aufruf gelöscht und zu einem JavaScript-Fehler, der den Aufruf und die Java-Exception benennt (`JavaException.h`), sodass er das `catch` der App oder die LogBox erreicht, statt den Prozess abzubrechen.
  - Hermes' Android-`Intl` (`toLocaleString`, `Intl.DateTimeFormat`, ...) ist Java hinter fbjni, das seine Bibliotheken über SoLoaders `NativeLoader` lädt. `KuitoNativeRuntime` initialisiert es, bevor Hermes startet: eine Exception innerhalb von Hermes' eigenem `Intl`-Code erreicht Kuitos catch nie und bricht den Prozess ab.
- iOS `KuitoHermesBridge.mm` und `KuitoHermesBridge.h` besitzen Hermes auf einer seriellen Dispatch-Queue, puffern View-Mutationen und senden jeden geordneten Batch an `KuitoUIKitRenderer` auf der Haupt-Dispatch-Queue. Ein lokales Swift-Paket linkt dasselbe Hermes-V1-Release, vorgebaut (`src/cli/hermes-ios.ts`).
- `src/dev/device-server.ts` liefert **ausschließlich JavaScript-Quellpatches** über einen WebSocket, der nur auf localhost lauscht. Die gesamte Anwendungslogik und der Button-Dispatch laufen innerhalb der Geräte-VM.

## Verwendung

Node-Abhängigkeiten und native SDKs installieren. Auf macOS Xcode und XcodeGen bereithalten. Auf Android JDK 21, Android SDK/NDK, CMake, Gradle 8, Emulator. `kuito doctor` prüft sie.

```sh
kuito doctor
kuito dev android
# macOS only:
kuito dev ios
```

`kuito build android` baut die Android-Shell mit generierten JS-Bootstrap-/App-Assets. `kuito dev --no-launch` führt nur die Quellpatch-Kompilierung aus.

Bauen ohne Starten:

```sh
kuito build ios              # or android: the bundled JS and the shells, in .kuito/ (apps.md)
```

`native/ios` und `native/android` lassen sich weiterhin eigenständig bauen, aber ohne das
gebündelte JS, das zur jeweils gebauten App gehört.

`KUITO_DEV_URL` (iOS) und das Intent-Extra `kuito_dev_url` (Android) wählen den localhost-Patch-Transport, wobei der Android-Emulator `10.0.2.2` und physische Android-Geräte `adb reverse` verwenden.

## JavaScript gegenüber Hermes-Bytecode

Hermes führt nur Bytecode aus, der von seinem eigenen Release kompiliert wurde. Beide Plattformen linken dasselbe Hermes-V1-Release, einmalig in `native/hermes.json` festgepinnt (Version, Tag-Commit, Compiler-Integrität, iOS-Prüfsumme), das die CLI, Gradle und CI lesen. `test/hermesc.test.ts` schlägt fehl, wenn ein Konsument den Pin wiederholt oder das vendorisierte JSI von einem anderen Commit stammt.

- **Beide Plattformen** starten aus Bytecode: `bootstrap.hbc` (der gebündelte `src/runtime`-Kernel) und `app.hbc`, einmalig vom `hermesc` dieses Release kompiliert (`src/cli/hermesc.ts`). Der Compiler wird im npm-Paket `hermes-compiler` ausgeliefert, sodass die CLI den gepinnten Tarball einmalig nach `~/.cache/kuito` herunterlädt, seinen Integritäts-Hash prüft und `hermesc` behält. Bytecode erspart dem Gerät beim Kaltstart das Parsen und Kompilieren von rund 270 KB Skript (`docs/performance.md`).
- **Live Patches** erreichen beide als Quellcode.

Die Shells bündeln diese Assets in Debug-Builds für den Offline-Start, mit `app.js` daneben nur, um die Wiederholung desselben Builds durch den Dev-Server zu erkennen. Ein erneutes Verbinden des Patch-Sockets spielt den letzten Quellpatch erneut ein; die persistente Runtime behält kompatiblen Zustand und Views. Skriptkompilierungs- oder Laufzeit-Exceptions werden an die Geräte-UI gemeldet; ein Commit, dessen Host-Aufrufe werfen, wird als Ganzes verworfen.

## Verifizierungs-Gates und Abbruchkriterien

1. **Gradle/NDK:** Android muss die JSI-Bridge gegen Hermes kompilieren/linken und auf einem Emulator installieren. Bei Fehlschlag: CMake-Prefab-Ziele oder Paketierungs-/Link-Strategie beheben, bevor Features hinzukommen.
2. **Xcode/SwiftPM:** iOS muss die Objective-C++-Bridge kompilieren/linken und auf einem Simulator starten. Bei Fehlschlag: gepinnte Framework-Header, das Hermes-Paket und die Projektgenerierung klären; keine Laufzeitaussagen, bevor dies bestanden ist.
3. **Betrieb auf dem Gerät:** Bei gestopptem Dev-Server zeigt ein Offline-Start `Count: 0`, Tipper aktualisieren das Label lokal, und die lokale UI bleibt reaktionsfähig.
4. **Live Patch:** Zwei Quellversionen behalten den Zähler, den Handler-Austausch und die View-Identität auf jedem Gerät. Ein Syntaxfehler behält die letzte funktionierende UI. Median-/p95-Latenz messen.
5. **Isolation:** Mobile Release-Profile müssen den Patch-Transport und unsichere Entwicklereinstellungen ablehnen. Diese Debug-Shells DÜRFEN NICHT als Produktions-Apps verteilt werden.

## Bekannte Einschränkungen

- Der aktuelle Quellcode verlagert Hermes auf dedizierte serielle Worker-Queues, sodass teures JavaScript den nativen UI-Thread nicht monopolisiert ([natives Scheduling](native-scheduling.md)). Host-Mutationen werden gepuffert und asynchron zugestellt; native UI und JS können vorübergehend unterschiedliche Zustände beobachten.
- Androids vendorisierte JSI-Quellen müssen zusammen mit `native/hermes.json` bewegt werden: beide gemeinsam anheben, sonst sind sich `libhermesvm.so` und `libjsi.so` über die JSI-ABI uneins.
- Der Geräte-Patch-Transport ist unauthentifiziert, **nur Loopback** und ausschließlich für vertrauenswürdige Entwicklung; es gibt keinen Produktions-OTA-Mechanismus.
- Kein Produktions-AOT, keine Tests zur Fokuserhaltung, keine deterministischen strukturellen Remounts, keine Plattform-Benchmarks und keine Validierung auf physischen Geräten.
