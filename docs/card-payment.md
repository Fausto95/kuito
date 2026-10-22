# Format and paste into a text field

Use `format` to display grouped digits while preserving native input behavior. Use the field's selection to insert clipboard text at the current caret or replace the selected range.

## Group digits as they are entered

```tsx
import { Button, HStack, TextField, clipboard, signal } from 'kuito';

const digitsOf = (text: string) => text.replace(/\D/g, '');

function cardNumber(text: string) {
  return digitsOf(text)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

export default function CardNumber() {
  const number = signal('');
  const selection = signal({ start: 0, end: 0 });

  async function paste() {
    const pasted = digitsOf((await clipboard.readText()) ?? '');
    const { start, end } = selection.value;
    const before = digitsOf(number.value.slice(0, start));
    const text = cardNumber(before + pasted + digitsOf(number.value.slice(end)));

    number.value = text;
    const caret = Math.min(cardNumber(before + pasted).length, text.length);
    selection.value = { start: caret, end: caret };
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
      <Button onPress={() => void paste().catch(console.error)}>Paste</Button>
    </HStack>
  );
}
```

`format` transforms user input. An assignment to `value` is displayed as supplied, so the paste handler formats its own result and updates the selection. The sample accepts up to 19 digits and groups them in fours; it illustrates input formatting, not card validation or payment processing.

For expiry formatting, apply the same pattern to a short digit string with a separator. For actual payments, use your payment provider's supported collection flow. See [TextField](text-field.md), [keyboard](keyboard.md) and [clipboard](clipboard.md).
