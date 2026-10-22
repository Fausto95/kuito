import {
  Button,
  HStack,
  SafeArea,
  Text,
  TextField,
  VStack,
  clipboard,
  computed,
  haptics,
  signal,
  watch,
} from 'kuito';

// A card number field that groups its digits as the user types, pastes at
// the caret, and taps the user's hand once the number is complete.

const digitsOf = (text: string) => text.replace(/\D/g, '');

/** Groups of four, at most 19 digits: what the field shows for what was typed. */
function cardNumber(text: string) {
  return digitsOf(text)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** MM/YY, the slash added once the month is typed. */
function expiry(text: string) {
  const digits = digitsOf(text).slice(0, 4);

  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

/** The Luhn checksum every card number carries in its last digit. */
function luhn(digits: string) {
  let sum = 0;

  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index]);

    if (index % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }

  return sum % 10 === 0;
}

/** Where the caret goes in `formatted` to follow its first `count` digits. */
function afterDigits(formatted: string, count: number) {
  let seen = 0;

  for (let index = 0; index < formatted.length; index++) {
    if (seen === count) return index;
    if (/\d/.test(formatted[index] ?? '')) seen++;
  }

  return formatted.length;
}

export default function CardPayment() {
  const number = signal('');
  const selection = signal({ start: 0, end: 0 });
  const expires = signal('');
  const status = computed(() => {
    const digits = digitsOf(number.value);

    if (digits.length < 16) return '';

    return luhn(digits) ? 'Card number complete' : 'Check the card number';
  });

  // Once, as the number reaches its sixteenth digit, typed or pasted.
  watch(number, (text, previous) => {
    const digits = digitsOf(text);

    if (digits.length === 16 && digitsOf(previous ?? '').length !== 16)
      void haptics.notification(luhn(digits) ? 'success' : 'error');
  });

  // Text the app sets is shown as it is, so the paste is formatted here, and
  // the caret placed after the pasted digits.
  async function paste() {
    const pasted = digitsOf((await clipboard.readText()) ?? '');
    const { start, end } = selection.value;
    const before = digitsOf(number.value.slice(0, start));
    const text = cardNumber(before + pasted + digitsOf(number.value.slice(end)));
    const caret = afterDigits(text, before.length + pasted.length);

    number.value = text;
    selection.value = { start: caret, end: caret };
  }

  return (
    <SafeArea flex={1}>
      <VStack padding={24} gap={12}>
        <Text fontSize={28} fontWeight="bold">
          Payment
        </Text>
        <HStack gap={8}>
          <TextField
            flex={1}
            label="Card number"
            placeholder="1234 5678 9012 3456"
            inputMode="numeric"
            autoComplete="cc-number"
            value={number}
            selection={selection}
            format={cardNumber}
          />
          <Button onPress={paste}>Paste</Button>
        </HStack>
        <Text color="#6e6e73">{status.value}</Text>
        <TextField
          label="Expiry"
          placeholder="MM/YY"
          inputMode="numeric"
          autoComplete="off"
          value={expires}
          format={expiry}
        />
      </VStack>
    </SafeArea>
  );
}
