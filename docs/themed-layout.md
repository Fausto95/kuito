# Build a localized badge

Combine message catalogs, logical spacing and flexible layout for a badge that works in multiple languages. This example formats an unread count in English or Arabic and follows the locale's text direction.

## Translate and lay out the count

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

Logical padding follows direction; physical left/right values do not. The count is repeated in text so its meaning is not conveyed by color alone. The badge caps its own font growth, while the descriptive text remains free to scale.

For a complete light/dark screen, define surface and text tokens in CSS and override them under `@media (prefers-color-scheme: dark)`. See [styles](styles.md), [RTL layout](localization-rtl.md) and [accessibility](accessibility.md).
