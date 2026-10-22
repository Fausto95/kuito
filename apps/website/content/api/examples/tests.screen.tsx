// Query the rendered screen.
import { Button, Text, VStack } from 'kuito';
import { assert, render, screen, test } from 'kuito/tests';

const Empty = () => (
  <VStack>
    <Text>No messages yet</Text>
    <Button>Write one</Button>
  </VStack>
);

test('an empty inbox invites a first message', async () => {
  await render(<Empty />);

  assert.ok(screen.getByText('No messages yet'));
  assert.ok(screen.getByRole('button', { name: 'Write one' }));
  assert.equal(screen.queryByText('Inbox'), null);
});
