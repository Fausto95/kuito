# Hintergrundaufgaben

`backgroundTasks` führt JavaScript aus, während die App im Hintergrund ist oder gar nicht
läuft: Das Betriebssystem wählt den Zeitpunkt, startet die App bei Bedarf ohne UI
und gibt der Aufgabe eine Frist. Es ist ein [natives Modul](native-modules.md)
auf iOS (BGTaskScheduler) und Android (JobScheduler).

```tsx
import { backgroundTasks, storage } from 'kuito';

// At module scope: a background launch runs the app's modules, not its UI.
backgroundTasks.define('sync', async ({ deadline }) => {
  const response = await fetch('https://api.example.com/feed');

  await storage.set('feed', await response.text());
});

export default function App() {
  // Once, from anywhere: the OS keeps the registration across launches and reboots.
  void backgroundTasks.register('sync', { minimumInterval: 60, requiresNetwork: true });
  // …
}
```

```ts
// kuito.config.ts
export default {
  // …
  backgroundTasks: ['sync'],
} satisfies KuitoConfig;
```

| Funktion                                                                    | Was sie tut                                                                                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `define(name, task)`                                                        | Die Funktion, die das Betriebssystem unter `name` ausführt. Auf Modulebene aufrufen. Ein Name erneut definiert ersetzt seine Aufgabe.                     |
| `register(name, { minimumInterval?, requiresNetwork?, requiresCharging? })` | Bittet das Betriebssystem, die Aufgabe etwa alle `minimumInterval` Minuten auszuführen (mindestens 15, der Standard). Ersetzt eine frühere Registrierung. |
| `unregister(name)`                                                          | Hält das Betriebssystem davon ab, sie auszuführen.                                                                                                        |
| `status()`                                                                  | `'available'`, oder `'denied'`/`'restricted'`, wenn der Benutzer oder eine Richtlinie Hintergrundarbeit für die App abgeschaltet hat.                     |

Eine Aufgabe erhält `{ name, deadline }`, mit `deadline` in Millisekunden seit der
Epoche. Auflösen, wenn die Arbeit erledigt ist. Eine Aufgabe, die wirft oder ablehnt, meldet dem
Betriebssystem einen fehlgeschlagenen Lauf und ihren Fehler an die LogBox (oder das Geräteprotokoll, wenn
headless). Das Betriebssystem behandelt `minimumInterval` als Untergrenze: Es bündelt Arbeit,
wägt Akku und Nutzung ab und kann eine Aufgabe Stunden später oder gar nicht ausführen.

