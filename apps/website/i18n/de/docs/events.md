# Events

Event-Props sind nach dem Sachverhalt benannt, den sie melden
([Benennung](naming.md)). Jedes lauscht auf ein natives Event, und manche
übergeben statt des Events den Wert, den die View meldet.

| Prop                          | Natives Event          | Handler erhält                               |
| ----------------------------- | ---------------------- | -------------------------------------------- |
| `onPress` / `onPressCapture`  | `press`                | `PressEvent` (bubbelt, abbrechbar)           |
| `onPressStart` / `onPressEnd` | `pressin` / `pressout` | das Event                                    |
| `onLongPress`                 | `longpress`            | das Event                                    |
| `onChange`                    | `change`               | den Text bei TextField, `checked` bei Toggle |
| `onSubmit`                    | `submit`               | `{ text }`                                   |
| `onFocus` / `onBlur`          | `focus` / `blur`       | das Event                                    |
| `onLoad` / `onError`          | `load` / `error`       | das Event                                    |
| `onScroll`                    | `scroll`               | das Event                                    |
| `onAction`                    | `accessibilityaction`  | `{ actionName }`                             |

Eine View, die ein natives Modul beisteuert, hat stattdessen ihre eigenen
Events: Jedes `on*`-Prop lauscht auf das Event, das es benennt (`onChangeEnd`
auf `changeEnd`), wenn die View es deklariert, und der Handler erhält das Event
mit den Feldern der Payload ([native Views](native-modules.md#views)).

`onChange` übergibt den Wert, den die View meldet, nicht das Event: den Text
eines TextField, das `checked` eines Toggle. Der Text eines TextField ist sein
`value`.

Native Views melden jedes Event, ob die App lauscht oder nicht; ein Event, auf
das niemand lauscht, wird verworfen. Events überqueren Threads asynchron,
sodass eine View noch melden kann, nachdem ein Commit sie entfernt hat: Ein
fokussiertes TextField verliert den Fokus, wenn es das Fenster verlässt, und
alles, was es vor dem Eintreffen der Entfernung auf der nativen Seite gesendet
hat, ist noch unterwegs. Auch diese Events werden verworfen, sodass die Handler
einer entfernten View nie laufen (kein `onBlur` beim Unmount, wie in React
Native). Ein Event, das auf eine Id zielt, die der Kernel nie erzeugt hat, ist
ein Fehler.

Ein Reload leert den nativen Baum, bevor die nächste Laufzeit startet, und
keine View des geleerten Baums meldet erneut: Ein Bild, das beim Reload der App
noch lädt, sendet sein `load` nie an die neue Laufzeit, deren Views dieselben
Ids wiederverwenden.

Der `change`-Text eines TextField und der `change`-Wert eines Toggle werden zum
aufgezeichneten Prop der View, sodass ein kontrolliertes `value`, das nur
wiederholt, was die View gemeldet hat, nicht an sie zurückgesendet wird (siehe
[Tastatur](keyboard.md#inputs)).

## Bidirektionale Props

Manche Props ändert die View selbst: das `value` eines TextField, während der
Benutzer tippt, das `value` eines Toggle, das `open` eines Sheet, wenn der
Benutzer es schließt, das `refreshing` einer Scroll-View oder Liste, wenn der
Benutzer zum Aktualisieren zieht. Ihr Typ ist `Bound<T>`. Übergeben Sie ein
Signal, und die View schreibt es, ohne Handler:

```tsx
const query = signal('');

<TextField value={query} />; // typing writes query; query.value = '' clears the field
```

Das Manifest sagt, welches Event welches Prop meldet (`reports` in
`src/protocol/manifest.ts`): das Payload-Feld mit dem neuen Wert
(`change` → `text`) oder der Wert, den das Event bedeutet (`close` → `open: false`,
`refresh` → `refreshing: true`). Der Kernel zeichnet ihn zuerst als Prop der
View auf, sodass das Schreiben des Signals nicht zurückgesendet wird: Die View
zeigt ihn bereits. Ein schreibgeschütztes Signal (ein `computed`, der
Plattformzustand eines Moduls) oder ein einfacher Wert wird nur in eine Richtung
angezeigt und nie geschrieben. Eine View, die ein natives Modul beisteuert,
meldet ein Prop über jedes Event, dessen Payload ein Feld mit dem Namen des
Props hat (das `value` eines Slider).

## App-weite Events

Zustand, den die native Seite für die ganze App verfolgt, trifft auf dieselbe
Weise ein, als Event der App (Handle 0) mit dem Namen `<target>.<event>`:
`keyboard.<type>` für die Tastatur, `accessibility.status` für den Status von
Screenreader und reduzierter Bewegung, `devtools.select` für die Elementauswahl
des Dev-Menüs, `ui` für eine Nachricht vom UI-Thread und `host.idle`, ohne
Payload, wenn der UI-Thread jeden Batch angewendet hat, mit dem er in Rückstand
geraten war, was die Re-Plans ausführt, die darauf gewartet haben ([natives
Scheduling](native-scheduling.md)). Der Kernel reicht sie an die Signale und
Watcher `keyboard` und `accessibility` weiter ([Tastatur](keyboard.md),
[Barrierefreiheit](accessibility.md)); eines, auf das niemand lauscht, wird
verworfen. Jedes andere Ziel ist ein Fehler.

## Wire-Format

Ein natives Event besteht aus drei Werten: der Nummer der View (der, mit der
der Host-Batch sie erzeugt hat, docs/native-scheduling.md; 0 für die App), dem
Namen des Events und einer JSON-Objekt-Payload, wenn das Event Daten trägt:
`(17, "change", '{"text":"Ada"}')`. Die Shell übergibt sie an das `dispatch`
der Laufzeit, das `__kuito.dispatch(handle, event, payload)` aufruft. Eine
Zahl, die JSON nicht darstellen kann (NaN, Infinity), wird auf beiden
Plattformen an ihrer Stelle als `null` gesendet; ein Wert, der gar kein JSON
ist, ist ein Renderer-Bug und schlägt laut fehl. View-Nummern werden nie
wiederverwendet, sodass ein Event von einer View, die der Kernel bereits
entfernt hat (ein fokussiertes Feld verliert den Fokus, wenn es das Fenster
verlässt), verworfen wird; eine Nummer, die der Kernel nie vergeben hat, ist ein
Fehler.
