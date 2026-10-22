# Keyboard

The native side tracks the software keyboard and keeps inputs clear of it on
its own, inside the keyboard's animation: UIKit's keyboard notifications on
iOS, `WindowInsetsAnimation` on Android, where avoidance follows the keyboard
frame by frame. JavaScript is not on that path, so nothing waits for a round
trip and nothing guesses an offset, as React Native's `KeyboardAvoidingView`
does with `keyboardVerticalOffset`.

## Avoidance

**Scroll views and lists do it by default.** While the keyboard covers part
of a vertical Scroll or List, its content is inset by that part, so
all of it can still scroll into view, and a focused input inside (in a row,
for a list) scrolls up until it clears the keyboard. The inset adds to the
view's own padding. An inverted list takes it at its start, which is at the
bottom on screen, so a list resting there keeps its first rows above the
keyboard, as a chat should. Turn it off with `keyboard={{ inset: false }}`.
It is on by default, on both platforms.

**Any container can avoid it** with `keyboard={{ avoid }}`:

| Value      | What happens                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `none`     | Nothing (the default).                                                                                                         |
| `padding`  | The bottom padding grows by the part of the container the keyboard covers, and its content lays out above it. A chat composer. |
| `position` | The container moves up until its focused input clears the keyboard, or, without a focused input inside, until its bottom does. |

```tsx
import { HStack, List, SafeArea, Text, TextField, signal } from 'kuito';

export default function Chat() {
  const messages = signal<{ id: string; text: string }[]>([]);
  const draft = signal('');

  function send() {
    messages.value = [...messages.value, { id: String(Date.now()), text: draft.value }];
    draft.value = '';
  }

  return (
    <SafeArea flex={1}>
      <List flex={1} data={messages} renderItem={({ item }) => <Text>{item.text}</Text>} />
      <HStack keyboard={{ avoid: 'padding' }}>
        <TextField
          flex={1}
          placeholder="Message"
          enterKeyHint="send"
          value={draft}
          onSubmit={send}
        />
      </HStack>
    </SafeArea>
  );
}
```

Both measure the container against the keyboard's real frame, wherever the
container is on screen and however its ancestors scale, rotate or flip it.
`padding` adds to a SafeArea's inset rather than stacking on it: the
bottom gets whichever is larger, the home indicator or the keyboard. `position` composes with the view's own `translateY`. After any
layout change while the keyboard shows (a sibling resizes, content arrives),
avoidance measures again.

## Inputs

| Prop                         | Meaning                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enterKeyHint`               | HTML's `enterkeyhint`, the enter key's label: `enter`, `done`, `go`, `next`, `search` or `send`.                                                           |
| `submitBehavior`             | `newline` adds a line (the default with `lines`); after `onSubmit`, `blurAndSubmit` (the default without) hides the keyboard and `submit` keeps the focus. |
| `autoFocus`                  | Focuses the input once it is on screen.                                                                                                                    |
| `ref.focus()` / `ref.blur()` | Focus or blur from JavaScript.                                                                                                                             |

**Focus order** is the order inputs appear in the view tree, as in the DOM:
within the same screen or sheet, skipping hidden and disabled inputs. With
`enterKeyHint="next"` and the default `submitBehavior`, the enter key moves
focus to the next input natively, in the same frame, so the keyboard never
drops and rises again. The last input blurs. Moving focus yourself in
`onSubmit` still works: your `focus()` arrives after the native move and
wins. On Android this replaces the platform's spatial focus search, so both
platforms move through the same inputs. A hardware Enter key moves once.

## Selection

A field's `selection` is the selected range, `{ start, end }`, in UTF-16
offsets as HTML's `selectionStart` and `selectionEnd` count them; `start`
equal to `end` is the caret. Like `value` it is two-way: hand it a signal and
the field writes it as the user moves the caret or selects, and writing it
selects. `onSelectionChange` passes the range.

```tsx
import { Button, TextField, VStack, signal } from 'kuito';

export default function Composer() {
  const draft = signal('');
  const selection = signal({ start: 0, end: 0 });

  function insert(text: string) {
    const { start, end } = selection.value;

    draft.value = draft.value.slice(0, start) + text + draft.value.slice(end);
    selection.value = { start: start + text.length, end: start + text.length };
  }

  return (
    <VStack>
      <TextField value={draft} selection={selection} />
      <Button onPress={() => insert('👋')}>Wave</Button>
    </VStack>
  );
}
```

A field sends its selection only while something listens, a bound signal or
`onSelectionChange`, as a scroll view sends `scroll` only for `onScroll`. A
selection the app sets sends nothing, and neither does the caret its own text
moves: text the app sets puts the caret after it, as HTML does, and a bound
selection keeps its old range until the user moves the caret. So write
`selection` after `value` when both matter, as `insert` does above; a new
field always gets its text first. A selection past the end of the text stops
at the end, and an unset one puts the caret there. For one keystroke,
`onChange` and `onSelectionChange` can come in either order.

## Formatting

`format` turns what the user typed into what the field shows: a card
number in groups, an expiry's slash, an amount's thousands. It takes the
field's whole text after each edit (a key, a paste, autofill, a deletion)
and returns the text to show. Kuito has none built in; write the one your
field needs:

```tsx
import { TextField, signal } from 'kuito';

