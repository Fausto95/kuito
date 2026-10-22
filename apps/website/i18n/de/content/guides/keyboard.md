# Tastatur

Die native Seite verfolgt die Bildschirmtastatur und hält Eingabefelder selbst von ihr frei, innerhalb der Animation der Tastatur. JavaScript liegt nicht auf diesem Pfad, also wartet nichts auf einen Roundtrip und nichts rät einen Offset.

## Ausweichen

Scroll-Views und Listen tun es standardmäßig. Solange die Tastatur einen Teil eines vertikalen Scroll oder einer List verdeckt, wird dessen Inhalt um diesen Teil eingerückt, sodass alles weiterhin in Sicht gescrollt werden kann, und ein fokussiertes Eingabefeld darin scrollt nach oben, bis es die Tastatur freigibt. Abschalten mit `keyboard={{ inset: false }}`.

Jeder Container kann ihr ausweichen mit `keyboard={{ avoid }}`:

| Wert       | Was geschieht                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`     | Nichts (der Standard).                                                                                                                                                |
| `padding`  | Das untere Padding wächst um den von der Tastatur verdeckten Teil des Containers, und sein Inhalt ordnet sich darüber an. Ein Chat-Composer.                          |
| `position` | Der Container bewegt sich nach oben, bis sein fokussiertes Eingabefeld die Tastatur freigibt, oder, ohne fokussiertes Eingabefeld darin, bis seine Unterkante es tut. |

```tsx
<SafeArea flex={1}>
  <List data={messages} renderItem={renderMessage} />
  <HStack keyboard={{ avoid: 'padding' }}>
    <TextField flex={1} placeholder="Message" enterKeyHint="send" onSubmit={send} />
  </HStack>
</SafeArea>
```

`padding` addiert sich zum Inset einer SafeArea, statt sich darauf zu stapeln: unten gilt das Größere, Home-Indikator oder Tastatur. Nach jeder Layout-Änderung, während die Tastatur zu sehen ist, misst das Ausweichen erneut.

## Eingabefelder

| Prop                         | Bedeutung                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `enterKeyHint`               | Die Beschriftung der Eingabetaste: `enter`, `done`, `go`, `next`, `search` oder `send`.          |
| `submitBehavior`             | Nach `onSubmit`: `blurAndSubmit` (Standard) blendet die Tastatur aus; `submit` behält den Fokus. |
| `autoFocus`                  | Fokussiert das Eingabefeld, sobald es auf dem Bildschirm ist.                                    |
| `ref.focus()` / `ref.blur()` | Fokussieren oder Fokus abgeben aus JavaScript.                                                   |

Die Fokusreihenfolge ist die Reihenfolge, in der Eingabefelder im View-Baum erscheinen, unter Auslassung verborgener und deaktivierter Eingabefelder. Mit `enterKeyHint="next"` und dem Standard-`submitBehavior` bewegt die Eingabetaste den Fokus nativ zum nächsten Eingabefeld, sodass die Tastatur nie verschwindet und wieder erscheint. Das letzte Eingabefeld gibt den Fokus ab. `multiline`-Eingabefelder und `submitBehavior="newline"` gibt es noch nicht.

Kontrollierte Eingabefelder behalten, was der Nutzer tippt: der Kernel sendet einem Feld nie den Text, den es gerade gemeldet hat. Ein Wert, den die App selbst setzt (das Feld leeren, einen Vorschlag einfügen), wird gesendet.

## Scroll-Views

Das `keyboard`-Objekt eines Scroll oder einer List nimmt außerdem:

- `dismiss`: `none` (Standard), `on-drag` (ein Ziehen blendet die Tastatur aus) oder `interactive` (iOS: die Tastatur folgt dem Finger; Android blendet beim Ziehen aus).
- `persistTaps`: während die Tastatur zu sehen ist, ein Tipp außerhalb des fokussierten Eingabefelds: `never` (Standard) blendet die Tastatur aus und geht nicht weiter; `handled` blendet sie nur aus, wenn kein Pressable, Button, Switch oder Eingabefeld den Tipp angenommen hat; `always` lässt sie stehen.
- `inset`: siehe Ausweichen. Standardmäßig true.

## keyboard

Die Tastatur als Signale und Ereignisse, für App-Logik. Das Layout braucht sie nicht.

```tsx
import { Text, keyboard } from 'kuito';

<Text>{keyboard.visible.value ? 'typing' : ''}</Text>;
keyboard.frame.value; // { screenX, screenY, width, height } or null

// In a component, until it unmounts; elsewhere, until remove().
keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

keyboard.dismiss();
```

`visible` wird true, sobald die Tastatur erschienen ist, und false, sobald sie verschwunden ist; `frame` folgt ihr. `willShow`, `didShow`, `willHide`, `didHide`, `willChangeFrame` und `didChangeFrame` feuern auf beiden Plattformen. Ein Ereignis ist `{ frame, duration, easing, isEventFromThisApp }`: Koordinaten in Punkten auf dem Bildschirm, Dauer in Millisekunden, und `easing` ist `keyboard` für die systemeigene Kurve.

## Vertiefung

[Tastatur](../../../../docs/keyboard.md) behandelt, wie das Ausweichen gegen den echten Frame der Tastatur misst, was Androids Fokussuche ersetzt, und wie Befehle und Tastaturereignisse die native Grenze überqueren.
