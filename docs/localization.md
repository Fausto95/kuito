# Translate messages and respect locale

Use localization for the user’s language order, calendars and clock preferences. Use message catalogs for UI strings and Intl for numbers and dates.

## Read language and calendar preferences

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

## Translate a count with ICU messages

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

## Behavior and limits

`locales` and `calendars` are signals; reactive reads follow setting changes. `messages(catalogs)` chooses the best matching language and uses the first catalog as fallback for missing keys. Keep placeholders named and pass values separately. Layout direction follows the user language; use logical padding and margins so screens mirror correctly.

## Continue

Read [Localization rtl](localization-rtl.md) for the related workflow. The API reference lists every method, option, event and return type.
