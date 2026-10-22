import { Button, Text, VStack, signal } from 'kuito';
import { assert, press, render, screen, test } from 'kuito/tests';

function Counter() {
  const count = signal(0);

  return (
    <VStack>
      <Text>{String(count.value)}</Text>
      <Button onPress={() => (count.value += 1)}>Add one</Button>
    </VStack>
  );
}

test('Add one counts the presses', async () => {
  await render(<Counter />);

  await press(screen.getByText('Add one'));

  assert.ok(screen.getByText('1'));
});
