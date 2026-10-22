# Onboarding pager

Three pages the reader swipes through, with the circle and the title fading as the page moves, and Skip jumping to the last one.

**Use it for**

- A `Pager` whose `page` signal is the page on screen, updated when a swipe settles.
- `scrollTo({ page })` from a button.
- A circle that slides with the finger, from `scrollMotion` and `interpolate`.

The whole screen is [demo/recipes/onboarding-pager.tsx](../../../../../demo/recipes/onboarding-pager.tsx).

## Move with the swipe

`pager.offset` is the scroll offset in points. Each page is as wide as the window, so the inputs of `interpolate` are the resting offsets of the page before, this page, and the page after.

```tsx
import { Box, Page, Pager, SafeArea, interpolate, scrollMotion, signal, window } from 'kuito';

const PAGES = ['Welcome', 'Sync your library', 'You’re all set'];

export default function Onboarding() {
  const page = signal(0);
  const pager = scrollMotion();
  const width = window.size.value.width;
  const around = (index: number) => [(index - 1) * width, index * width, (index + 1) * width];

  return (
    <SafeArea flex={1}>
      <Pager page={page} motion={pager} flex={1}>
        {PAGES.map((title, index) => (
          <Page alignItems="center" justifyContent="center">
            <Box
              width={200}
              height={200}
              borderRadius={100}
              backgroundColor="#ffd6a5"
              translateX={interpolate(pager.offset, around(index), [-width / 2, 0, width / 2])}
            />
          </Page>
        ))}
      </Pager>
    </SafeArea>
  );
}
```

Skip sets `page.value` to the last index. Next calls the pager ref's `scrollTo({ page })`. Binding `page` on `Pager` is what moves the dots when a swipe settles.

## Related

- [Motion](../motion.md#follow-a-scroll): `scrollMotion` and `interpolate`
- [Primitives](../primitives.md): `Pager` and `Page`
