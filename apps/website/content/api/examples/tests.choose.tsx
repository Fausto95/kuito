// Select a native control option.
import { Select, Text, VStack, signal } from 'kuito';
import { assert, choose, render, screen, test } from 'kuito/tests';

function Sort() {
  const order = signal('new');

  return (
    <VStack>
      <Select
        label="Sort by"
        value={order}
        options={[
          { value: 'new', label: 'Newest' },
          { value: 'top', label: 'Most liked' },
        ]}
      />
      <Text>{order.value}</Text>
    </VStack>
  );
}

test('picking an option sets the order', async () => {
  await render(<Sort />);

  await choose(screen.getByRole('combobox', { name: 'Sort by' }), 'Most liked');

  assert.ok(screen.getByText('top'));
});
