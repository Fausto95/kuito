# Translate a screen and support RTL

Use message catalogs for visible text and logical layout properties for spacing. This lets the same screen follow both the user's language and its reading direction.

## Translate text with plurals

```tsx
import { HStack, Symbol, Text, localization } from 'kuito';

const t = localization.messages({
  en: { inbox: '{count, plural, =0 {No messages} one {# message} other {# messages}}' },
  ar: { inbox: '{count, plural, zero {لا رسائل} one {رسالة واحدة} other {# رسائل}}' },
});

export function Inbox() {
  return (
    <HStack paddingInlineStart={16} paddingInlineEnd={8} gap={8} alignItems="center">
      <Symbol name={{ ios: 'tray', android: 'inbox' }} />
      <Text>{t('inbox', { count: 3 })}</Text>
    </HStack>
  );
}
```

`localization.messages` selects the best match from the user's language preferences, trying shorter language tags before the first catalog. Missing keys fall back through shorter tags and then the first catalog. If no catalog contains a key, formatting throws. Provide an `other` branch for plural and select messages.

The function reads locale signals when called, so translated bindings update after a language change. Supported message forms include interpolation, `plural`, `selectordinal` and `select`.

## Use logical sides

`paddingInlineStart` and `paddingInlineEnd` follow the inherited direction. In the example, start padding moves to the right for Arabic. The equivalent CSS properties are `padding-inline-start` and `padding-inline-end`; logical margin and inset properties work the same way.

Set `direction="ltr"` on a subtree that must retain its direction, such as a phone number. Avoid assuming every native control mirrors: horizontal scrolling, native controls and tab bars keep their own behavior. Text alignment accepts physical `left` and `right`, and borders have no logical-side props. Navigation stacks reverse their presentation direction in RTL.

## Read regional preferences

```tsx
import { Text, localization } from 'kuito';

export function Region() {
  return (
    <Text>
      {localization.locales.value[0]?.languageTag ?? 'Unknown locale'} ·{' '}
      {localization.calendars.value[0]?.timeZone ?? 'Local time'}
    </Text>
  );
}
```

Use locale metadata for currency, separators and measurement units, and calendar metadata for time zone and clock preferences. Both are reactive. Keep layouts flexible for translated text and larger system font sizes; only cap `maxFontScale` where the design has a deliberate space constraint.

See [localization](localization.md) for the API and [accessibility](accessibility.md) for text sizing and screen readers.
