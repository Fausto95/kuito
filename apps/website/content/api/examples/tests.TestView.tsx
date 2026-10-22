// Inspect the rendered native tree.
import { HStack, Text } from 'kuito';
import { assert, render, screen, test, type TestView } from 'kuito/tests';

const Row = () => (
  <HStack padding={16} gap={8}>
    <Text>Total</Text>
    <Text>$12.50</Text>
  </HStack>
);

// Where layout put a view, relative to its parent, in points.
const leftOf = (view: TestView) => view.frame.x;

test('the amount sits after the label', async () => {
  await render(<Row />);

  const label = screen.getByText('Total');
  const amount = screen.getByText('$12.50');

  assert.equal(label.parent?.kind, 'HStack');
  assert.ok(leftOf(amount) > leftOf(label) + label.frame.width);
});
