# localization

Die Sprachen, die Region, die Zeitzone und die Uhr des Benutzers, als Signale: synchron
gelesen und verfolgt, solange etwas sie beobachtet.

```tsx
import { watch, localization } from 'kuito';

const [locale] = localization.locales.value;
locale.languageTag; // 'pt-PT'
locale.currencyCode; // 'EUR'

const [calendar] = localization.calendars.value;
calendar.timeZone; // 'Europe/Lisbon'
calendar.uses24hourClock; // true

watch(localization.locales, ([preferred]) => console.log(preferred.languageTag)); // in a component
```

`locales` listet die Sprachen des Benutzers, die bevorzugte zuerst:

| Feld                     | Ist                                          |
| ------------------------ | -------------------------------------------- |
| `languageTag`            | BCP 47, wie `pt-PT` oder `zh-Hant-TW`        |
| `languageCode`           | Wie `pt`                                     |
| `languageScriptCode`     | Wie `Hant`, oder `null`                      |
| `regionCode`             | Wie `PT`, oder `null`                        |
| `textDirection`          | `ltr` oder `rtl`                             |
| `decimalSeparator`       | Wie `,`                                      |
| `digitGroupingSeparator` | Wie ein Leerzeichen oder `.`                 |
| `measurementSystem`      | `metric`, `us` oder `uk`                     |
| `currencyCode`           | ISO 4217, wie `EUR`, oder `null` ohne Region |
| `currencySymbol`         | Wie `€`                                      |
| `temperatureUnit`        | `celsius` oder `fahrenheit`                  |

`calendars` hat einen Eintrag: `calendar` (der CLDR-Name, wie `gregory` oder
`japanese`), `timeZone` (IANA), `uses24hourClock` und `firstWeekday` (1 ist
Sonntag).

Auf iOS folgen die Trennzeichen, das Maßsystem, die Währung und die Temperatureinheit
den Regionseinstellungen des Benutzers, die von der eigenen Region einer Sprache abweichen
können (Englisch mit Portugal als Region verwendet `,` und Euro). Auf Android
antwortet jede Locale für sich selbst.

Beide Signale ändern sich, wenn sich die Sprache, die Region, die Zeitzone oder die 24-Stunden-Einstellung
ändert; die Plattform wird nur beobachtet, solange eines beobachtet wird:

- iOS: `NSLocale.currentLocaleDidChangeNotification`, die auch die 24-Stunden-Einstellung
  sendet, und `NSSystemTimeZoneDidChange`.
- Android: eine Konfigurationsänderung (das Manifest behandelt `locale`, sodass die
  Activity nicht neu erzeugt wird) und die Broadcasts `TIMEZONE_CHANGED` und `TIME_SET`.
  Eine Änderung, die auf beiden Wegen eintrifft, feuert einmal.
