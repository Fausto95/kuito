# Themed layout

An inbox that follows the system: colors from the color scheme, rows that mirror for a right-to-left language, text that grows with the user's size, and words from catalogs in ICU MessageFormat.

**Use it for**

- A dark scheme that swaps tokens, with no colors written on the views.
- Padding and margins on the inline axis, so a row's start is the left in English and the right in Arabic.
- A count whose plural is the language's own, including Arabic's forms for two and three.

The whole screen is [demo/recipes/themed-layout.tsx](../../../../../demo/recipes/themed-layout.tsx), with its sheet in [demo/recipes/themed-layout.css](../../../../../demo/recipes/themed-layout.css).

## Tokens, logical sides, and catalogs

The sheet redefines `--surface` and `--ink` under `@media (prefers-color-scheme: dark)` and pads rows with `padding-inline`. `direction` on the column is the user's first language, or the other one while a switch previews it. `maxFontScale` caps the badge so a large text size cannot blow the pill apart. `localization.messages` picks the catalog for the user's language.

```tsx
import { Box, Text, VStack, localization, styles } from 'kuito';

const t = localization.messages({
  en: {
    unread:
      '{count, plural, =0 {No unread messages} one {# unread message} other {# unread messages}}',
  },
  ar: {
    unread:
      '{count, plural, zero {لا رسائل غير مقروءة} one {رسالة واحدة غير مقروءة} two {رسالتان غير مقروءتين} few {# رسائل غير مقروءة} many {# رسالة غير مقروءة} other {# رسالة غير مقروءة}}',
  },
});

const sheet = styles({
  badge: {
    minWidth: 24,
    paddingInline: '8px',
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
  },
});

export default function Unread() {
  return (
    <VStack direction={localization.locales.value[0]?.textDirection ?? 'ltr'}>
      <Text>{t('unread', { count: 3 })}</Text>
      <Box class={sheet.badge}>
        <Text color="#ffffff" fontSize={13} maxFontScale={1.3}>
          3
        </Text>
      </Box>
    </VStack>
  );
}
```

## Related

- [Styles](../../language/styles.md): `styles()` and CSS sheets
- [Localization and RTL](../localization-rtl.md#lay-out-right-to-left): direction
- [Localization and RTL](../localization-rtl.md#respect-the-users-text-size): `maxFontScale`
- [Localization and RTL](../localization-rtl.md#translate-the-apps-text): message catalogs
