// Check keyed list updates.
import { Button, List, Text, VStack, signal } from 'kuito';
import { assert, press, render, screen, test, type KeyEdit } from 'kuito/tests';

function Queue() {
  const songs = signal([
    { id: 'a', title: 'Intro' },
    { id: 'b', title: 'Outro' },
  ]);

  return (
    <VStack flex={1}>
      <Button onPress={() => (songs.value = [...songs.value].reverse())}>Reverse</Button>
      <List data={songs} renderItem={({ item }) => <Text>{item.title}</Text>} />
    </VStack>
  );
}

test('reversing moves rows by key instead of rebuilding them', async () => {
  const app = await render(<Queue />);
  const before = app.mutations.length;

  await press(screen.getByText('Reverse'));

  const edits: KeyEdit[] = app.mutations
    .slice(before)
    .flatMap((mutation) =>
      mutation.op === 'prop' && mutation.type === 'keys' ? mutation.value : [],
    );

  assert.ok(edits.length > 0);
  assert.ok(edits.every((edit) => edit.op === 'move'));
});
