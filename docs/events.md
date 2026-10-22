# Events

Event props are named for the fact they report ([naming](naming.md)). Each one
listens to a native event, and some pass the value the view reports instead of
the event.

| Prop                          | Native event           | Handler receives                             |
| ----------------------------- | ---------------------- | -------------------------------------------- |
| `onPress` / `onPressCapture`  | `press`                | `PressEvent` (bubbles, cancelable)           |
| `onPressStart` / `onPressEnd` | `pressin` / `pressout` | the event                                    |
| `onLongPress`                 | `longpress`            | the event                                    |
| `onChange`                    | `change`               | the text for TextField, `checked` for Toggle |
| `onSubmit`                    | `submit`               | `{ text }`                                   |
| `onFocus` / `onBlur`          | `focus` / `blur`       | the event                                    |
| `onLoad` / `onError`          | `load` / `error`       | the event                                    |
| `onScroll`                    | `scroll`               | the event                                    |
| `motion`                      | `motion`               | no handler: a motion source                  |
| `onAction`                    | `accessibilityaction`  | `{ actionName }`                             |

`motion` takes no handler: it takes the view's motion source
(`scrollMotion()` on a Scroll or a List), and the view's `motion` event,
sent every frame it moves while the kernel sets `emitsMotion`, writes the
source's motion values on the UI thread and stops there
([motion sources](motion.md#motion-sources)). Its payload is numbers only,
one per motion value; generation fails otherwise.

A view a native module contributes has its own events instead: each `on*`
prop listens to the event it names (`onChangeEnd` to `changeEnd`)
when the view declares it, and the handler receives the event with the
payload's fields ([native views](native-modules.md#views)).

`onChange` passes the value the view reports, not the event: a TextField's
text, a Toggle's `checked`. A TextField's text is its `value`. It reports the
user's changes only: a prop the app sets sends no `change` on either platform,
though Android's own listeners fire for it (the renderer holds them back).

Native views report every event whether or not the app listens; an event
nobody listens to is dropped. Events cross threads asynchronously, so a view
can still report after a commit removed it: a focused TextField blurs as it leaves
the window, and anything it sent before the removal reached the native side is
still on its way. Those events are dropped too, so a removed view's handlers
never run (no `onBlur` on unmount, as in React Native). An event aimed at an
id the kernel never created is an error.

A reload clears the native tree before the next runtime starts, and no view of
the cleared tree reports again: an image still loading when the app reloads
never sends its `load` to the new runtime, whose views reuse the same ids.

A TextField's `change` text and a Toggle's `change` value become the view's
recorded prop, so a controlled `value` that only repeats what the view
reported is not sent back to it (see [keyboard](keyboard.md#inputs)).

## Two-way props

Some props the view changes itself: a TextField's `value` as the user types, a
Toggle's `value`, a Sheet's `open` when the user dismisses it, a
scroll view's or list's `refreshing` when the user pulls to refresh. Their
type is `Bound<T>`. Hand one a signal and the view writes it, with no
handler:

```tsx
import { TextField, signal } from 'kuito';

export function Search() {
  const query = signal('');

  return <TextField value={query} />; // typing writes query; query.value = '' clears the field
}
```

The manifest says which event reports which prop (`reports` in
`src/protocol/manifest.ts`): the payload field with the new value
(`change` → `text`), several fields as one object (`selectionchange` →
`selection: { start, end }`), or the value the event means (`close` →
`open: false`, `refresh` → `refreshing: true`). The kernel records it as the view's prop
first, so the signal's write is not sent back: the view already shows it. A
read-only signal (a `computed`, a module's platform state) or a plain value
is shown one way and never written. A view a native module contributes
reports a prop by any event whose payload has a field of the prop's name
(a Slider's `value`).

## App-wide events

State the native side tracks for the whole app arrives the same way, as an
event of the app (handle 0) named `<target>.<event>`: `keyboard.<type>` for the
keyboard (`keyboard.move` carries its height each frame it moves, once the app
reads `keyboard.height`), `accessibility.status` for screen reader and reduce motion status,
`devtools.select` for the dev menu's element picker, `devtools.updates` for
whether it highlights updates, `ui` for a message
from the UI thread, and `host.idle`, without a payload, when the UI thread
applied every batch it had fallen behind on, which runs the re-plans that
waited for it ([native scheduling](native-scheduling.md)). The kernel hands them to the `keyboard` and
`accessibility` signals and watchers ([keyboard](keyboard.md),
[accessibility](accessibility.md)); one nobody listens to is dropped. Any other
target is an error.

## Wire format

A native event is the view's number (the one the host batch created it with,
docs/native-scheduling.md; 0 for the app), the event's name, and its payload
in a typed record when the event carries data. A module view's own events,
which the manifest does not describe, carry a JSON object instead:
`(17, "progress", '{"seconds":12}')`, which the shell passes to
`__kuito.dispatch(handle, event, payload)`. A number JSON cannot hold (NaN,
Infinity) is sent as `null` in its place on both platforms; a value that is
not JSON at all is a renderer bug and fails loudly. View numbers are never
reused, so an event from a view the kernel already removed (a focused field
blurs as it leaves the window) is dropped; a number the kernel never gave out
is an error.

### Typed events

Every event the manifest lists, and every app event but `ui`, crosses with
no JSON. `PAYLOADS` in `src/protocol/manifest.ts` declares each payload's
fields and types, and `npm run generate` turns each payload into one fixed
layout: its numbers and booleans by slot, in the order the manifest lists
them, then its strings. A layout has an id (0 is no payload) and is the same
in every generated file: `EVENT_LAYOUTS` in the kernels,
`native/shared/EventLayouts.generated.h`, and a payload type per platform
(`KuitoScrollPayload` in `KuitoEvents.generated.swift` and
`KuitoEvents.generated.kt`). Generation fails when an event names a payload
with no layout.

1. A renderer builds the payload type the manifest names for its kind and
   event, and the emitter writes it into a record it reuses: numbers as
   doubles, a boolean as 1 or 0, an optional number it does not report
   (`number?`, a gesture's `scale` on a pan) as NaN, strings beside them. An
   event a view sends while another is still being sent gets a record of
   its own.
2. The shell hands the record to C++ (`native/shared/EventRecord.h`), which
   checks it fills its layout once, copies the numbers into the UI kernel's
   reusable `Float64Array` and calls `__kuitoUI.eventRecord(handle, event,
   layout, strings)`. The first event checks the kernel's
   `eventLayoutHash` against the shell's own: a kernel served from another
   manifest is refused, rather than reading fields from the wrong slots.
3. With no UI-thread handler the UI kernel returns false without reading the
   record, and the shell sends the same record to the JS thread, whose
   kernel reads it through `__kuito.dispatchRecord`. A kernel reads a record
   into the event's object before any handler runs, since the next event
   reuses the buffer, and checks the layout is the one the view's kind sends
   the event in.

Reading back, an optional number that is NaN is absent, and a number JSON
could not hold reads as `null`, as it did when events were JSON. A
UI-thread handler that sends a press on to a Pressable around it
(`dispatch` operation) hands its payload over as an object. The UI thread's
own messages to the JS thread (`ui`) cross as plain data, which C++ copies
between the runtimes (docs/native-scheduling.md#structured-props).
