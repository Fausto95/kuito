# Pressable

`Pressable` is a container, laid out like a VStack, that responds to touches. Its feedback (opacity, scale, haptics) runs natively on touch-down, without waiting for JavaScript.

Use it for:

- a row or a card the user taps to open;
- a button of your own design;
- a long press that shows more actions.

```tsx
import { Pressable, Text } from 'kuito';

export default function Open() {
  return (
    <Pressable
      onPress={() => console.log('open')}
      pressedOpacity={0.7}
      pressedScale={0.97}
      haptic="light"
      padding={16}
    >
      <Text>Open</Text>
    </Pressable>
  );
}
```

## Patterns

### Make a whole row tappable

The innermost Pressable handles a press: a press on a nested Pressable does not also press its parent.

```tsx
import { HStack, Image, Pressable, Spacer, Symbol, Text } from 'kuito';

export default function TrackRow(props: { title: string; cover: string; onOpen: () => void }) {
  return (
    <Pressable onPress={props.onOpen} pressedOpacity={0.6}>
      <HStack gap={12} padding={12} alignItems="center">
        <Image src={props.cover} width={44} height={44} borderRadius={4} />
        <Text>{props.title}</Text>
        <Spacer />
        <Symbol name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} />
      </HStack>
    </Pressable>
  );
}
```

### Show actions on a long press

`onLongPress` fires after `longPressDuration` milliseconds (500 by default), and the press that follows does not fire `onPress`.

```tsx
import { Pressable, Text, actionSheet } from 'kuito';

export default function Episode() {
  return (
    <Pressable
      onPress={() => console.log('play')}
      onLongPress={() =>
        void actionSheet({
          buttons: [
            { text: 'Share' },
            { text: 'Delete', style: 'destructive' },
            { text: 'Cancel', style: 'cancel' },
          ],
        })
      }
    >
      <Text padding={16}>Episode 4</Text>
    </Pressable>
  );
}
```

### Enlarge a small target

`hitArea` adds touchable margin, in points, without changing the layout.

```tsx
import { Pressable, Symbol } from 'kuito';

export default function Close(props: { onClose: () => void }) {
  return (
    <Pressable label="Close" hitArea={12} onPress={props.onClose}>
      <Symbol name={{ ios: 'xmark', android: 'close' }} size={16} />
    </Pressable>
  );
}
```

## Platform differences

Android extends the hit area through the parent's `TouchDelegate`, which holds one view: only one `hitArea` Pressable per parent takes effect there.

## Accessibility

A Pressable is one element to a screen reader, read as its children's text unless it has a `label`. One with neither (an icon alone) is a build error naming its line. Add `role="button"` when it acts as one ([accessibility](../guides/accessibility.md)).

## Related

- [Button](./button.md), the platform's own
- [Link](./link.md), a Pressable that navigates
- [ContextMenu](./context-menu.md), the platform's long-press menu
- [Pressable in depth](../../../../docs/primitives.md#pressable)