function cardNumber(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 19);

  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export default function CardField() {
  const card = signal('');

  return (
    <TextField inputMode="numeric" autoComplete="cc-number" value={card} format={cardNumber} />
  );
}
```

**The field never shows the unformatted text.** `format` runs on the UI
thread, from the edit itself, and the field draws its result in the same
frame. `onChange` and a bound `value` only ever see the formatted text.
The caret the format chose is reported as the user's selection; as for any
keystroke, the caret as typed may be reported first. It is placed there as any UI-thread code
is ([placement](placement.md)): a `format` that uses the result of a
package's function, or captures what cannot cross threads, runs on the
JS thread instead, where the field shows what was typed until its answer
lands a frame later, and a key typed before then can be lost. The placement
report names such a `format` as a fallback. What it reads besides the text
is read as a handler reads it: a JS-thread signal as it was when the field
rendered.

**The caret stays where the user put it.** After a reformat it follows the
same character it followed before, among the ones `format` kept (letters
matched whatever their case). Typing `5` after `$1,234` shows `$12,345`
with the caret after the `5`; deleting a separator the format puts back
moves the caret before it, so the next deletion takes the digit. A
character `format` drops leaves the caret where it was, and one it replaces
leaves the caret after what replaced it.

**A composition formats once it commits.** While a keyboard composes
(pinyin, kana, a word Gboard underlines), the field shows and reports the
text as typed; `format` runs on the committed text. On Android it also
waits for the end of the keyboard's batch of edits, as the keyboard's next
edit in the batch counts on the text it made.

Text the app sets as `value` is shown as it is: format it before setting
it. A `format` that throws is reported in the LogBox, and the edit stays
as typed. Keep it as quick as a `map`: it runs on every keystroke, inside
the frame.

## Lines

A field with `lines` wraps its text. A count sets its height in lines, and
more text scrolls inside it; a `{ min, max }` range makes it grow with its
text, as the user types, from `min` lines (1 by default) to `max` (no limit
by default). Its enter key adds a line; with `submitBehavior="submit"` or
`blurAndSubmit` it submits instead, as a single-line field does.

```tsx
import { TextField, VStack, signal } from 'kuito';

export default function Note() {
  const description = signal('');
  const message = signal('');

  return (
    <VStack gap={12}>
      <TextField lines={4} placeholder="Description" value={description} />
      <TextField
        lines={{ max: 5 }}
        placeholder="Message"
        enterKeyHint="send"
        submitBehavior="submit"
        value={message}
        onSubmit={() => (message.value = '')}
      />
    </VStack>
  );
}
```

A multi-line field is its own native view, a UITextView on iOS and a
multi-line EditText on Android, so adding or removing `lines` remounts the
field, as `horizontal` does a Scroll; changing its count or range resizes it
in place. It takes a single-line field's props, but only text keyboards:
`type` `text`, `email`, `url` or `search`, and `inputMode` `none`, `text`,
`search`, `email` or `url`. A password has one line, and Android's number
and phone keyboards cannot enter a new one; the others are errors. On iOS it
draws no border, as UITextView has none: give it a background or a border to
look like a field. Its text's own height counts, so a line of emoji shows
whole. A keyboard that commits a new line instead of its enter key's action
(some Android keyboards do) submits a field that submits. A single-line field
has no line to add: there `newline` keeps the focus, as `submit` does, and
`lines={0}` is an error.

## What a field takes

HTML's input attributes, with HTML's values, on both platforms:

| Prop             | Meaning                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`           | `text` (default), `password` (hides the text), `email`, `number`, `tel`, `url` or `search`: the keyboard, and what the next props default to.                                  |
| `inputMode`      | The keyboard alone, over the type's: `text`, `decimal`, `numeric`, `tel`, `search`, `email`, `url`, or `none` for no keyboard. `type="password" inputMode="numeric"` is a PIN. |
| `autoComplete`   | What the field holds, for autofill and the password manager: `username`, `current-password`, `new-password`, `one-time-code`, `email`, `name`, and so on; `off` for none.      |
| `autoCapitalize` | `none`, `sentences`, `words` or `characters`. Unset, `sentences` for `text` and `search` fields and `none` for the others.                                                     |
| `spellCheck`     | Spell checking and autocorrection together. Unset, the platform's default for `text` and `search` fields and off for the others.                                               |
| `maxLength`      | The most UTF-16 code units the user can enter, as HTML counts them.                                                                                                            |

```tsx
import { TextField, VStack, signal } from 'kuito';

export default function SignIn() {
  const email = signal('');
  const password = signal('');
  const code = signal('');

  return (
    <VStack gap={12}>
      <TextField type="email" autoComplete="username" enterKeyHint="next" value={email} />
      <TextField
        type="password"
        autoComplete="current-password"
        enterKeyHint="go"
        value={password}
      />
      <TextField inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} />
    </VStack>
  );
}
```

