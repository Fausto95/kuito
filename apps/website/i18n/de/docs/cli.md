# Kuito CLI — vom Simulator zum Quellcode in einem Befehl

Die CLI ist der vorgesehene Einstiegspunkt in Kuitos native Entwicklungsschleife. Sie erkennt Geräte, bootet einen iOS-Simulator oder Android-Emulator, baut die passende native Entwicklungs-Shell, installiert die App, startet sie und startet den Rolldown/Oxc-Live-Patch-Watcher. Xcode oder Android Studio müssen zum Ausführen der App **nicht** geöffnet werden, die zugrunde liegenden Apple-/Android-SDKs müssen aber installiert sein.

## Schnellstart

```sh
kuito doctor
kuito devices
kuito dev ios
kuito dev android --device Pixel_9
```

`kuito` führt die App in dem Verzeichnis aus, in dem es gestartet wird, das eine `kuito.config.ts` braucht; in diesem Checkout ist das `demo/` (`cd demo && kuito dev ios`). Der Standard-Einstiegspunkt ist `./app`. Für einen anderen Einstiegspunkt: `kuito dev ios --entry navigation.tsx` in `demo/`. Für den Headless-Einsatz: `kuito devices --json` oder `--device` angeben (eine Abfrage erscheint nur, wenn mehrere Geräte verfügbar sind und ein echtes TTY existiert). `kuito --help` zeigt alle Befehle und Schalter.

## Eine App erstellen

```sh
kuito create MyApp     # alias: kuito init MyApp
cd MyApp
kuito dev ios          # or: kuito dev android
```

`kuito create <name>` schreibt eine neue App nach `./<name>` und führt dort
`npm install` aus (`--no-install` überspringt es). Der Name beginnt mit einem
Buchstaben und enthält Buchstaben, Ziffern, `-` und `_`; er benennt das
Verzeichnis und, kleingeschrieben, das npm-Paket. Ein vorhandenes Verzeichnis
muss leer sein: `create` überschreibt nie Dateien.

```text
MyApp/
  package.json     scripts ios / android / start; depends on kuito
  kuito.config.ts native settings: name, ids, icon, a staging environment (docs/apps.md)
  assets/          icon.png, icon-staging.png and splash.png
  tsconfig.json    Kuito's JSX settings, for the editor and tsc
  README.md
  .gitignore       includes .kuito/, the generated shells
  modules/         the app's native modules (kuito module create)
  app/             file-based routes (docs/navigation.md)
    _layout.tsx                    Home and Explore tabs, platform symbols
    (home)/index.tsx               image, state, a motion animation, links
    (explore)/explore.tsx          a List of topics
    (explore)/explore/[topic].tsx  each topic with a live demo
    about.tsx                      a sheet
    _components/                   shared components, topics and demos
```

Die Vorlage liegt in `templates/app`, `kuito.config.ts` eingeschlossen, mit dem Namen
der App und den `com.example.<name>`-IDs ausgefüllt; `package.json` und `tsconfig.json`
werden von `src/cli/create.ts` geschrieben.

**Woher Kuito kommt.** `kuito create` fügt das veröffentlichte Paket `kuito`
als Abhängigkeit der App hinzu und installiert es. Dieses Paket liefert die
Imports, die Typen und den Befehl `kuito`. Ein Upgrade ist ein Versionswechsel.

**Native Shells bleiben im Framework.** Die App committet kein natives Projekt.
`kuito dev` und `kuito build` generieren ihre Shells aus `native/ios` und
`native/android` des Frameworks, konfiguriert durch `kuito.config.ts`, in das
gitignorierte `.kuito/` der App und installieren sie unter dem eigenen Namen
und den eigenen IDs der App. Die nativen Projekte in jede App zu kopieren
würde sie bei der ersten Framework-Änderung forken; ein Upgrade ist stattdessen
ein Versionssprung. [App-Projekte](apps.md) beschreibt das Layout, die
Konfigurationsschlüssel und wie die Shells generiert werden.

