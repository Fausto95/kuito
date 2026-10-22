# Localization and RTL

`localization` gives the user's languages and region as signals and formats the app's text from catalogs, and the layout follows the first language's direction, right to left in Arabic or Hebrew.

**Use it for**

- Showing the app's text in the user's language, with plurals.
- Laying a screen out right to left without a second layout.
- Keeping text readable at the user's chosen text size.

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

In Arabic the row runs right to left: the symbol is on the right, padded by 16 points from the right edge, and the text reads in Arabic. In English it is the mirror image.

## Translate the app's text

`localization.messages(catalogs)` takes catalogs by language tag and returns `t(key, values)`, which formats the key in the catalog of the user's best language.

- The catalog is the first of the user's languages that one matches, by its tag or a shorter form: `pt-BR` takes `pt`. No match takes the first catalog.
- A key the chosen catalog lacks comes from its shorter forms, then from the first catalog. A key no catalog has throws.
- Messages are ICU MessageFormat's common part: `{name}`, `plural`, `selectordinal` and `select`, each with an `other` branch.
- `t` reads the user's languages at each call, so a component that calls it follows a change of language.

## Read the user's language and region

```tsx
import { Text, localization } from 'kuito';

export function Region() {
  const [locale] = localization.locales.value;
  const [calendar] = localization.calendars.value;

  return (
    <Text>{`${locale.languageTag} · ${locale.currencyCode ?? '—'} · ${calendar.timeZone}`}</Text>
  );
}
```

`locales` lists the user's languages, most preferred first, each with its `textDirection`, separators, currency and units. `calendars` gives the calendar, the time zone and the 24-hour setting. Both are signals that change with the system settings.

## Lay out right to left

The root lays out in the first language's `textDirection`, and every view without a `direction` of its own inherits it. A row (`HStack`) runs from the start side, and logical sides follow it:

| Prop                                     | CSS                                          |
| ---------------------------------------- | -------------------------------------------- |
| `paddingInlineStart`, `paddingInlineEnd` | `padding-inline-start`, `padding-inline-end` |
| `marginInlineStart`, `marginInlineEnd`   | `margin-inline-start`, `margin-inline-end`   |
| `insetInlineStart`, `insetInlineEnd`     | `inset-inline-start`, `inset-inline-end`     |

A logical side wins over the physical side it lands on. Set `direction="ltr"` on the app's outer view to keep an untranslated app left to right, or on any subtree that must not mirror, such as a phone number.

What does not mirror:

- `textAlign` takes `left`, `center` or `right`; CSS's `start` and `end` compile to `left` and `right`.
- Borders have no logical sides.
- Native views keep their own direction: a horizontal Scroll or List still starts at its left end, and controls, text fields and the tab bar do not mirror.
- A navigation stack follows the direction: in right to left, screens come in from the left.

## Respect the user's text size

Text, buttons and text fields follow the user's text size: Dynamic Type on iOS, the font scale on Android. A change of size measures every text again, with no code. `maxFontScale` on a `Text` caps how far it grows, as a factor of `fontSize`, for text with no room to grow:

```tsx
import { Text } from 'kuito';

export function Clock() {
  return (
    <Text fontSize={13} maxFontScale={1.5}>
      12:45
    </Text>
  );
}
```

Use it sparingly, since the user chose the size to read. `lineHeight` stays in points: leave it unset on large text. `appearance.fontScale` is the user's scale as a signal.

## Test right to left

The headless host lays out in the first language's direction, as a device does. Fake it in a test:

```tsx
import { HStack, Text } from 'kuito';
import { assert, render, test } from 'kuito/tests';

test('the row starts on the right in Arabic', async () => {
  const app = await render(
    <HStack paddingInlineStart={16}>
      <Text>مرحبا</Text>
    </HStack>,
    { modules: { Localization: { locales: [{ languageTag: 'ar', textDirection: 'rtl' }] } } },
  );

  // A tree() line is a view: its kind, its parent, its x,y and its width x height.
  const text =
    app
      .tree()
      .split('\n')
      .find((line) => line.includes('مرحبا')) ?? '';
  const [, x, width] = /([\d.]+),[\d.]+ ([\d.]+)x/.exec(text) ?? [];

  assert.equal(Math.round(Number(x) + Number(width)), 402 - 16); // the default screen is 402 wide
});
```

## Related

- [Styles](../language/styles.md#lay-out-for-right-to-left-languages): logical properties in CSS
- [Primitives](./primitives.md#respect-the-users-text-size): `maxFontScale`
- [Testing](./testing.md#fake-native-modules-and-the-network): fakes
- [localization](../../../../docs/localization.md): every field, the message syntax, how changes are observed
