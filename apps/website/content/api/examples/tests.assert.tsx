// Assert the result of a user action.
import { Text } from 'kuito';
import { assert, render, screen, test } from 'kuito/tests';

const Price = (props: { cents: number }) => <Text>{`$${(props.cents / 100).toFixed(2)}`}</Text>;

test('prices show two decimals', async () => {
  await render(<Price cents={1250} />);

  const label = screen.getByText(/^\$/);

  assert.equal(label.text, '$12.50');
  assert.match(label.text ?? '', /\.\d{2}$/);
});
