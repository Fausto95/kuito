# Text

`Text` shows a string. Its children are text only (strings, numbers or signals of them), never elements, and it wraps over as many lines as it needs.

Use it for:

- titles, labels and paragraphs;
- a value that changes, read from a signal;
- a title that must fit on one or two lines.

```tsx
import { Text, signal } from 'kuito';

export default function Title() {
  const plays = signal(12);

  return (
    <Text fontSize={17} fontWeight={600} lineClamp={2}>
      {`Played ${plays.value} times`}
    </Text>
  );
}
```

## Patterns

### Cut a long title to one line

`lineClamp` cuts the text to that many lines; 0, the default, is no limit.

```tsx
import { Text } from 'kuito';

export default function Episode() {
  return <Text lineClamp={1}>Episode 12: The very long story of how the tide came back in</Text>;
}
```

### Cap how far the user's text size grows it

Text follows the user's text size: Dynamic Type on iOS, the font scale on Android. `maxFontScale` caps the growth, as a factor of `fontSize`, for text in a fixed space such as a tab label. A smaller user size still shrinks it ([text size](../../../../docs/appearance.md)).

```tsx
import { Text } from 'kuito';

export default function Badge() {
  return (
    <Text fontSize={12} maxFontScale={1.3}>
      LIVE
    </Text>
  );
}
```

### Mark a heading

`role="heading"` lets a screen reader jump between headings.

```tsx
import { Text } from 'kuito';

export default function SectionTitle() {
  return (
    <Text role="heading" fontSize={22} fontWeight="bold">
      Recently played
    </Text>
  );
}
```

### Style text from a stylesheet

```tsx
import { Text } from 'kuito';
import css from './type.module.css';

export default function Caption() {
  return <Text class={css.caption}>Recorded live in 2019</Text>;
}
```

## Platform differences

None in what Text takes. Each platform draws it with its own text engine and fonts, so line breaks can differ by a word. A `fontFamily` must be bundled for both ([fonts](../guides/fonts.md)).

## Accessibility

A screen reader reads its text. It follows the user's text size unless `maxFontScale` caps it: cap it only where the layout cannot grow.

## Related

- [Fonts](../guides/fonts.md)
- [Styles](../language/styles.md)
- [Button](./button.md), the platform's button with a text title
