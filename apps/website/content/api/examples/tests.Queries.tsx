// Scope queries to part of a screen.
import { Text, VStack } from 'kuito';
import { assert, render, screen, test, within, type Queries } from 'kuito/tests';

const Card = (props: { title: string; status: string }) => (
  <VStack>
    <Text>{props.title}</Text>
    <Text>{props.status}</Text>
  </VStack>
);

// The same queries over the whole screen or inside one view.
const cardOf = (scope: Queries, title: string) => scope.getByText(title).parent;

test('each card shows its own status', async () => {
  await render(
    <VStack>
      <Card title="Backup" status="Done" />
      <Card title="Sync" status="Running" />
    </VStack>,
  );

  const sync = cardOf(screen, 'Sync');

  assert.ok(sync);
  assert.ok(within(sync).getByText('Running'));
  assert.equal(within(sync).queryByText('Done'), null);
});
