# localization

As línguas, a região, o fuso horário e o relógio do utilizador, como sinais: lidos
de forma síncrona, e seguidos enquanto algo os observa.

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

`locales` lista as línguas do utilizador, a mais preferida primeiro:

| Campo                    | É                                          |
| ------------------------ | ------------------------------------------ |
| `languageTag`            | BCP 47, como `pt-PT` ou `zh-Hant-TW`       |
| `languageCode`           | Como `pt`                                  |
| `languageScriptCode`     | Como `Hant`, ou `null`                     |
| `regionCode`             | Como `PT`, ou `null`                       |
| `textDirection`          | `ltr` ou `rtl`                             |
| `decimalSeparator`       | Como `,`                                   |
| `digitGroupingSeparator` | Como um espaço ou `.`                      |
| `measurementSystem`      | `metric`, `us` ou `uk`                     |
| `currencyCode`           | ISO 4217, como `EUR`, ou `null` sem região |
| `currencySymbol`         | Como `€`                                   |
| `temperatureUnit`        | `celsius` ou `fahrenheit`                  |

`calendars` tem uma entrada: `calendar` (o nome do CLDR, como `gregory` ou
`japanese`), `timeZone` (IANA), `uses24hourClock`, e `firstWeekday` (1 é
domingo).

No iOS os separadores, o sistema de medidas, a moeda e a unidade de temperatura
seguem as definições de região do utilizador, que podem diferir da região própria de uma
língua (inglês com Portugal como região usa `,` e euros). No Android
cada locale responde por si.

Ambos os sinais mudam quando a língua, a região, o fuso horário ou a definição de 24 horas
muda; a plataforma só observa enquanto um deles é observado:

- iOS: `NSLocale.currentLocaleDidChangeNotification`, que a definição de 24 horas
  também publica, e `NSSystemTimeZoneDidChange`.
- Android: uma mudança de configuração (o manifesto trata `locale`, pelo que a
  atividade não é recriada) e os broadcasts `TIMEZONE_CHANGED` e `TIME_SET`.
  Uma mudança que chega pelas duas vias dispara uma vez.
