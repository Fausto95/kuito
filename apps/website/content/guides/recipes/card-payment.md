# Card payment

A card number that groups itself as it is typed, a paste that lands at the caret, and a tap of the hand when the number is complete.

**Use it for**

- Formatting a number into groups of four, and an expiry into `MM/YY`, without the field fighting the caret.
- Pasting digits into the middle of the number.
- A success or error haptic once the number reaches 16 digits and passes or fails its checksum.

The whole screen is [demo/recipes/card-payment.tsx](../../../../../demo/recipes/card-payment.tsx).

## Format as the user types

`format` receives the field's text and returns what to show. Text the app sets as `value` is shown as it is, so a paste is formatted in the handler, and `selection` puts the caret after the pasted digits.

```tsx
import { Button, HStack, TextField, clipboard, haptics, signal, watch } from 'kuito';

const digitsOf = (text: string) => text.replace(/\D/g, '');

function cardNumber(text: string) {
  return digitsOf(text)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

export default function CardNumber() {
  const number = signal('');
  const selection = signal({ start: 0, end: 0 });

  watch(number, (text, previous) => {
    const digits = digitsOf(text);

    if (digits.length === 16 && digitsOf(previous ?? '').length !== 16)
      void haptics.notification('success');
  });

  async function paste() {
    const pasted = digitsOf((await clipboard.readText()) ?? '');
    const { start, end } = selection.value;
    const before = digitsOf(number.value.slice(0, start));
    const text = cardNumber(before + pasted + digitsOf(number.value.slice(end)));

    number.value = text;
    selection.value = { start: text.length, end: text.length };
  }

  return (
    <HStack gap={8}>
      <TextField
        flex={1}
        label="Card number"
        inputMode="numeric"
        autoComplete="cc-number"
        value={number}
        selection={selection}
        format={cardNumber}
      />
      <Button onPress={() => void paste()}>Paste</Button>
    </HStack>
  );
}
```

The screen's checksum is the Luhn check on those 16 digits: success when it passes, an error haptic when it does not. The expiry field is the same pattern with a slash after the month.

## Related

- [Keyboard](../keyboard.md#format-a-card-number): `format` and where it runs
- [Keyboard](../keyboard.md#insert-text-at-the-caret): selection
