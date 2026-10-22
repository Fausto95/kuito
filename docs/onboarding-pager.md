# Animate a swipeable onboarding flow

Bind a `Pager` to a page signal for discrete navigation, and use `scrollMotion` for visuals that follow the finger between pages.

## Move artwork during a swipe

```tsx
import { Box, Page, Pager, SafeArea, Text, interpolate, scrollMotion, signal, window } from 'kuito';

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
          <Page key={title} alignItems="center" justifyContent="center">
            <Text>{title}</Text>
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

The input ranges are page offsets in points. At the current page's resting offset, its circle is centered; approaching neighboring pages shifts it horizontally. The sample measures width at setup, so recreate or adapt the ranges if your onboarding must support window resizing or rotation while mounted.

A Skip action can assign the last index to `page.value`. Use a pager ref's `scrollTo({ page })` for imperative navigation. See [Pager](pager.md), [Page](page.md) and [motion](motion.md).
