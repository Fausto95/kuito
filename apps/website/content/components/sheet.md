# Sheet

`Sheet` is a native bottom sheet presenting its children above the screen: `UISheetPresentationController` on iOS, Material's `BottomSheetDialog` on Android. The platform's gestures, back and backdrop dismissal come with it.

Use it for:

- a queue, a menu or details that slide up over the screen;
- a short form that keeps the screen behind it in view;
- a panel the user drags between a peek and full height.

```tsx
import { Button, Sheet, Text, VStack, signal } from 'kuito';

export default function Player() {
  const queueOpen = signal(false);

  return (
    <VStack flex={1} padding={16}>
      <Button onPress={() => (queueOpen.value = true)}>Up next</Button>
      <Sheet open={queueOpen.value} onClose={() => (queueOpen.value = false)} padding={24}>
        <Text>Up next</Text>
      </Sheet>
    </VStack>
  );
}
```

`open` is controlled: it shows the sheet, and only it does. When the user dismisses the sheet, `onClose` fires; set `open` back to false there.

## Patterns

### Rest at several heights

`snapPoints` takes points, a percentage of the height below the status bar, or `'content'` to fit the children, smallest first. `onSnap` reports where it settled.

```tsx
import { Scroll, Sheet, Text, signal } from 'kuito';

export default function Details() {
  const open = signal(true);

  return (
    <Sheet
      open={open.value}
      snapPoints={['content', '90%']}
      onClose={() => (open.value = false)}
      onSnap={(event) => console.log(event.index)}
    >
      <Scroll flex={1} padding={16}>
        <Text>Liner notes</Text>
      </Scroll>
    </Sheet>
  );
}
```

With several snap points, a child that grows (`flex={1}`) fills the sheet, so a Scroll inside scrolls within its height.

### Keep it open until the user decides

`dismissible={false}` turns off swiping down and tapping outside; `grabber={false}` hides the handle.

```tsx
import { Button, Sheet, Text, VStack } from 'kuito';

export default function Confirm(props: { open: boolean; answer: (yes: boolean) => void }) {
  return (
    <Sheet open={props.open} dismissible={false} grabber={false} padding={24}>
      <VStack gap={12}>
        <Text>Discard this draft?</Text>
        <Button onPress={() => props.answer(true)}>Discard</Button>
        <Button onPress={() => props.answer(false)}>Keep editing</Button>
      </VStack>
    </Sheet>
  );
}
```

### Present a route as a sheet

A route with `presentation="sheet"` opens in a sheet when navigated to, with no state to keep ([navigation](../guides/navigation.md)).

## Platform differences

|             | iOS                                                 | Android                   |
| ----------- | --------------------------------------------------- | ------------------------- |
| Snap points | All of them                                         | At most three take effect |
| Look        | Floating, inset from the edges, on iOS 26 and later | Full width                |

The sheet runs to the screen's bottom edge on both, and its content stays clear of the home indicator or the navigation bar.

## Accessibility

The sheet is the platform's own, so VoiceOver and TalkBack handle it as they handle any system sheet. Its children are read as anywhere else; a sheet without a grabber needs a visible way to close it.

## Related

- [Navigation](../guides/navigation.md)
- [Motion sources](../../../../docs/motion.md#motion-sources), for `sheetMotion()`
- [Sheet in depth](../../../../docs/primitives.md#sheet)
