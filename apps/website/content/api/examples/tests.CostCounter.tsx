// Inspect one native work counter.
import { Button, Text, VStack, signal } from 'kuito';
import { assert, costOf, press, render, screen, test, type CostCounter } from 'kuito/tests';

function Counter() {
  const count = signal(0);

  return (
    <VStack>
      <Text>{String(count.value)}</Text>
      <Button onPress={() => (count.value += 1)}>Add</Button>
    </VStack>
  );
}

// Changing a label's text makes no view and writes no prop it already had.
const none: CostCounter[] = ['viewsCreated', 'wastedPropWrites'];

test('adding only rewrites the label', async () => {
  await render(<Counter />);

  const cost = await costOf(() => press(screen.getByText('Add')));

  for (const counter of none) assert.equal(cost[counter], 0, counter);
});
