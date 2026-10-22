# Drive a sheet header from scrolling

Connect a scroll offset to visual properties when a header should move more slowly than the content. Motion bindings keep the effect synchronized with native scrolling.

## Interpolate the offset

```tsx
import {
  Blur,
  Box,
  Scroll,
  Sheet,
  Text,
  interpolate,
  scrollMotion,
  sheetMotion,
  signal,
} from 'kuito';

const HEADER = 240;

export default function Episodes() {
  const open = signal(true);
  const sheet = sheetMotion();
  const body = scrollMotion();
  const barShown = interpolate(body.offset, [HEADER - 120, HEADER - 60], [0, 1]);

  return (
    <Sheet open={open} snapPoints={['50%', '100%']} motion={sheet} backgroundColor="#ffffff">
      <Scroll motion={body} flex={1}>
        <Box
          height={HEADER}
          backgroundColor="#2b2d42"
          translateY={interpolate(body.offset, [0, HEADER], [0, HEADER / 2])}
        />
        <Blur opacity={barShown}>
          <Text>Episodes</Text>
        </Blur>
      </Scroll>
    </Sheet>
  );
}
```

The header translates half as far as the scroll offset over its first 240 points. The blur fades in over the specified 60-point interval. Here the blur is part of the scrolling content; put it in an overlay outside `Scroll` if the design calls for a fixed toolbar. Add enough body content for the scroll container to scroll.

Set `open.value = false` to dismiss. Use `sheetMotion` when other views need to follow the sheet's position. See [Sheet](sheet.md), [Scroll](scroll.md) and [Blur](blur.md).
