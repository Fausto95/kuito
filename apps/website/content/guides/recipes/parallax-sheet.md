# Parallax sheet

A sheet of episodes whose header scrolls at half the speed of the list, and a bar that fades in once that header has gone.

**Use it for**

- A `Sheet` opened by a signal, with snap points, closed by setting the signal back.
- A `Scroll` whose `scrollMotion` drives a header's `translateY` and a bar's opacity.
- A `Blur` behind the bar, so the episodes show through it.

The whole screen is [demo/recipes/parallax-sheet.tsx](../../../../../demo/recipes/parallax-sheet.tsx).

## Tie the header to the scroll

`body.offset` grows as the episodes scroll up. The header moves at half that rate, so it lags behind. The bar's opacity goes from 0 to 1 across the last 60 points of the header.

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

Done sets `open` to false. `sheetMotion` is there for anything that should follow the sheet's own position.

## Related

- [Motion](../motion.md#follow-a-sheet-or-the-keyboard): `sheetMotion`
- [Motion](../motion.md#follow-a-scroll): a scroll's offset
