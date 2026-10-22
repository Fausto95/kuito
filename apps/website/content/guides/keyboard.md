# Keyboard

`TextField` is the native text input, and the native side keeps inputs clear of the software keyboard on its own, inside the keyboard's animation.

**Use it for**

- Forms whose enter key moves to the next field, with the right keyboard and autofill for each.
- A chat composer that stays above the keyboard and grows with its text.
- Formatted input: card numbers, amounts, dates.

```tsx
import { Button, SafeArea, TextField, signal } from 'kuito';

export default function SignIn() {
  const email = signal('');
  const password = signal('');

  return (
    <SafeArea padding={20} gap={12} keyboard={{ avoid: 'position' }}>
      <TextField
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        enterKeyHint="next"
        autoFocus
      />
      <TextField
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        enterKeyHint="go"
        onSubmit={() => console.log('sign in', email.value)}
      />
      <Button disabled={!email.value || !password.value}>Sign in</Button>
    </SafeArea>
  );
}
```

- `value` is two-way: given a signal, the field writes it as the user types. A value the app sets (clearing the field) is sent to it; the text the user just typed is not sent back.
- With `enterKeyHint="next"`, the enter key moves focus to the next input natively, in the same frame, so the keyboard never drops and rises again. The last input blurs. Focus order is the order inputs appear in the screen or sheet, skipping hidden and disabled ones.
- `submitBehavior`: `blurAndSubmit` (the default for a single line) hides the keyboard after `onSubmit`; `submit` keeps the focus; `newline` adds a line.
- `autoFocus` focuses the input once it is on screen; `ref.focus()` and `ref.blur()` do it from code.

## Pick the keyboard and autofill

HTML's input attributes, with HTML's values, on both platforms:

| Prop             | Values                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`           | `text` (default), `password`, `email`, `number`, `tel`, `url`, `search`                                                                                                                   |
| `inputMode`      | `none`, `text`, `decimal`, `numeric`, `tel`, `search`, `email`, `url`                                                                                                                     |
| `autoComplete`   | `off`, `username`, `current-password`, `new-password`, `one-time-code`, `email`, `name`, `given-name`, `family-name`, `tel`, `street-address`, `postal-code`, `country-name`, `cc-number` |
| `autoCapitalize` | `none`, `sentences`, `words`, `characters`                                                                                                                                                |
| `maxLength`      | The most UTF-16 units the user can enter; text the app sets is not cut                                                                                                                    |
| `spellCheck`     | Spell checking and autocorrection                                                                                                                                                         |
| `enterKeyHint`   | The enter key's label: `enter`, `done`, `go`, `next`, `search`, `send`                                                                                                                    |

## Format a card number

`format` takes the field's whole text after each edit (a key, a paste, autofill, a deletion) and returns the text to show. It runs on the UI thread in the same frame, so the field never shows the unformatted text, and the caret stays after the character it followed.

```tsx
import { TextField, signal } from 'kuito';

function cardNumber(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function CardField() {
  const card = signal('');

  return (
    <TextField
      inputMode="numeric"
      autoComplete="cc-number"
      placeholder="Card number"
      value={card}
      format={cardNumber}
    />
  );
}
```

Kuito has no formatters built in. Text the app sets as `value` is shown as it is: format it before setting it. A `format` the compiler cannot place on the UI thread runs on the JavaScript thread instead, a frame late; the [placement report](./placement.md) names it.

## Grow a field with its text

`lines` makes a field wrap. A count fixes its height in lines; `{ min, max }` grows it as the user types. Its enter key adds a line, unless `submitBehavior` says to submit.

```tsx
import { HStack, TextField, signal } from 'kuito';

export function Composer() {
  const message = signal('');

  return (
    <HStack padding={8} keyboard={{ avoid: 'padding' }}>
      <TextField
        flex={1}
        lines={{ max: 5 }}
        placeholder="Message"
        value={message}
        enterKeyHint="send"
        submitBehavior="submit"
        onSubmit={() => (message.value = '')}
      />
    </HStack>
  );
}
```

A multi-line field takes only text keyboards (`type` `text`, `email`, `url` or `search`). Adding or removing `lines` remounts the field; changing the count resizes it in place.

## Insert text at the caret

`selection` is the selected range, `{ start, end }` in UTF-16 offsets; `start` equal to `end` is the caret. Given a signal, the field writes it as the user moves the caret, and writing it selects. `onSelectionChange` passes the range.

```tsx
import { Button, TextField, VStack, signal } from 'kuito';

export function Editor() {
  const draft = signal('');
  const selection = signal({ start: 0, end: 0 });

  function insert(text: string) {
    const { start, end } = selection.value;
    draft.value = draft.value.slice(0, start) + text + draft.value.slice(end);
    selection.value = { start: start + text.length, end: start + text.length };
  }

  return (
    <VStack gap={8}>
      <TextField lines={4} value={draft} selection={selection} />
      <Button onPress={() => insert('🙂')}>Insert emoji</Button>
    </VStack>
  );
}
```

Write `selection` after `value` when both change, as `insert` does: text the app sets puts the caret after it. A field sends its selection only while a signal or `onSelectionChange` listens.

## Keep inputs above the keyboard

Scroll views and lists do it by default: while the keyboard covers part of a vertical `Scroll` or `List`, its content is inset by that part, and a focused input inside scrolls into view. Any other container avoids it with `keyboard={{ avoid }}`:

- `padding`: its bottom padding grows by the part the keyboard covers, and its content lays out above it. A chat composer. In a SafeArea, the bottom gets whichever is larger, the home indicator or the keyboard.
- `position`: it moves up until its focused input clears the keyboard, or, without one, until its bottom does.

A Scroll's or List's `keyboard` also takes `dismiss` (`none`, `on-drag`, `interactive`), `persistTaps` (`never`, `handled`, `always`: what a tap outside the focused input does) and `inset: false` to turn avoidance off.

## Read the keyboard from code

```tsx
import { Box, Button, Text, VStack, keyboard } from 'kuito';

export function KeyboardState() {
  keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

  return (
    <VStack>
      <Text>{keyboard.visible.value ? 'Typing' : 'Idle'}</Text>
      <Box height={keyboard.height} />
      <Button onPress={keyboard.dismiss}>Hide keyboard</Button>
    </VStack>
  );
}
```

- `keyboard.visible` is a signal. `keyboard.height` moves every frame the keyboard does, on the UI thread ([Motion](./motion.md#follow-a-sheet-or-the-keyboard)); `keyboard.frame` jumps to the frame the keyboard ends at, or null while it is hidden.
- `keyboard.watch` takes `willShow`, `didShow`, `willHide`, `didHide`, `willChangeFrame` or `didChangeFrame`. An event is `{ frame, duration, easing }`. In a component it ends when the component unmounts; elsewhere, call `remove()` on what it returns.
- `keyboard.dismiss()` hides the keyboard and blurs the focused input.

Layout does not need these: avoidance runs natively.

## Platform differences

- `dismiss: 'interactive'`: the keyboard follows the finger on iOS; Android dismisses it on drag.
- A multi-line field draws no border on iOS, as UITextView has none: give it a background or a border.
- Android: Kuito's focus order replaces the platform's spatial focus search, so both platforms move through the same inputs.

## Related

- [Primitives](./primitives.md): the views around a form
- [Accessibility](./accessibility.md): labels for inputs
- [Keyboard in depth](../../../../docs/keyboard.md): how avoidance measures the keyboard, what a field takes, how commands cross the native boundary
