# Pager

A row of pages the user swipes through one at a time, as
UIPageViewController and Android's ViewPager page: a `HorizontalScroll`
with `paging`, whose pages are each as large as the pager. It suits an
onboarding flow, a photo carousel, or tabs of content the user swipes
between.

```tsx
import { Page, Pager, signal, Text, VStack } from 'kuito';

function Onboarding() {
  const page = signal(0);

  return (
    <VStack flex={1}>
      <Pager page={page} flex={1}>
        <Page>
          <Text>Welcome</Text>
        </Page>
        <Page>
          <Text>Sync your library</Text>
        </Page>
        <Page>
          <Text>You're all set</Text>
        </Page>
      </Pager>
      <Text>{`${page.value + 1} of 3`}</Text>
    </VStack>
  );
}
```

`Pager` and `Page` are components of Kuito's own, made of primitives: no
native module, and an app that doesn't import them ships none of their code.

## Props

| Prop           | Default | Notes                                                         |
| -------------- | ------- | ------------------------------------------------------------- |
| `page`         | `0`     | The page shown, from 0; a signal is written as the user pages |
| `onPageChange` | none    | `(page) => …`: the page the user paged to                     |
| `children`     | none    | Its pages, each a `Page`                                      |

It takes a `Scroll`'s other props too (style, layout, `onScroll`,
`motion`, accessibility), except the ones a pager sets itself: `horizontal`,
`paging`, `snapOffsets`, `ref` and `onScrollEnd`. Like any Scroll it grows
to fill its parent's height; give it a `height` and `flexGrow={0}` to keep
it shorter.

A `Page` is a `Box` 100% as wide and tall as the pager, and takes a Box's
props. A percentage along a scroll view's axis resolves against the view,
as CSS resolves it in a scroll container, so any child given
`width="100%"` pages the same way.

## How it pages

The scroll view knows its width, the pager doesn't. Setting `page` asks
the view to scroll to that page, a whole view length each
(`scrollTo({ page })` on a [Scroll's handle](primitives.md#scrolling-from-code)),
animated, or at once on the first render. The pager learns which page the
user chose from where the view comes to rest (`onScrollEnd`), so a swipe
reports once, when the page settles, never midway. `onPageChange` reports
the user's pages only: the app's own `page` reports none.

A page past the last stops at the last.

## Tests

On the [headless host](testing.md), `scroll(view, { x })` drags the pager
`view` is in to `x` and lets go: it rests on the nearest page, as `paging`
does, and the pager reports it.

```tsx
import { Page, Pager, Text, VStack, signal } from 'kuito';
import { assert, render, screen, scroll, test } from 'kuito/tests';

function Onboarding() {
  const page = signal(0);

  return (
    <VStack flex={1}>
      <Pager page={page} height={300}>
        <Page>
          <Text>Welcome</Text>
        </Page>
        <Page>
          <Text>Sync your library</Text>
        </Page>
        <Page>
          <Text>You're all set</Text>
        </Page>
      </Pager>
      <Text>{`Page: ${page.value}`}</Text>
    </VStack>
  );
}

test('a swipe to the third page reports it', async () => {
  await render(<Onboarding />);

  const width = screen.getByText('Welcome').parent?.frame.width ?? 0;

  await scroll(screen.getByText('Welcome'), { x: 2 * width });

  assert.ok(screen.getByText('Page: 2'));
});
```