`register` schlägt mit `ERR_UNDECLARED` für einen Namen fehl, den die Konfiguration nicht deklariert,
und auf einem iOS-Gerät mit `ERR_UNAVAILABLE`, wenn die Hintergrundaktualisierung
aus ist. Der Simulator hat keinen BGTaskScheduler (siehe [Debugging](#debugging)).

[Standortaufgaben](location.md#background-updates) sind ebenfalls Hintergrundaufgaben,
die die Plattform mit jedem Batch von Positionsbestimmungen statt nach Zeitplan ausführt:
`location.defineUpdates` definiert eine.

## In kuito.config.ts deklarieren

`backgroundTasks` listet die Namen, die die App registrieren darf: Buchstaben, Ziffern, `.`,
`_` und `-`. Die Liste einer Umgebung ersetzt die Basisliste
([Apps](apps.md#environments)). Die CLI schreibt sie in die generierten Shells
(`src/cli/shells.ts`):

- **iOS**: `BGTaskSchedulerPermittedIdentifiers` (die Namen, wie geschrieben) und
  `UIBackgroundModes` `fetch` und `processing`.
- **Android**: den Job-Service `KuitoBackgroundTaskService`, die Namen als
  `dev.kuito.backgroundTasks`-Metadaten und `RECEIVE_BOOT_COMPLETED`, das
  registrierte Jobs über Neustarts hinweg erhält.

Eine App ohne Hintergrundaufgaben bekommt nichts davon.

## Wie eine Aufgabe läuft

1. **Das Betriebssystem startet die Aufgabe.** Auf iOS feuert ein Launch-Handler des BGTaskScheduler;
   die Shell registriert einen für jeden deklarierten Namen beim Start der App,
   da BGTaskScheduler sie nur dann annimmt. Auf Android startet JobScheduler
   `KuitoBackgroundTaskService` im Prozess der App.
2. **Sie wird zu einem Lauf** mit einer Id und einer Frist, gehalten von
   `KuitoBackgroundTasks` (eines pro Plattform, neben den anderen gemeinsamen Objekten
   der Shell). Er geht an die Runtime, die zuletzt begonnen hat, auf Läufe zu hören:
   die UI der App, wenn sie sich öffnet, während eine Headless-Runtime läuft.
3. **Hört keine Runtime, startet die Shell eine Headless-Runtime**,
   `KuitoHeadlessRuntime`, über das `startRuntime`, das sie
   `KuitoBackgroundTasks` beim Start der App übergibt (der iOS-App-Delegate,
   Androids `KuitoApplication`): eine Hermes-Runtime mit nativen Modulen und
   ohne View-Baum. Sie setzt `__kuitoHostHeadless`, bevor der Kernel lädt, und
   wertet dann den Kernel und die gebündelte App aus. Die Module der App laufen, also laufen ihre
   `define`-Aufrufe ebenfalls, aber der Kernel überspringt `patch`, sodass nichts gemountet wird. Auf
   Android haben Module in einer Headless-Runtime keine Activity: Eines, das sie braucht,
   schlägt mit `ERR_NO_ACTIVITY` fehl. `storage` funktioniert; `share()` und `permissions`-
   Abfragen nicht.
4. **Der Kernel hört auf Läufe, sobald eine Aufgabe definiert ist**
   (`src/runtime/background-tasks.ts`). Das Hören ist das Signal: Die Plattform
   liefert wartende Läufe als `run`-Ereignis, und der Kernel ruft die Aufgabe auf.
5. **Der Lauf endet einmal.** Wenn die Aufgabe abschließt, ruft der Kernel `finish` auf, und
   die Plattform meldet es dem Betriebssystem (`setTaskCompleted(success:)`, `jobFinished`). Lässt
   das Betriebssystem die Aufgabe zuvor ablaufen oder verstreicht die Frist, endet der Lauf als
   fehlgeschlagen, und ein späteres `finish` wird ignoriert. Wenn der letzte Lauf endet, fährt eine Headless-
   Runtime herunter, es sei denn, Standortaufgaben laufen: Ihre Läufe kommen
   alle paar Sekunden, also bleibt sie oben, bis deren Updates aufhören.

Ist die App im Hintergrund, aber am Leben, hört ihre UI-Runtime bereits,
sodass die Aufgabe dort läuft, neben der gemounteten App, ohne zweite
Runtime. Ein Lauf für einen Namen, den die App nie definiert hat, schlägt sofort fehl und sagt es.

Die Headless-Runtime wertet die gebündelte App aus, nie einen Live Patch: Eine während
`kuito dev` geänderte Aufgabe läuft im Hintergrund im Stand des letzten Builds.

## Plattformgrenzen

|                    | iOS                                                                                                                               | Android                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Scheduler          | BGTaskScheduler                                                                                                                   | JobScheduler, periodisch und persistiert                                                                |
| Laufzeit           | App-Refresh: etwa 30 s. Processing: Minuten                                                                                       | 10 Minuten                                                                                              |
| `deadline`         | 25 s (Refresh) oder 170 s (Processing) nach dem Start                                                                             | 9 Minuten nach dem Start                                                                                |
| `requiresCharging` | Macht sie zu einer Processing-Aufgabe (`requiresExternalPower`), die iOS ausführt, wenn das Gerät im Leerlauf ist, oft über Nacht | `setRequiresCharging`                                                                                   |
| `requiresNetwork`  | Gilt für Processing-Aufgaben; App-Refresh-Aufgaben ist keine Verbindung garantiert                                                | `NETWORK_TYPE_ANY`                                                                                      |
| Wiederholungen     | iOS führt eine Anfrage einmal aus; jeder Lauf reicht die nächste ein, aus der Registrierung, die Kuito speichert                 | Periodische Jobs wiederholen sich                                                                       |
| Aus, wenn          | Die Hintergrundaktualisierung aus ist (`status()` meldet `denied`), Stromsparmodus, oder der Benutzer die App beendet hat         | Der Benutzer die Hintergrundnutzung der App eingeschränkt (`restricted`) oder sie erzwungen beendet hat |

**Warum JobScheduler und nicht WorkManager.** Ein periodischer Job mit Netzwerk- und Lade-
Bedingungen, über Neustarts hinweg erhalten, ist alles, was `register` braucht, und JobScheduler
leistet das auf jeder Android-Version, die Kuito unterstützt. WorkManager fügt etwa 0,4 MB
und eine eigene Datenbank hinzu, um dieselben Funktionen auf API-Level unter 23 zu bringen und
Arbeit zu verketten; beides nutzt Kuito nicht. Job-Ids sind der Java-
`hashCode` des Aufgabennamens, nicht-negativ gemacht.

## Debugging

Das Betriebssystem entscheidet, wann Aufgaben laufen, also von Hand auslösen. Jedes `register` protokolliert
den Befehl für seine Aufgabe.

**iOS-Gerät**: die App im Debugger anhalten (`lldb` oder die Pause-Schaltfläche
von Xcode) und ausführen:

```text
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"sync"]
```

Fortsetzen, und der Launch-Handler feuert; `_simulateExpirationForTaskWithIdentifier:`
lässt sie ablaufen. Die Aufgabe muss zuerst registriert sein: iOS simuliert nur einen Start, für
den es eine Anfrage hat.

**iOS-Simulator**: Er hat keinen BGTaskScheduler. `submit` schlägt dort fehl, und der
Debugger-Befehl findet keine Anfrage, also speichert `register` die Registrierung,
protokolliert dies, statt fehlzuschlagen, und jede deklarierte Aufgabe hört auf eine Darwin-
Benachrichtigung:

```sh
xcrun simctl spawn booted notifyutil -p dev.kuito.backgroundTasks.run.sync
```

Der Lauf nimmt denselben Weg wie ein Start: die UI-Runtime, wenn eine
hört, andernfalls eine Headless-Runtime. Der Simulator suspendiert eine App kurz
nachdem sie den Bildschirm verlässt, und eine dann gepostete Benachrichtigung wird zugestellt, wenn
sie zurückkehrt. Um den Headless-Pfad auszuprobieren, die Binärdatei der App ohne Szene starten,
so wie iOS sie für eine Aufgabe startet, und dann die Benachrichtigung posten:

```sh
xcrun simctl terminate booted <bundle id>
DATA=$(xcrun simctl get_app_container booted <bundle id> data)
SIMCTL_CHILD_HOME=$DATA SIMCTL_CHILD_CFFIXED_USER_HOME=$DATA \
  xcrun simctl spawn booted "$(xcrun simctl get_app_container booted <bundle id>)/KuitoIOS" &
```

Die beiden Variablen geben ihr die eigenen Daten der App, sodass `storage` das der App ist.

**Android**:

```sh
adb shell cmd jobscheduler run -f <applicationId> <job id>
```

`-f` führt ihn aus, auch wenn seine Bedingungen nicht erfüllt sind. Um den Fall zu prüfen, dass
die App nicht läuft, sie in den Hintergrund legen und nur den Prozess beenden
(`adb shell am kill <applicationId>`); `am force-stop` stoppt die App, und
Android führt keine Jobs für eine gestoppte App aus. `adb shell dumpsys jobscheduler`
listet die Jobs der App.

Auf beiden Plattformen protokolliert der Lauf sein Ergebnis (`Background task 'sync'
succeeded`) in das Geräteprotokoll: Console.app oder `xcrun simctl spawn booted log
stream` auf iOS, Logcat-Tag `Kuito` auf Android, wohin auch die
`console`-Ausgabe einer Headless-Runtime geht.
