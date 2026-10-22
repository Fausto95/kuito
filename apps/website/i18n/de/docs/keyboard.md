# Tastatur

Die native Seite verfolgt die Bildschirmtastatur und hält Eingabefelder
selbstständig von ihr frei, innerhalb der Tastaturanimation: über die
Tastatur-Notifications von UIKit auf iOS, über `WindowInsetsAnimation` auf
Android, wo das Ausweichen der Tastatur Frame für Frame folgt. JavaScript
liegt nicht auf diesem Pfad, daher wartet nichts auf einen Roundtrip und
nichts rät einen Offset, wie es `KeyboardAvoidingView` von React Native mit
`keyboardVerticalOffset` tut.

## Ausweichen

**Scroll-Views und Listen tun es standardmäßig.** Während die Tastatur einen
Teil eines vertikalen Scroll oder einer List verdeckt, wird deren Inhalt um
diesen Teil eingerückt, sodass alles weiterhin in den sichtbaren Bereich
gescrollt werden kann, und ein fokussiertes Eingabefeld darin (in einer Zeile,
bei einer Liste) scrollt nach oben, bis es die Tastatur freigibt. Der Inset
addiert sich zum eigenen Padding der View. Eine invertierte Liste nimmt ihn an
ihrem Anfang, der auf dem Bildschirm unten liegt, sodass eine dort ruhende
Liste ihre ersten Zeilen über der Tastatur behält, wie es ein Chat sollte.
Abschalten mit `keyboard={{ inset: false }}`. Es ist standardmäßig an, auf
beiden Plattformen.

**Jeder Container kann ihr ausweichen** mit `keyboard={{ avoid }}`:

| Wert       | Was passiert                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`     | Nichts (der Standard).                                                                                                                                                |
| `padding`  | Das untere Padding wächst um den Teil des Containers, den die Tastatur verdeckt, und sein Inhalt wird darüber angeordnet. Ein Chat-Composer.                          |
| `position` | Der Container bewegt sich nach oben, bis sein fokussiertes Eingabefeld die Tastatur freigibt, oder, ohne fokussiertes Eingabefeld darin, bis seine Unterkante es tut. |

```tsx
<SafeArea flex={1}>
  <List data={messages} renderItem={...} />
  <HStack keyboard={{ avoid: 'padding' }}>
    <TextField flex={1} placeholder="Message" enterKeyHint="send" onSubmit={send} />
  </HStack>
