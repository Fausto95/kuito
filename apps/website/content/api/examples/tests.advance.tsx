import { Text, onMount, signal } from 'kuito';
import { advance, assert, render, screen, test } from 'kuito/tests';

function Toast() {
  const shown = signal(true);

  onMount(() => {
    setTimeout(() => (shown.value = false), 3000);
  });

  return <Text hidden={!shown.value}>Saved</Text>;
}

test('the toast hides after three seconds', async () => {
  await render(<Toast />);

  await advance(2999);
  assert.ok(screen.queryByText('Saved'));

  await advance(1);
  assert.equal(screen.queryByText('Saved'), null);
});
