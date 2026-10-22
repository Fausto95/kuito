# appearance

The user's light or dark mode and text size, as signals.

```tsx
import { Text, watch, appearance } from 'kuito';

appearance.colorScheme.value; // 'light' | 'dark' | null
appearance.fontScale.value; // 1 by default

// In a component, a read in JSX or a watch follows the platform.
<Text>{appearance.colorScheme.value === 'dark' ? 'Night' : 'Day'}</Text>;
watch(appearance.fontScale, (scale) => console.log(scale));
```

Both are read synchronously, and the platform is observed only while
something watches one of them. `colorScheme` is CSS's
`prefers-color-scheme`: `null` when the platform has no preference. The font
scale sits here, with the other display preference.

| Font scale | iOS                                                                                                                                    | Android                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Source     | The Dynamic Type size, mapped to React Native's multipliers (`large` 1, `extraLarge` 1.118, `accessibilityExtraExtraExtraLarge` 3.571) | `Configuration.fontScale` |
| Change     | Updates the signal                                                                                                                     | Updates the signal        |

Dark mode updates `colorScheme` on both. On Android the manifest handles `uiMode`
and `fontScale` (with rotation and window resizes), so the activity isn't
recreated and the app keeps its state. Android text sizes are fixed in
pixels when they're set, so on a font scale change the renderer sets every
text's size again: each ends up as large as it would be in an app started at
the new scale, including Android 14's smaller growth for large text.

## Text size

Text follows the user's size on both platforms: Android sizes text in sp,
and iOS scales every font with `UIFontMetrics` as it scales body text, for
`Text`, `Button` and `TextField` alike. A change of size renders and measures
every text again, so the app needs no code for it.

`maxFontScale` caps the growth of one `Text`, as a factor of its `fontSize`.
It is a prop of `Text` only, not a style: `Button` and `TextField` always
follow the user's size.

```tsx
import { Text, VStack, appearance } from 'kuito';

export function TabLabel() {
  return (
    <VStack>
      <Text fontSize={13} maxFontScale={1.5}>
        Tab title
      </Text>
      <Text maxFontScale={1}>12:45</Text>
      <Text>Text size: {appearance.fontScale.value}</Text>
    </VStack>
  );
}
```

At `1` the text never grows past its `fontSize`, for text with no room to
grow; use it sparingly, since the user chose the size to read. A value below 1
is an error. The cap only limits growth: a user who picks a smaller size
still gets smaller text. A `Text` with no `fontSize` caps the platform's
default size: 17 points on iOS, the theme's text size on Android.

| `maxFontScale` | iOS                                                                                                   | Android                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Growth it caps | UIFontMetrics' for body text, which grows less than `appearance.fontScale` at the accessibility sizes | The sp size at `Configuration.fontScale`, including Android 14's smaller growth for large text |
| Applied        | As the font's maximum point size                                                                      | On the text's pixels, again on every font scale change                                         |

`lineHeight` stays in points on both platforms: give large text room by
leaving it unset.

## Light or dark, forced

`appearance.colorScheme` reads the user's choice. To force one instead, set
`colorScheme` to `light` or `dark` in `kuito.config.ts` for the whole app
([apps](apps.md)), or on a single [alert](alert.md) or
[action sheet](action-sheet.md). Styles branch on the scheme with
`@media (prefers-color-scheme: dark)` ([styles](styles.md)).

## How it is wired

UIKit has no notification for a change of `traitCollection.userInterfaceStyle`, so the iOS
shell reports its scene's traits to `KuitoTraits`, shell state in
`native/ios/App/Shell`: on connection, from
`windowScene(_:didUpdate:interfaceOrientation:traitCollection:)`, and when
the scene becomes active. While the app is in the background, iOS flips the
style to snapshot both appearances; the shell doesn't report those, and
catches up on return. Android reads the configuration and listens with
`registerComponentCallbacks`.
