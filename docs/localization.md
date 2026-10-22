# localization

The user's languages, region, time zone and clock, as signals: read
synchronously, and followed while something watches them.

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

`locales` lists the user's languages, most preferred first:

| Field                    | Is                                             |
| ------------------------ | ---------------------------------------------- |
| `languageTag`            | BCP 47, as `pt-PT` or `zh-Hant-TW`             |
| `languageCode`           | As `pt`                                        |
| `languageScriptCode`     | As `Hant`, or `null`                           |
| `regionCode`             | As `PT`, or `null`                             |
| `textDirection`          | `ltr` or `rtl`                                 |
| `decimalSeparator`       | As `,`                                         |
| `digitGroupingSeparator` | As a space or `.`                              |
| `measurementSystem`      | `metric`, `us` or `uk`                         |
| `currencyCode`           | ISO 4217, as `EUR`, or `null` without a region |
| `currencySymbol`         | As `€`                                         |
| `temperatureUnit`        | `celsius` or `fahrenheit`                      |

The first language's `textDirection` is the app's: the root lays out in it,
and every view without a `direction` of its own inherits it
([styles](styles.md#right-to-left)).

`calendars` has one entry: `calendar` (CLDR's name, as `gregory` or
`japanese`), `timeZone` (IANA), `uses24hourClock`, and `firstWeekday` (1 is
Sunday).

On iOS the separators, measurement system, currency and temperature unit
follow the user's region settings, which can differ from a language's own
region (English with Portugal as the region uses `,` and euros). On Android
each locale answers for itself.

Both signals change when the language, region, time zone or 24-hour setting
changes; the platform observes only while one is watched:

- iOS: `NSLocale.currentLocaleDidChangeNotification`, which the 24-hour
  setting also posts, and `NSSystemTimeZoneDidChange`.
- Android: a configuration change (the manifest handles `locale`, so the
  activity isn't recreated) and the `TIMEZONE_CHANGED` and `TIME_SET`
  broadcasts. A change that arrives both ways fires once.

## Messages

`localization.messages` holds an app's text in catalogs by language tag and
formats a key in the catalog of the user's best language:

```tsx
import { Text, localization } from 'kuito';

const t = localization.messages({
  en: {
    greeting: 'Hello, {name}!',
    inbox: '{count, plural, =0 {No messages} one {# message} other {# messages}}',
  },
  pt: {
    greeting: 'Olá, {name}!',
    inbox: '{count, plural, =0 {Sem mensagens} one {# mensagem} other {# mensagens}}',
  },
  'pt-PT': { greeting: 'Olá, {name}.' },
});

<Text>{t('inbox', { count: 3 })}</Text>; // '3 messages', or '3 mensagens' in Portuguese
```

- The catalog is the first of the user's languages (`locales`, in order) that
  one matches by its tag or a shorter form: `pt-BR` takes `pt`, `pt-PT` its
  own, `zh-Hant-TW` takes `zh-Hant`. No match takes the first catalog.
- The message formats for the user's own language, not the catalog's tag:
  an `en` catalog writes dates as `en-GB` does for a British user, and a
  `pt` catalog takes `pt-PT`'s plural rules in Portugal.
- A key the chosen catalog lacks comes from its shorter forms (`pt-PT`, then
  `pt`), then from the first catalog, formatted in that catalog's language.
  A key no catalog has throws.
- `t` reads `locales` at each call, so a component that calls it follows a
  change of language.

Messages are ICU MessageFormat's, the part apps reach for:

| Syntax                                                          | Gives                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `{name}`                                                        | The value: a string as is, a number or `Date` formatted for the language  |
| `{n, plural, =0 {…} one {…} other {…}}`                         | The branch for `n`: an exact `=n` first, then its category; `#` is `n`    |
| `{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` | The same, by ordinal category                                             |
| `{key, select, a {…} other {…}}`                                | The branch named by the value, else `other`                               |
| `''`, `'{…}'`                                                   | An apostrophe; an apostrophe before `{`, `}` or `#` quotes up to the next |

Every `plural`, `selectordinal` and `select` needs an `other` branch, and
no selector twice. `#` is the number only directly in a plural's branch: in
a `select` nested inside, it is text, as ICU reads it.
Categories come from `Intl.PluralRules` ([web APIs](web-apis.md#intl)). A
malformed message throws a `SyntaxError`, and a missing value a `TypeError`,
at the call that formats it. There are no `number`, `date` or `time`
argument types, and no plural `offset`: format such values yourself and pass
the string.