`maxLength` stops what the user types or pastes at the limit, keeping whole
characters (an emoji or a flag is never cut in half); text the app sets as
`value` is never cut, as in HTML. On iOS a composition in progress (pinyin,
kana) can pass the limit until it commits. `autoComplete="off"` opts the
field out of autofill on Android; iOS has no such switch and only drops the
content type.

**Controlled inputs keep what the user types.** A change event can reach
JavaScript after the user has typed more. Echoing its text back as `value`
would erase the newer characters, so the kernel never sends a field the text
it just reported. A value the app sets itself (clearing the field, filling in
a suggestion) is sent. The same holds for a Toggle's `value`.

## Scroll views

A Scroll's or List's `keyboard` object also takes:

| Field         | Meaning                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dismiss`     | `none` (default), `on-drag` (a drag hides the keyboard) or `interactive` (iOS: the keyboard follows the finger; Android has no such keyboard and dismisses on drag).                                                         |
| `persistTaps` | While the keyboard shows, a tap outside the focused input: `never` (default) hides the keyboard and goes no further; `handled` hides it only when no pressable, button, switch or input took the tap; `always` leaves it up. |
| `inset`       | See [Avoidance](#avoidance). True by default.                                                                                                                                                                                |

With `never` the scroll view still scrolls: only a tap is held back from its
children. Both platforms decide whether a tap was handled the same way, from
the view under the finger.

## keyboard

The keyboard as a signal, a motion value and events, for app logic. Layout
does not need it.

```tsx
import { Box, Button, Text, VStack, keyboard } from 'kuito';

export default function KeyboardState() {
  keyboard.frame.value; // { screenX, screenY, width, height } or null

  // In a component, until it unmounts; elsewhere, until remove().
  keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

  return (
    <VStack>
      <Text>{keyboard.visible.value ? 'typing' : ''}</Text>
      {/* Rides on the keyboard. */}
      <Box translateY={keyboard.height.map((height) => -height)} />
      <Button onPress={() => keyboard.dismiss()}>Done</Button>
    </VStack>
  );
}
```

`visible` turns true once the keyboard has shown and false once it has
hidden. `frame` follows it, each change a new frame object: a motion value
the UI thread moves from the keyboard's own events, so
`<Box height={keyboard.frame.value?.height ?? 0} />` follows it with no
JavaScript, while code on the JS thread reads it as the same events
reach it. Only the keyboard writes it. `willShow`,
`didShow`, `willHide`, `didHide`, `willChangeFrame` and `didChangeFrame` fire
on **both** platforms; on Android they come from the start and end of the
inset animation. An event is
`{ frame, duration, easing }`: coordinates in
points on screen (height 0 once hidden), duration in milliseconds (0 when the
keyboard does not animate), and `easing` is `keyboard` for the system's own
curve.

`height` is where the keyboard is now: how far it stands over the window's
bottom, in points, 0 while hidden. Where `frame` jumps to the frame the
keyboard ends at, `height` moves with it every frame, as it animates and as
a finger drags it down with `keyboard={{ dismiss: 'interactive' }}` on iOS.
It is a motion value of numbers, so a bar bound to it rides on the keyboard
on the UI thread with no JavaScript and no JSON
([motion sources](motion.md#motion-sources)). The first read or binding
asks the platform for its moves (the `keyboard.motion` command); from then
on each frame's change is a `keyboard.move` event the UI thread writes and
keeps. iOS reads it on each display frame while the keyboard shows, from a
hidden view pinned to the keyboard layout guide, whose presentation layer
moves with the keyboard; Android from every frame of the inset animation.

- Android: dragging a scroll view dismisses the keyboard rather than
  following the finger (no `interactive` keyboard), so `height` follows the
  dismissal's animation.
- iOS 16: the layout guide keeps the bottom safe area, so a hidden keyboard
  reads as that inset's height rather than 0.

## How it crosses the boundary

- `keyboard.dismiss()`, `focus()` and `blur()` are **commands**: one-shot
  instructions in the mutation queue, after the view mutations before them. A
  `focus()` right after the state change that shows an input reaches the input
  once it exists. See [native rendering](native-renderer.md).
- A field with a `format` sends each edit of the user's as a `format` event
  (its text and selection) instead of reporting a `change` straight away. The
  UI thread answers it by setting the field's text and selection before the
  event returns, and the field then reports the change and, when it moved,
  the selection. An edit the UI thread did not take goes on to the JS
  thread, which formats it, sets the field's text and selection, and reports
  both itself. The main thread waits for that job as it waits for a change's
  ([native scheduling](native-scheduling.md#input)).
- Keyboard events are native events of the app (handle 0) named
  `keyboard.<type>` (`keyboard.didshow` plus a flat payload), dispatched like a view's
  (see [events](events.md)). An event nobody listens to is dropped.
