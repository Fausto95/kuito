# brightness

Die Bildschirmhelligkeit, solange die App im Vordergrund ist.

```tsx
import { Text, brightness } from 'kuito';

brightness.level.value = 1; // a QR code, a boarding pass
<Text>{`${brightness.level.value ?? '…'}`}</Text>;
await brightness.restore();
```

| Member      | Ist                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`     | Ein beschreibbares Signal, von 0 bis 1: der Wert der App, wenn sie einen gesetzt hat, andernfalls der des Systems. `null`, bis die Plattform antwortet. |
| `system`    | Ein Signal: ob die App keinen Wert gesetzt oder den des Systems wiederhergestellt hat. `null`, bis die Plattform antwortet.                             |
| `restore()` | Gibt die Helligkeit an das System zurück und liest dann beide Signale erneut.                                                                           |

Die Helligkeit wird auf dem Hauptthread gelesen, daher starten die Signale bei `null`, und das
erste Lesen fragt die Plattform. Das Zuweisen von `level` wirkt sofort; ein Wert
außerhalb von 0 bis 1 wirft einen `RangeError`, bevor etwas die Grenze überquert, und ein Schreibvorgang, den die
Plattform ablehnt, geht durch die Fehler-Nahtstelle und liest den Wert erneut.

Der Wert gilt nur, solange die App im Vordergrund ist, und ein Neuladen gibt ihn zurück:

- iOS hat eine Helligkeit für das ganze Gerät, sodass `UIScreen.brightness`
  die App überdauert. Das Modul merkt sich den Systemwert von vor der ersten
  Änderung, stellt ihn wieder her, wenn die App in den Hintergrund geht (über
  [`KuitoAppLifecycle`](app-state.md#how-it-is-wired)), und wendet den
  Wert der App erneut an, wenn sie zurückkehrt.
- Android setzt `screenBrightness` des Fensters, das das System bereits
  auf die Activity beschränkt.

Die systemweite Helligkeit (ihr Modus, die Berechtigung `WRITE_SETTINGS`) ist nicht
enthalten, ebenso wenig ein Änderungsereignis: `level` folgt den eigenen Schreibvorgängen der App. Der iOS-Simulator hat keine Hintergrundbeleuchtung: er ignoriert den Wert
und liest immer 0.5. Die Helligkeit lässt sich auf einem Gerät oder dem Android-Emulator ausprobieren.
