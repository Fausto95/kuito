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

## Listen from a ref

A view's [ref](refs.md) is an event target: `addEventListener`,
`removeEventListener` and `dispatchEvent` work as in the DOM, with the
`capture`, `once` and `signal` options. Listeners hear events by their native
name, which is Kuito's own (`press`, not the DOM's `click`):

| Event prop                         | Event name                   |
| ---------------------------------- | ---------------------------- |
| `onPress`, `onPressCapture`        | `press`                      |
| `onPressStart`, `onPressEnd`       | `pressin`, `pressout`        |
| `onLongPress`                      | `longpress`                  |
| `onChange`, `onSubmit`             | `change`, `submit`           |
| `onFocus`, `onBlur`                | `focus`, `blur`              |
| `onLoadStart`, `onLoad`, `onError` | `loadstart`, `load`, `error` |
| `onScroll`, `onScrollEnd`          | `scroll`, `scrollend`        |
| `onAction`                         | `accessibilityaction`        |

This form holds back every press inside it while a save runs. Its listener
hears the press in the capture phase, before the button does:

```tsx
import { Box, Button, onMount, ref, signal, type KuitoNativeEvent } from 'kuito';

const saving = signal(false);

export function Form(props: { onSave: () => void }) {
  const form = ref();

  const guard = (event: KuitoNativeEvent) => {
    if (saving.value) event.stopPropagation();
  };

  onMount(() => form.current?.addEventListener('press', guard, { capture: true }));

  return (
    <Box ref={form}>
      <Button onPress={props.onSave}>Save</Button>
    </Box>
  );
}
```

A view's listeners go with it: removing the view removes them. Remove one
sooner with `removeEventListener`, passing the same function and `capture`,
or with an `AbortSignal` given as `signal`.

## How an event travels

A press travels the view tree as a DOM event does. It goes down from the root
to the pressed view (capture), reaches that view (target), then goes back up
(bubble). It bubbles and is cancelable. Every other native event reaches its
view only: it does not bubble, and capture listeners do not hear it.

At each view the prop runs before the listeners: `onPressCapture` in the
capture phase, `onPress` at the target and while bubbling. A Box with
`onPressCapture` and `onPress` around a Button with `onPress` and a `press`
listener runs, in order: the Box's `onPressCapture`, the Button's `onPress`,
the Button's listener, the Box's `onPress`.

| Member                       | Does                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `stopPropagation()`          | Stops the event once the current view has run its prop and listeners          |
| `stopImmediatePropagation()` | Stops it now: the current view's remaining listeners do not run               |
| `preventDefault()`           | On a cancelable event, sets `defaultPrevented`; `dispatchEvent` returns false |
| `target`, `currentTarget`    | The view the event is for, and the view running the listener                  |
| `eventPhase`                 | 1 capture, 2 target, 3 bubble                                                 |
| `composedPath()`             | The views from the target up to the root                                      |

`preventDefault()` only marks the event in Kuito: what the platform already
did, such as a button's highlight or a haptic, still happens. To make a view
ignore touches, set `disabled`.

## Dispatch a custom event

`dispatchEvent` sends an event from a view through the same phases. Use a
`KuitoCustomEvent` to carry data, and `bubbles: true` for ancestors to hear
it. A listener receives the object that was dispatched, so `instanceof`
recovers its `detail`:

```tsx
import { Box, KuitoCustomEvent, Pressable, Text, onMount, ref } from 'kuito';

function ReloadButton() {
  const row = ref();
  const ask = () =>
    row.current?.dispatchEvent(
      new KuitoCustomEvent('refresh', { detail: { force: true }, bubbles: true }),
    );

  return (
    <Pressable ref={row} onPress={ask}>
      <Text>Reload</Text>
    </Pressable>
  );
}

export function Feed() {
  const feed = ref();

  onMount(() =>
    feed.current?.addEventListener('refresh', (event) => {
      if (event instanceof KuitoCustomEvent) console.log('refresh', event.detail);
    }),
  );

  return (
    <Box ref={feed}>
      <ReloadButton />
    </Box>
  );
}
```

`dispatchEvent` returns false when a listener called `preventDefault()` on a
cancelable event. Prefer props and callbacks for ordinary parent-child
communication; use a custom event when the views in between should not have
to pass it along.

| Call                                                      | Fails with                               |
| --------------------------------------------------------- | ---------------------------------------- |
| `dispatchEvent` on a removed view                         | `TypeError: Unknown event target`        |
| `addEventListener` with a listener that is not a function | `TypeError: Listener must be a function` |

## Event lifetime

Removed views do not receive late events. Do not use onBlur as an unmount
cleanup hook; use [onCleanup](lifecycle-events.md). Errors in action handlers
must be handled there rather than relying on Catch. For per-frame visual
updates prefer [motion sources](motion.md) over sending every event through JS.
