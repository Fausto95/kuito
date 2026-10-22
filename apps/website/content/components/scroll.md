# Scroll

`Scroll` scrolls its content, vertically or, with `horizontal`, sideways: a `UIScrollView` on iOS, a scroll view on Android. Padding and gap apply to the content.

Use it for:

- a screen taller than the display: a settings page, an article;
- a horizontal shelf of cards;
- a form whose focused field stays clear of the keyboard.

```tsx
import { Scroll, Text } from 'kuito';

const paragraphs = ['The tide came in.', 'It went out again.', 'Nobody noticed.'];

export default function Article() {
  return (
    <Scroll flex={1} padding={16} gap={12}>
      {paragraphs.map((text) => (
        <Text key={text}>{text}</Text>
      ))}
    </Scroll>
  );
}
```

Scroll work is opt-in: the native view sends scroll events only while `onScroll` is set, and installs pull-to-refresh only while `onRefresh` is. A long list of items belongs in a [List](./list.md), which renders only the rows near the screen.

## Patterns

### Pull to refresh

`onRefresh` turns pull-to-refresh on; `refreshing` shows the spinner until the work is done.

```tsx
import { Scroll, Text, task } from 'kuito';

export default function Inbox(props: { reload: () => Promise<void> }) {
  const reload = task(() => props.reload());

  return (
    <Scroll flex={1} refreshing={reload.running.value} onRefresh={() => void reload.run()}>
      <Text padding={16}>Pull down to check for mail</Text>
    </Scroll>
  );
}
```

### Scroll to the end from code

A Scroll's ref holds a `ScrollHandle` with `scrollTo` and `scrollToEnd`. A request lands once the layout has sized what the same update added, so appending a message and calling `scrollToEnd` shows the new message.

```tsx
import { Button, Scroll, Text, VStack, ref, store, type ScrollHandle } from 'kuito';

export default function Chat() {
  const thread = ref<ScrollHandle>();
  const chat = store({ messages: ['Hi'] });

  return (
    <VStack flex={1}>
      <Scroll ref={thread} flex={1} padding={16} gap={8}>
        {chat.messages.map((text, index) => (
          <Text key={index}>{text}</Text>
        ))}
      </Scroll>
      <Button
        onPress={() => {
          chat.messages.push('Another one');
          thread.current?.scrollToEnd();
        }}
      >
        Send
      </Button>
    </VStack>
  );
}
```

### Snap a shelf to its cards

`snapOffsets` lists where a drag may come to rest, in points; `paging` rests a whole view length at a time instead.

```tsx
import { Box, Scroll } from 'kuito';

const cards = [0, 1, 2, 3, 4];

export default function Shelf() {
  return (
    <Scroll
      horizontal
      height={180}
      gap={12}
      padding={16}
      snapOffsets={cards.map((index) => index * 152)}
    >
      {cards.map((index) => (
        <Box key={index} width={140} height={148} borderRadius={12} backgroundColor="#e5e7eb" />
      ))}
    </Scroll>
  );
}
```

### Fade a header as the content scrolls

`scrollMotion()` gives the view's `offset` to props on the UI thread, every frame, with no handler ([motion](../guides/motion.md)).

```tsx
import { Box, Scroll, interpolate, scrollMotion } from 'kuito';

export default function Feed() {
  const feed = scrollMotion();

  return (
    <Scroll motion={feed} flex={1}>
      <Box
        height={200}
        backgroundColor="#1e293b"
        opacity={interpolate(feed.offset, [0, 120], [1, 0])}
      />
    </Scroll>
  );
}
```

## Platform differences

Android's scroll views neither page nor snap, and report only that they move: Kuito settles them at the same offsets when a fling or a drag ends, and sends `onScrollEnd` once the view has been still for two frames. Pull-to-refresh is vertical only on both.

## Accessibility

Screen readers scroll it with their own gestures (three fingers on iOS, two on Android) and read its children in order.

## Related

- [List](./list.md), for long lists
- [Pager](./pager.md), a Scroll that pages
- [Keyboard](../guides/keyboard.md)
- [Scroll in depth](../../../../docs/primitives.md#scroll)
