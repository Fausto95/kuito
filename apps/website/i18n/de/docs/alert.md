# alert und prompt

Native Alerts als Promises: `UIAlertController` auf iOS, ein Material-Dialog auf
Android. `prompt()` fragt auf beiden Plattformen nach Text.

```tsx
import { alert, prompt } from 'kuito';

const remove = { text: 'Delete', style: 'destructive' } as const;
const picked = await alert({
  title: 'Delete episode?',
  message: 'It leaves your downloads.',
  buttons: [{ text: 'Cancel', style: 'cancel' }, remove],
});

if (picked === remove) await removeEpisode(episode);

const answer = await prompt({ title: 'Rename list' });

if (answer?.button.text === 'OK') rename(list, answer.value);
```

## `alert(options)`

Zeigt den Alert und löst mit dem Button auf, den der Benutzer gewählt hat, demselben
Objekt, das `buttons` enthält, oder mit `null`, wenn der Alert ohne einen solchen geschlossen wurde.
Ohne `buttons` ein OK-Button.

| Button-Feld | Bewirkt                                                               |
| ----------- | --------------------------------------------------------------------- |
| `text`      | Die Beschriftung.                                                     |
| `style`     | `default`, `cancel` oder `destructive` (rot). Höchstens ein `cancel`. |
| `preferred` | iOS: der Button, den die Eingabetaste wählt, in Fettschrift.          |

| Option               | Bewirkt                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `title`, `message`   | Der Text des Alerts.                                                               |
| `buttons`            | Die Buttons, in Reihenfolge.                                                       |
| `cancelable`         | Android: Zurück oder ein Tippen außerhalb schließt den Alert. Standardmäßig false. |
| `userInterfaceStyle` | iOS: `light` oder `dark`, unabhängig vom Erscheinungsbild der App.                 |

Zwei `cancel`-Buttons lehnen mit einem `TypeError` ab, bevor etwas angezeigt wird: UIKit wirft bei
ihnen eine Exception. Android platziert die Buttons wie React Native: der letzte ist positiv, der
davor negativ, ein dritter neutral, und mehr als drei schlagen mit
`ERR_ARGUMENT` fehl. Ein `destructive`-Button wird in der Fehlerfarbe des Themes gezeichnet.

## `prompt(options)`

Ein Alert mit Textfeldern. Er übernimmt die Optionen von `alert`, mit Cancel und OK als
Standard-Buttons, und löst mit `{ button, value }` auf: dem gewählten Button und
dem, was der Benutzer eingegeben hat, oder mit `null`, wenn er geschlossen wurde.

| `type`           | Felder                                                      | `value`               |
| ---------------- | ----------------------------------------------------------- | --------------------- |
| `plain-text`     | eines (der Standard)                                        | der Text              |
| `secure-text`    | eines, verborgen                                            | der Text              |
| `login-password` | ein Login, mit `defaultValue`, und ein verborgenes Passwort | `{ login, password }` |

`keyboardType` ist `default`, `email-address`, `numeric`, `phone-pad`,
`number-pad`, `decimal-pad` oder `url`. Auf Android sind die Felder Material-Textfelder
im Dialog, die Tastatur öffnet sich mit ihm, und Fertig im letzten Feld
drückt den letzten Button, den die Tastatur auf einem kurzen Bildschirm verdecken kann.

Ein Neuladen schließt die noch offenen Alerts; ihre Promises werden nie erfüllt.
