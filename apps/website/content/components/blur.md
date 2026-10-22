# Blur

`Blur` shows what is behind it, blurred and tinted, under its children: a `UIVisualEffectView` on iOS; on Android the view blurs its backdrop itself, from Android 12.

Use it for:

- a frosted bar over scrolling content;
- a sheet's or a player's header;
- a caption over a photo.

```tsx
import { Blur, Image, Text, VStack } from 'kuito';

export default function NowPlaying() {
  return (
    <VStack flex={1}>
      <Image
        src="https://example.com/cover.jpg"
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
      />
      <Blur material="thin" position="absolute" bottom={0} left={0} right={0} padding={16}>
        <Text>Now playing</Text>
      </Blur>
    </VStack>
  );
}
```

It lays its children out as a Box does, above the blur, and is as large as they are unless its style sizes it.

## Patterns

### Pick a material

`material` is one of Apple's system materials, from the most see-through to the one bars are made of: `ultraThin`, `thin`, `regular` (the default), `thick` and `chrome`. Each follows the color scheme.

```tsx
import { Blur, Text } from 'kuito';

export default function Toolbar() {
  return (
    <Blur material="chrome" height={56} padding={16}>
      <Text fontWeight="bold">Library</Text>
    </Blur>
  );
}
```

### Float a bar over a scroll

```tsx
import { Blur, Scroll, Text, VStack } from 'kuito';

const rows = Array.from({ length: 40 }, (_, index) => `Row ${index + 1}`);

export default function Feed() {
  return (
    <VStack flex={1}>
      <Scroll flex={1} padding={16} paddingTop={104} gap={12}>
        {rows.map((row) => (
          <Text key={row}>{row}</Text>
        ))}
      </Scroll>
      <Blur material="regular" position="absolute" top={0} left={0} right={0} height={88} />
    </VStack>
  );
}
```

## Platform differences

|          | iOS              | Android 12 and later                                   | Android before 12                      |
| -------- | ---------------- | ------------------------------------------------------ | -------------------------------------- |
| Backdrop | UIKit's material | The views behind it, blurred, then the material's tint | The material's tint alone, near opaque |

On Android the backdrop is the views an ancestor draws before the Blur's branch. A clip, an elevation shadow, the Blur's ancestors' scale or rotation, and a video or camera preview behind it are not in the blur. There is no blur radius: UIKit gives none.

## Accessibility

A screen reader reads its children; the blur itself has nothing to read. Keep text on a Blur legible in both color schemes: the material follows the scheme, the text color must too.

## Related

- [Sheet](./sheet.md)
- [Appearance](../../../../docs/appearance.md)
- [Blur in depth](../../../../docs/blur.md)
