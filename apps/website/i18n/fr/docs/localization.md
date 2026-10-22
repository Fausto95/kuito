# localization

Les langues, la région, le fuseau horaire et l'horloge de l'utilisateur, sous forme de signaux : lus
de manière synchrone, et suivis tant que quelque chose les observe.

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

`locales` liste les langues de l'utilisateur, la plus préférée en premier :

| Champ                    | Valeur                                       |
| ------------------------ | -------------------------------------------- |
| `languageTag`            | BCP 47, comme `pt-PT` ou `zh-Hant-TW`        |
| `languageCode`           | Comme `pt`                                   |
| `languageScriptCode`     | Comme `Hant`, ou `null`                      |
| `regionCode`             | Comme `PT`, ou `null`                        |
| `textDirection`          | `ltr` ou `rtl`                               |
| `decimalSeparator`       | Comme `,`                                    |
| `digitGroupingSeparator` | Comme une espace ou `.`                      |
| `measurementSystem`      | `metric`, `us` ou `uk`                       |
| `currencyCode`           | ISO 4217, comme `EUR`, ou `null` sans région |
| `currencySymbol`         | Comme `€`                                    |
| `temperatureUnit`        | `celsius` ou `fahrenheit`                    |

`calendars` a une seule entrée : `calendar` (le nom CLDR, comme `gregory` ou
`japanese`), `timeZone` (IANA), `uses24hourClock`, et `firstWeekday` (1 est
dimanche).

Sur iOS, les séparateurs, le système de mesure, la devise et l'unité de température
suivent les réglages de région de l'utilisateur, qui peuvent différer de la région propre
à une langue (l'anglais avec le Portugal comme région utilise `,` et l'euro). Sur Android,
chaque locale répond pour elle-même.

Les deux signaux changent quand la langue, la région, le fuseau horaire ou le réglage 24 heures
change ; la plateforme n'observe que tant que l'un d'eux est suivi :

- iOS : `NSLocale.currentLocaleDidChangeNotification`, que le réglage 24 heures
  publie aussi, et `NSSystemTimeZoneDidChange`.
- Android : un changement de configuration (le manifeste gère `locale`, si bien que
  l'activité n'est pas recréée) et les broadcasts `TIMEZONE_CHANGED` et `TIME_SET`.
  Un changement qui arrive par les deux voies ne se déclenche qu'une fois.