</SafeArea>
```

Beide messen den Container gegen den tatsächlichen Rahmen der Tastatur, wo
auch immer der Container auf dem Bildschirm liegt und wie auch immer seine
Vorfahren ihn skalieren, drehen oder spiegeln. `padding` addiert sich zum
Inset einer SafeArea, statt sich darauf zu stapeln: Die Unterkante erhält das
Größere von beidem, den Home-Indikator oder die Tastatur. `position`
kombiniert sich mit dem eigenen `translateY` der View. Nach jeder
Layout-Änderung, während die Tastatur angezeigt wird (ein Geschwister ändert
seine Größe, Inhalt trifft ein), misst das Ausweichen erneut.

## Eingabefelder

| Prop                         | Bedeutung                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `enterKeyHint`               | HTMLs `enterkeyhint`, die Beschriftung der Eingabetaste: `enter`, `done`, `go`, `next`, `search` oder `send`. |
| `submitBehavior`             | Nach `onSubmit`: `blurAndSubmit` (Standard) blendet die Tastatur aus; `submit` behält den Fokus.              |
| `autoFocus`                  | Fokussiert das Eingabefeld, sobald es auf dem Bildschirm ist.                                                 |
| `ref.focus()` / `ref.blur()` | Fokussieren oder den Fokus entziehen aus JavaScript.                                                          |

**Die Fokusreihenfolge** ist die Reihenfolge, in der Eingabefelder im
View-Baum erscheinen, wie im DOM: innerhalb desselben Screens oder Sheets,
unter Auslassung versteckter und deaktivierter Eingabefelder. Mit
`enterKeyHint="next"` und dem Standard-`submitBehavior` bewegt die
Eingabetaste den Fokus nativ zum nächsten Eingabefeld, im selben Frame, sodass
die Tastatur nie verschwindet und wieder erscheint. Das letzte Eingabefeld
gibt den Fokus ab. Den Fokus selbst in `onSubmit` zu bewegen funktioniert
weiterhin: Das eigene `focus()` kommt nach der nativen Bewegung an und
gewinnt. Auf Android ersetzt dies die räumliche Fokussuche der Plattform,
sodass beide Plattformen dieselben Eingabefelder durchlaufen. Eine
Hardware-Eingabetaste bewegt einmal.

`multiline`-Eingabefelder und `submitBehavior="newline"` existieren noch nicht.

**Kontrollierte Eingabefelder behalten, was der Nutzer tippt.** Ein
Change-Ereignis kann JavaScript erreichen, nachdem der Nutzer weitergetippt
hat. Seinen Text als `value` zurückzuspiegeln würde die neueren Zeichen
löschen, daher sendet der Kernel einem Feld nie den Text, den es gerade
gemeldet hat. Ein Wert, den die App selbst setzt (das Feld leeren, einen
Vorschlag eintragen), wird gesendet. Dasselbe gilt für den `value` eines
Toggle.

## Scroll-Views

Das `keyboard`-Objekt eines Scroll oder einer List nimmt außerdem entgegen:

| Feld          | Bedeutung                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dismiss`     | `none` (Standard), `on-drag` (ein Ziehen blendet die Tastatur aus) oder `interactive` (iOS: die Tastatur folgt dem Finger; Android hat keine solche Tastatur und blendet beim Ziehen aus).                                                                                                              |
| `persistTaps` | Während die Tastatur angezeigt wird, ein Tipp außerhalb des fokussierten Eingabefelds: `never` (Standard) blendet die Tastatur aus und geht nicht weiter; `handled` blendet sie nur aus, wenn kein Pressable, Button, Switch oder Eingabefeld den Tipp entgegengenommen hat; `always` lässt sie stehen. |
| `inset`       | Siehe [Ausweichen](#avoidance). Standardmäßig true.                                                                                                                                                                                                                                                     |

Mit `never` scrollt die Scroll-View weiterhin: Nur ein Tipp wird von ihren
Kindern zurückgehalten. Beide Plattformen entscheiden auf dieselbe Weise, ob
ein Tipp behandelt wurde, anhand der View unter dem Finger.

## keyboard

Die Tastatur als Signale und Ereignisse, für App-Logik. Das Layout braucht
sie nicht.

```tsx
import { Text, keyboard } from 'kuito';

<Text>{keyboard.visible.value ? 'typing' : ''}</Text>;
keyboard.frame.value; // { screenX, screenY, width, height } or null

// In a component, until it unmounts; elsewhere, until remove().
keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

keyboard.dismiss();
```

`visible` wird true, sobald die Tastatur erschienen ist, und false, sobald
sie verschwunden ist; `frame` folgt ihr, und jede Änderung ist ein neues
Frame-Objekt. `willShow`, `didShow`, `willHide`, `didHide`, `willChangeFrame`
und `didChangeFrame` werden auf **beiden** Plattformen ausgelöst; auf Android
kommen sie vom Anfang und Ende der Inset-Animation. Ein Ereignis ist
`{ frame, duration, easing, isEventFromThisApp }`: Koordinaten in Punkten auf
dem Bildschirm (Höhe 0, sobald ausgeblendet), Dauer in Millisekunden (0, wenn
die Tastatur nicht animiert), und `easing` ist `keyboard` für die
systemeigene Kurve.

## Wie es die Grenze überquert

- `keyboard.dismiss()`, `focus()` und `blur()` sind **Commands**: einmalige
  Anweisungen in der Mutationsqueue, nach den View-Mutationen vor ihnen. Ein
  `focus()` direkt nach der Zustandsänderung, die ein Eingabefeld anzeigt,
  erreicht das Eingabefeld, sobald es existiert. Siehe
  [natives Rendering](native-renderer.md).
- Tastaturereignisse sind native Ereignisse der App (Handle 0) namens
  `keyboard.<type>` (`keyboard.didshow` plus eine flache Nutzlast), dispatcht
  wie die einer View (siehe [Ereignisse](events.md)). Ein Ereignis, auf das
  niemand hört, wird verworfen.
