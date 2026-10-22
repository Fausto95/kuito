# actionSheet

Eine Liste von Aktionen, als Promise, auf beiden Plattformen:
das Action Sheet von `UIAlertController` auf iOS, ein Material Bottom Sheet auf
Android.

```tsx
import { Pressable, actionSheet } from 'kuito';

<Pressable
  onPress={async (event) => {
    const index = await actionSheet({
      options: ['Share', 'Add to list', 'Delete', 'Cancel'],
      cancelButtonIndex: 3,
      destructiveButtonIndex: 2,
      title: 'Episode 4',
      anchor: { x: event.pageX ?? 0, y: event.pageY ?? 0 },
    });

    if (index === 2) remove(episode);
  }}
/>;
```

`actionSheet(options)` löst mit dem Index der gewählten Option auf. Das Schließen
des Sheets, durch ein Tippen außerhalb, Zurück oder ein Wischen, löst mit `cancelButtonIndex` auf, oder
mit `null`, wenn es keinen gibt.

| Option                   | Bewirkt                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `options`                | Die Beschriftungen, mindestens eine.                                                     |
| `cancelButtonIndex`      | Abgesetzt dargestellt: unten auf iPhone und Android, in einem iPad-Popover ausgeblendet. |
| `destructiveButtonIndex` | Ein Index oder mehrere; in Rot gezeichnet.                                               |
| `disabledButtonIndices`  | Abgeblendet dargestellt; sie können nicht gewählt werden.                                |
| `title`, `message`       | Über den Optionen.                                                                       |
| `tintColor`              | Die Farbe der Optionen: eine Hex-Farbe. Das Design von iOS 26 ignoriert sie.             |
| `anchor`                 | `{ x, y }` in Fensterpunkten, wie `pageX` und `pageY` eines Press-Events.                |
| `userInterfaceStyle`     | iOS: `light` oder `dark`, unabhängig vom Erscheinungsbild der App.                       |

Ein Index außerhalb von `options` lehnt mit einem `RangeError` ab, bevor etwas angezeigt wird.

## iPad und der Anker

Das iPad zeigt das Sheet als Popover. Mit einem `anchor` zeigt es dorthin; ohne
einen sitzt es in der Mitte des Fensters ohne Pfeil. Seit iOS 26 erzeugt ein Anker
auch auf dem iPhone ein Popover; ohne einen behält das iPhone das Sheet
unten. Ein Popover schließt sich bei einem Tippen außerhalb, was mit dem Cancel-Index auflöst,
oder mit `null`, wenn es keinen gibt. Der Anker ist ein Ort, keine View: er braucht
keine View-Suche und zeigt dorthin, wo der Benutzer berührt hat.

Android listet die Optionen in Reihenfolge, mit der Cancel-Option zuletzt unter einem
Trennstrich, und löst mit `null` auf, wenn das Sheet ohne eine solche geschlossen wird. Ein
Neuladen schließt die noch offenen Sheets.
