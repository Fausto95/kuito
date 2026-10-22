import { Pressable, Text, signal } from 'kuito';
import { assert, press, render, screen, test, type PressOptions } from 'kuito/tests';

function Message() {
  const menu = signal(false);

  return (
    <Pressable onLongPress={() => (menu.value = true)}>
      <Text>Hello there</Text>
      <Text hidden={!menu.value}>Reply</Text>
    </Pressable>
  );
}

const hold: PressOptions = { long: true };

test('holding a message opens its menu', async () => {
  await render(<Message />);

  await press(screen.getByText('Hello there'), hold);

  assert.ok(screen.getByText('Reply'));
});
