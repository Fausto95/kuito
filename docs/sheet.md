# Sheet

Present contextual content over the current screen. Use it for filters, a queue or a lightweight editor.

## Open and close a queue

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

## Behavior

Keep the open state synchronized with native dismissal through a signal or `onClose`. `snapPoints` defines permitted heights. Use a presented route when the sheet is a navigable screen or must return a typed result.

## Props

<!-- Sheet props: generated from src/protocol/manifest.ts -->

| Prop           | Meaning                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `open`         | Shows the sheet while true. Controlled: set it back to false in `onClose`.                                                                                                           |
| `onClose`      | The user dismissed it (swipe, backdrop or back); set `open` back to false.                                                                                                           |
| `snapPoints`   | Resting heights, smallest first: points, `'50%'`, or `'content'` (default).                                                                                                          |
| `onSnap`       | `{ index }` of the snap point the sheet settled at.                                                                                                                                  |
| `grabber`      | The drag handle; shown by default.                                                                                                                                                   |
| `dismissible`  | Whether swiping down or tapping outside dismisses it; true by default.                                                                                                               |
| `borderRadius` | The sheet's corner radius.                                                                                                                                                           |
| `motion`       | `sheetMotion()`: its `height` and its `progress` between its snap points move with the sheet every frame, on the UI thread ([follow a sheet](motion.md#follow-a-sheet-or-keyboard)). |

<!-- end of generated props -->

## Continue

Read [Navigation](navigation.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Sheet#members) for types and documented defaults.
