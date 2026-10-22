# Symbol

`Symbol` shows one of the platform's own symbols by name: an [SF Symbol](https://developer.apple.com/sf-symbols/) on iOS and a [Material Symbol](https://fonts.google.com/icons) on Android, the icons the platform's tab bars show.

Use it for:

- icons in buttons, rows and headers, matched to the platform;
- a state shown by an icon's color;
- icons with no image files to bundle.

```tsx
import { Symbol } from 'kuito';

export default function Rating() {
  return <Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" label="Favorite" />;
}
```

## Patterns

### Name a different symbol on each platform

Where the platforms name a symbol differently, give both.

```tsx
import { Symbol } from 'kuito';

export default function ShareIcon() {
  return <Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={22} />;
}
```

### Tint it by state

```tsx
import { Pressable, Symbol, signal } from 'kuito';

export default function Like() {
  const liked = signal(false);

  return (
    <Pressable label="Like" onPress={() => (liked.value = !liked.value)}>
      <Symbol
        name={{ ios: 'heart', android: 'favorite' }}
        tintColor={liked.value ? '#e5484d' : '#8a8a96'}
      />
    </Pressable>
  );
}
```

## Platform differences

The names are each platform's. A literal name a platform lacks is a compile error at its line, so `{ ios, android }` is how a symbol both platforms show differently is written ([symbols](../../../../docs/assets.md#symbols)). Android's symbols have one weight: `medium` and heavier draw it bolder.

## Accessibility

Tests find a Symbol by the `img` role. One that means something on its own needs `accessible`, `role="img"` and a `label` for a screen reader; inside a Pressable, label the Pressable instead.

## Related

- [Assets and symbols](../guides/assets.md)
- [Image](./image.md)
- [Tabs](./tabs.md), whose icons are symbols too
