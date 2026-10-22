# TextField

`TextField` is a native text input. Given a signal as `value`, it writes what the user types into it.

Use it for:

- a search field, an email, a password;
- a message that grows over several lines;
- a card number or a date formatted as the user types.

```tsx
import { TextField, VStack, signal, Text } from 'kuito';

export default function Search() {
  const query = signal('');

  return (
    <VStack padding={16} gap={8}>
      <TextField label="Search" placeholder="Artists, albums" type="search" value={query} />
      <Text>{query.value}</Text>
    </VStack>
  );
}
```

## Patterns

### Move to the next field on enter

`enterKeyHint="next"` moves the focus to the next input natively, in the same frame, so the keyboard stays up. The last field, with `go`, submits.

```tsx
import { TextField, VStack, signal } from 'kuito';

export default function SignIn(props: { submit: (email: string, password: string) => void }) {
  const email = signal('');
  const password = signal('');

  return (
    <VStack padding={24} gap={12}>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        enterKeyHint="next"
        value={email}
      />
      <TextField
        label="Password"
        type="password"
        enterKeyHint="go"
        value={password}
        onSubmit={() => props.submit(email.value, password.value)}
      />
    </VStack>
  );
}
```

### Format a card number

`format` turns what the user typed into what the field shows, on the UI thread before the frame, and the caret stays after the character it followed ([formatting](../../../../docs/keyboard.md#formatting)).

```tsx
import { TextField, signal } from 'kuito';

function cardNumber(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 19);

  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export default function Card() {
  const card = signal('');

  return (
    <TextField
      label="Card number"
      inputMode="numeric"
      autoComplete="cc-number"
      value={card}
      format={cardNumber}
    />
  );
}
```

### Grow a message over several lines

`lines={{ max: 5 }}` grows the field with its text up to five lines; `submitBehavior="submit"` keeps the focus after sending.

```tsx
import { TextField, signal } from 'kuito';

export default function Composer(props: { send: (text: string) => void }) {
  const message = signal('');

  return (
    <TextField
      label="Message"
      lines={{ max: 5 }}
      placeholder="Message"
      enterKeyHint="send"
      submitBehavior="submit"
      value={message}
      onSubmit={(event) => {
        props.send(event.text);
        message.value = '';
      }}
    />
  );
}
```

## Platform differences

|              | iOS                                     | Android               |
| ------------ | --------------------------------------- | --------------------- |
| Single line  | `UITextField`                           | `EditText`            |
| With `lines` | `UITextView`, with no border of its own | Multi-line `EditText` |

A TextField with a background draws only that background; without one it keeps the platform's field look. Adding or removing `lines` remounts the field.

## Accessibility

A screen reader reads it as a text field. Give it a `label`, the field's name: a placeholder disappears once the user types.

## Related

- [Keyboard](../guides/keyboard.md)
- [Scroll](./scroll.md), which keeps a focused field clear of the keyboard
- [TextField in depth](../../../../docs/primitives.md#textfield)
