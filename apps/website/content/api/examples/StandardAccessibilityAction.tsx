// Offer actions to a screen reader.
import { HStack, Text, signal, type StandardAccessibilityAction } from 'kuito';

const quantity = signal(1);
// Screen readers offer these on an adjustable view: swipe up or down.
const adjust: { name: StandardAccessibilityAction }[] = [
  { name: 'increment' },
  { name: 'decrement' },
];

<HStack
  role="slider"
  label="Quantity"
  aria-valuenow={quantity.value}
  actions={adjust}
  onAction={(event) =>
    (quantity.value = Math.max(0, quantity.value + (event.actionName === 'increment' ? 1 : -1)))
  }
>
  <Text>{quantity.value}</Text>
</HStack>;
