# app

Der eigene Zustand und die Aktionen der App: ob sie im Vordergrund ist, die
Speicherwarnungen des Systems und ihre Seite in den Einstellungen.

```tsx
import { watch, app } from 'kuito';

app.state.value; // 'active' | 'background' | 'inactive'

// In a component: both follow the platform until the component unmounts.
watch(app.state, (state) => {
  if (state === 'active') refresh();
});
app.watch('memoryWarning', () => cache.clear());

await app.openSettings();
```

| Member                       | Ist                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `state`                      | Ein Signal des Zustands. Unbeobachtet gelesen fragt es die Plattform.                            |
| `watch('memoryWarning', fn)` | Ruft `fn()` auf, wenn das System wenig Speicher hat; gibt seine `EventSubscription` zurück.      |
| `openSettings()`             | Öffnet die Seite dieser App in den Systemeinstellungen. Wird erfüllt, sobald sie geöffnet wurde. |

Die Plattform wird nur beobachtet, solange etwas `app.state` beobachtet: das
`watch` einer Komponente oder ein Prop oder Text, der es liest. Der Beginn der
Beobachtung meldet den Zustand, von dem die Plattform ausgeht, sodass eine
Änderung, die vorgenommen wurde, während sie noch startete (auf Android wird
die App in diesem Moment oft fortgesetzt), nicht verloren geht, und derselbe
Zustand zweimal ist eine Änderung.

`app.watch` in einer Komponente startet, wenn die Komponente mountet, und
stoppt, wenn sie unmountet; außerhalb einer Komponente startet es sofort, und
das `remove()` der zurückgegebenen Subscription stoppt es. Ein anderer
Event-Name wirft einen `TypeError`.

## Zustände

| Zustand      | iOS                                                                             | Android                                                                               |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `active`     | Die Scene ist im Vordergrund und empfängt Events.                               | Die Activity ist fortgesetzt.                                                         |
| `inactive`   | Beim Start oder dazwischen: ein Anruf, der App-Umschalter, das Kontrollzentrum. | Gestartet, aber pausiert: Eine andere Activity (das Share Sheet) verdeckt einen Teil. |
| `background` | Eine andere App oder der Home-Bildschirm ist im Vordergrund.                    | Die Activity ist gestoppt.                                                            |

React Native meldet auf Android `background`, sobald die Activity pausiert,
und hat dort kein `inactive`. Kuito meldet `inactive`, solange sie pausiert,
aber noch sichtbar ist, sodass ein Share Sheet nicht als Verlassen der App
zählt; Code, der auf `background` oder auf nicht `active` prüft, funktioniert
gleich.

`memoryWarning` kommt auf iOS von `applicationDidReceiveMemoryWarning` und auf
Android von `onTrimMemory` bei `RUNNING_LOW`, `RUNNING_CRITICAL` und
`COMPLETE`. Android 14 und neuer senden die Running-Stufen nicht mehr.

## Wie es verdrahtet ist

Die Shell meldet den Lebenszyklus an `KuitoAppLifecycle`
(`native/modules/app-state`, in seiner Spezifikation `always`, sodass jede
Shell es hat): die `sceneDidBecomeActive`, `sceneWillResignActive`,
`sceneWillEnterForeground` und `sceneDidEnterBackground` des Scene-Delegates
auf iOS und den `Lifecycle` der Activity auf Android. Das Modul liest und
beobachtet ihn dort, ebenso wie [brightness](brightness.md).
`KuitoAppLifecycle` überlebt die Laufzeit, sodass ein Reload mit dem aktuellen
Zustand beginnt und `app.state` korrekt ist, bevor irgendetwas es beobachtet.

Probieren Sie es vom Terminal aus: Starten Sie mit `xcrun simctl launch` eine
andere App, um diese in den Hintergrund zu schicken, oder auf Android:

```bash
adb shell input keyevent KEYCODE_HOME
```

```bash
adb shell am send-trim-memory dev.kuito.shell RUNNING_LOW
```
