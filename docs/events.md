# Handle user and view events

Use event props for actions reported by a view. Use bound signals for controls
whose value should stay synchronized with app state.

## Bind a field or handle its changes

```tsx
import { Text, TextField, VStack, signal } from 'kuito';

export function Search() {
  const query = signal('');
  return (
    <VStack gap={8}>
      <TextField label="Search" value={query} onSubmit={() => console.log(query.value)} />
      <Text>{query.value}</Text>
    </VStack>
  );
}
```

Passing a writable signal to a Bound prop enables two-way updates. Passing a
plain value or read-only signal displays it without writing back. TextField
uses value, Toggle uses checked, Sheet uses open, and refreshable views use
refreshing. Changes set by the app do not generate a second user-change event.

## Choose the event

| Event prop                   | Use it for                                     |
| ---------------------------- | ---------------------------------------------- |
| `onPress`                    | A completed action                             |
| `onPressStart`, `onPressEnd` | Press tracking and feedback                    |
| `onLongPress`                | A long-press action                            |
| `onChange`                   | The new text or toggle value                   |
| `onSubmit`                   | Submission from a text field                   |
| `onFocus`, `onBlur`          | Keyboard focus changes                         |
| `onLoad`, `onError`          | Media load outcomes                            |
| `onScroll`                   | Scroll event data when a JS callback is needed |
| `onAction`                   | An accessibility action                        |

Native module views define their own event payloads. Consult the component's
prop reference instead of assuming every callback receives a DOM-shaped event.

## Propagation and custom events

Press events support capture and bubbling; use their cancellation and
propagation methods when an inner action should not activate an outer one.
An ElementHandle can add/remove event listeners and dispatch a KuitoCustomEvent
with a typed detail payload. Prefer component props for ordinary parent-child
communication and use custom events when propagation through the view tree is
the intended behavior.

Removed views do not receive late events. Do not use onBlur as an unmount
cleanup hook; use [onCleanup](lifecycle-events.md). Errors in action handlers
must be handled there rather than relying on Catch. For per-frame visual
updates prefer [motion sources](motion.md) over sending every event through JS.