**Umgebungen.** `--env <name>` baut eine der Umgebungen der Konfiguration:
`kuito dev ios --env staging` installiert die Staging-App der Starter-Vorlage,
mit eigenem Namen, Symbol und eigenen IDs, neben der Produktions-App. `kuito dev`
verwendet standardmäßig `development` und `kuito build` `production`
([Umgebungen](apps.md#environments)).

**Einstiegspunkt.** `--entry` ist relativ zu dem Verzeichnis, in dem `kuito`
läuft. Ohne es führt `kuito dev` `./app` aus: das Verzeichnis `app/`, wenn es
existiert, sonst `app.tsx`. Das `demo/` dieses Checkouts hat ein `app/`-Verzeichnis, Reel. Der Live-Patch-Server läuft ebenfalls in diesem Verzeichnis,
sodass die LogBox die Dateien der App öffnet und die Sitzung Pfade relativ dazu anzeigt.

## Interaktive Nutzung

`kuito dev` öffnet eine Geräteauswahl mit Filterung beim Tippen, wenn mehrere Ziele existieren (gebootete zuerst, dann die neueste Runtime; `--device` akzeptiert einen exakten Namen wie `"iPhone 18 Pro"`). Die Sitzung gibt dann eine abgeschlossene Zeile pro Schritt aus — Gerät gebootet, native App gebaut, Live Patch gestartet, App gestartet — gefolgt von einer Zeile pro Bearbeitung:

```
02:05:14  ✔ patched   app.tsx  rev 2 · 18ms
02:05:14  ✔ applied   app.tsx → iPhone 18 Pro  rev 2 · 142ms from save · eval 9ms
02:05:40  ✖ rejected  app.tsx:12:4
            Unexpected token
             12 |   return (,
            previous version stays live
```

`patched` ist der Build: seine Revision und wie lange das Kompilieren gedauert hat, oder `no device
connected`, wenn er kein Gerät erreicht hat. Jedes Gerät bestätigt die Revision dann selbst
([der Dev-Link](devtools.md#the-dev-link)): `applied` nennt das Gerät und die
Zeit vom Speichern der Datei bis zur Auswertung des Patch auf diesem Gerät, und ein
Patch, der auf einem Gerät wirft, zeigt `rejected on <device>` mit dem Fehler.
Unter dem Feed zeigt eine Zeile pro verbundenem Gerät die letzte Revision, die es bestätigt hat;
ohne verbundenes Gerät gibt es keine.

Eine dauerhafte Leiste listet Tastenkürzel: `r` neu bauen und neu starten, `l` Geräteprotokolle ein-/ausschalten, `d` Gerät wechseln, `m` die Devtools auf dem Gerät öffnen ([Devtools](devtools.md)), `j` den JS-Thread in Chrome DevTools debuggen (`u` für den UI-Thread, [Debugging](devtools.md#debugging-with-chrome-devtools)), `k` das Components-Panel ([Components](devtools.md#components)), `s` eine Aufzeichnung für `kuito replay` speichern ([Aufzeichnung](devtools.md#recording-and-replay)), `c` leeren, `?` Hilfe, `q` beenden; `kuito help` listet dieselbe Tabelle. Farben sind die eigenen benannten ANSI-Farben des Terminals, sodass helle und dunkle Themes lesbar bleiben. Build-Ausgaben sind ausgeblendet, sofern nicht `--verbose` gesetzt ist; ein fehlschlagender Schritt zeigt seine Zusammenfassung und die Zeilen der Werkzeugausgabe, die den Fehler nennen. Kompilierfehler — in einem Startschritt (die Geräte-Engine kompiliert die App zuerst) oder bei einer abgelehnten Bearbeitung — zeigen `file:line:column`, den Code-Frame und den Compiler, der sie gemeldet hat (zum Beispiel `reported by the styles() compiler`); Fehler ohne Zeile nennen immerhin die Datei.

Der Live-Patch-Compiler bleibt zwischen Bearbeitungen am Leben: ein Rebuild führt Kuitos Transformationen nur für die Module erneut aus, deren Quellcode sich geändert hat, und ein Build, dessen Ausgabe dieselbe ist wie die letzte (ein Kommentar, ein ungenutzter Export), ist dieselbe Revision und sendet keinen Patch.

Nativer Code wird ebenfalls neu geladen. Das Speichern einer `.swift`-, `.kt`- oder `.ts`-Datei unter `modules/` der App baut die Shell inkrementell neu und startet die App neu, und das tut auch ein Live Patch, der eine native Modulfunktion aufruft, die die laufende Shell nicht gelinkt hat ([native Module](native-modules.md#4-use-it)). TypeScript-Bearbeitungen bleiben Live Patches.

Die CLI beobachtet die gestartete App. Stürzt sie ab, zeigt die Sitzung die Ursache und die obersten Frames — aus dem macOS-Absturzbericht (`~/Library/Logs/DiagnosticReports`) für den iOS-Simulator und aus `adb logcat -b crash` für Java-Exceptions und native Tombstones auf Android — und bietet `r` zum Neubauen und Neustarten an. Eine App, die ohne Absturz beendet wird (zum Beispiel weggewischt), erzeugt nur eine Warnung.

Ohne TTY (CI, Pipes) wird derselbe Feed als einfache Zeilen ausgegeben, stdin akzeptiert `quit` und reicht `devtools`, `components` und `debug js|ui` an den Dev-Server weiter, und ein Absturz beendet den Befehl mit Exit-Code 1.

Die `console`-Ausgabe der App erscheint in der Sitzung an der Quellzeile, die sie protokolliert hat, und die [LogBox](logbox.md) öffnet Frames im Editor, den `KUITO_EDITOR` benennt.

Die CLI spricht mit dem Live-Patch-Server über zeilengetrennte JSON-Ereignisse (`KUITO_EVENTS=ndjson`): `ready`, `patched` (Revision, Build-Dauer, bearbeitete Dateien, ob es der initiale Build ist, wie viele Geräte er erreicht hat, die nativen Module, die das Bundle benötigt), `unchanged` (ein Rebuild mit derselben Ausgabe; nichts gesendet), `rejected` (Diagnosen mit Datei, Zeile, Spalte und Code-Frame), `device:connected` und `device:disconnected` (ID, Name und Plattform eines Geräts), `device:applied` (Revision, Auswertungszeit auf dem Gerät und die Zeit von der Bearbeitung bis zu diesem Ack) und `device:rejected` (Revision, Code, Meldung) für das Ack jedes Geräts ([der Dev-Link](devtools.md#the-dev-link)), `console` (Level, Meldung, Datei, Zeile, Spalte), `error` und `state`. `kuito dev` behält die menschenlesbare Ausgabe.

Weitere Befehle:

- `kuito create <name>`: eine neue App ([oben](#create-an-app)).
- `kuito module create <Name>`: ein natives Modul in `./modules/<name>` (Kebab-Case): seine TypeScript-Spezifikation, Swift und Kotlin ([native Module](native-modules.md#write-your-own-module)).
- `kuito build ios|android`: kompilieren, ohne einen Emulator zu starten oder Live Patch zu beginnen.
- `kuito devices`: laufende Simulatoren/Emulatoren und installierte, gestoppte Android-AVDs anzeigen.
- `kuito doctor`: was der Build braucht und diesem Rechner fehlt, mit einer Lösung für jeden Punkt.
- `kuito logs ios|android --device ...`: Plattformprotokolle streamen.
- `kuito replay <file.krec> [ios|android]`: eine gespeicherte Aufzeichnung auf einer Shell wiedergeben, die keine App ausführt ([Devtools](devtools.md#recording-and-replay)).
- `kuito dev ios --no-launch --port 9000`: nur den Live-Patch-Server ausführen. Jede Plattform erhält
  ihr eigenes Bundle ([Plattformen](styles.md#platforms)), eine Sitzung bedient also die Geräte einer Plattform
  und braucht deren Namen; ein Gerät der anderen Plattform wird als Fehler gemeldet.

## SDK-Voraussetzungen

Auf **macOS** Xcode mit seiner Simulator-Runtime und `xcodegen` installieren (üblicherweise `brew install xcodegen`). Die CLI nutzt `xcrun simctl` zum Booten/Installieren/Starten und `xcodebuild` zum Bauen. Code Signing ist für Simulator-Builds deaktiviert.

Für **Android** JDK 21, die Android-SDK-Platform-Tools (`adb`), den Emulator und ein AVD sowie Gradle 8 installieren (oder `native/android/gradlew` hinzufügen). Sie nutzt Gradle, `adb install`, `adb shell am start` und `emulator -avd`; `adb` und `emulator` kommen aus `$ANDROID_HOME` (oder `$ANDROID_SDK_ROOT`), wenn gesetzt, sonst aus `PATH`. Auf physischen Geräten nutzt sie `adb reverse`, um den lokalen Dev-Server zu erreichen; auf dem Android-Emulator nutzt sie `10.0.2.2`. `kuito doctor` prüft Node, Xcode, XcodeGen, adb, das JDK und Gradle, in den Versionen, die `src/cli/requirements.ts` an einer Stelle festlegt (Nodes Minimum ist das `engines` der `package.json`); es installiert keine SDK-Pakete und ersetzt weder Entwicklerlizenzierung noch SDK-Einrichtung. Ein Emulator, den `kuito` startet, schreibt seine Ausgabe nach `kuito-emulator-<avd>.log` im temporären Verzeichnis: beendet er sich vor dem Booten, schlägt der Boot mit dieser Ausgabe fehl. Ein fehlschlagender oder abgebrochener Boot stoppt ihn; ein gebooteter läuft weiter, nachdem `kuito` beendet wurde.

## App-Verbindung

Die CLI übergibt `KUITO_DEV_URL` an den iOS-Simulator-Prozess über `SIMCTL_CHILD_KUITO_DEV_URL`, und `kuito_dev_url` als Intent-Extra der Android-Activity. `--port` konfiguriert sowohl den Dev-Server als auch die App-URL. Der Dev-Server lauscht auf Loopback, und ein physisches Android-Gerät nutzt Port-Reversal. Nicht in einem nicht vertrauenswürdigen Netzwerk freigeben.

## Umfang & verbleibende Arbeit

Diese CLI automatisiert die Entwicklung gegen Kuitos **native UI-Shells**. Sie ist keine eigenständige, auf dem Gerät kompilierte Kuito-Anwendung, kein Dienst zur Verteilung von Produktions-Binaries und kein Ersatz für ein installiertes Xcode-/Android-SDK. Build/Start im iOS-Simulator und Installation/Start auf Android müssen auf echten Host-Rechnern geprüft werden: Linux-CI kann einen Xcode-Lauf nicht validieren. Typed Static Hermes AOT ist ein separates Experiment.

## Hermes auf dem Gerät

`kuito dev ios|android` baut Bootstrap- und Anwendungs-JS-Assets, kompiliert die mobile App mit der Hermes/JSI-Brücke, installiert/startet sie und startet einen Localhost-Server für Quellcode-Patches. JavaScript läuft in **jedem Geräteprozess**; der Desktop bündelt nur TSX und sendet Quellcode-Patches. Der native Build braucht weiterhin Hermes. Beide Plattformen linken dasselbe vorgebaute Hermes-V1-Release (die static_h-Linie), gepinnt in `native/hermes.json`: iOS linkt sein xcframework (`com.facebook.hermes:hermes-ios`, Debug-Variante) als lokales Swift-Paket: die CLI lädt den Tarball einmal herunter, prüft ihn gegen `iosSha256` und entpackt ihn mit einer generierten `Package.swift` nach `~/.cache/kuito/hermes-ios-<version>`, wovon das generierte Projekt abhängt (`src/cli/hermes-ios.ts`). Maven liefert einen Tarball, und die Remote-Binary-Targets von SwiftPM müssen Zips sein, daher das lokale Paket; Android linkt `com.facebook.hermes:hermes-android`. Siehe [Vorbehalte für Hermes auf dem Gerät](on-device-hermes.md).
