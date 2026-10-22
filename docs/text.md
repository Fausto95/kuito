# Text

Display text with native font rendering. Use it for labels, paragraphs and reactive values.

## Limit a label to two lines

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

## Behavior

`lineClamp` limits displayed lines. Text follows the system font scale unless configured otherwise. Set `fontFamily` to use a bundled or loaded font. Read reactive values inside JSX so the label updates.

## Continue

Read [Fonts](fonts.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Text#members) for types and documented defaults.
