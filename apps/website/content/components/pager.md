# Pager

`Pager` is a row of pages the user swipes through one at a time, each a `Page` as large as the pager. It is a horizontal `Scroll` that pages, made of primitives: no native module.

Use it for:

- an onboarding flow;
- a photo carousel;
- content the user swipes between, with a segmented control or dots above.

```tsx
import { Page, Pager, Text, VStack, signal } from 'kuito';

export default function Onboarding() {
  const page = signal(0);

  return (
    <VStack flex={1}>
      <Pager page={page} flex={1}>
        <Page justifyContent="center" alignItems="center">
          <Text>Welcome</Text>
        </Page>
        <Page justifyContent="center" alignItems="center">
          <Text>Sync your library</Text>
        </Page>
        <Page justifyContent="center" alignItems="center">
          <Text>You're all set</Text>
        </Page>
      </Pager>
      <Text textAlign="center">{`${page.value + 1} of 3`}</Text>
    </VStack>
  );
}
```

Given a signal as `page`, the pager writes it as the user pages, once the page settles, never midway.

## Patterns

### Page from a button

Setting `page` scrolls to that page, animated.

```tsx
import { Button, Page, Pager, Text, VStack, signal } from 'kuito';

export default function Steps() {
  const step = signal(0);

  return (
    <VStack flex={1}>
      <Pager page={step} flex={1}>
        <Page>
          <Text>Step one</Text>
        </Page>
        <Page>
          <Text>Step two</Text>
        </Page>
      </Pager>
      <Button onPress={() => (step.value = Math.min(1, step.value + 1))}>Next</Button>
    </VStack>
  );
}
```

### Hear the user's pages only

`onPageChange` reports the pages the user swiped to; the app's own `page` reports none.

```tsx
import { Image, Page, Pager } from 'kuito';

const photos = ['https://example.com/1.jpg', 'https://example.com/2.jpg'];

export default function Carousel(props: { seen: (index: number) => void }) {
  return (
    <Pager height={240} flexGrow={0} onPageChange={props.seen}>
      {photos.map((uri) => (
        <Page key={uri}>
          <Image src={uri} flex={1} />
        </Page>
      ))}
    </Pager>
  );
}
```

Like any Scroll it grows to fill its parent's height: give it a `height` and `flexGrow={0}` to keep it shorter.

## Platform differences

None: both platforms page the same scroll view, as a `Scroll` with `paging` does.

## Accessibility

Screen readers scroll it a page at a time with their own gestures and read the page on screen.

## Related

- [Scroll](./scroll.md)
- [SegmentedControl](./segmented-control.md)
- [Pager in depth](../../../../docs/pager.md)
