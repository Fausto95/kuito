import { Text, TextField, VStack, signal } from 'kuito';
import { amount, cardNumber, expiry } from './formats';

/** A field bound to the JS thread's signal: its format runs on the UI thread all the same. */
export function Payment() {
  const card = signal('');
  const total = signal('');

  return (
    <VStack padding={20} gap={8}>
      <TextField label="Card number" inputMode="numeric" value={card} format={cardNumber} />
      <Expiry />
      <TextField label="Amount" inputMode="decimal" value={total} format={(text) => amount(text)} />
      <Text>{`Card: ${card.value}`}</Text>
      <Text>{`Amount: ${total.value}`}</Text>
    </VStack>
  );
}

/** Text and handler touch only its own signal: the whole field lives on the UI thread. */
function Expiry() {
  const expires = signal('');

  return (
    <VStack gap={8}>
      <TextField
        label="Expiry"
        inputMode="numeric"
        value={expires.value}
        onChange={(text) => (expires.value = text)}
        format={expiry}
      />
      <Text>{`Expires ${expires.value}`}</Text>
    </VStack>
  );
}

/** What the compiler cannot place: it is constructed. */
class Grouping {
  group(text: string): string {
    return cardNumber(text);
  }
}

/**
 * A format the UI thread cannot run (it constructs a class) beside an
 * onChange it can: the JS thread formats, and the change reaches the UI thread.
 */
export function GiftCard() {
  const code = signal('');

  return (
    <VStack padding={20} gap={8}>
      <TextField
        label="Gift card"
        inputMode="numeric"
        value={code.value}
        onChange={(text) => (code.value = text)}
        format={(text) => new Grouping().group(text)}
      />
      <Text>{`Gift card ${code.value}`}</Text>
    </VStack>
  );
}

/** A field whose caret the app follows. */
export function Selected() {
  const card = signal('');
  const caret = signal(0);

  return (
    <VStack padding={20} gap={8}>
      <TextField
        label="Card number"
        value={card}
        format={cardNumber}
        onSelectionChange={(selection) => (caret.value = selection.end)}
      />
      <Text>{`Caret at ${caret.value}`}</Text>
    </VStack>
  );
}
