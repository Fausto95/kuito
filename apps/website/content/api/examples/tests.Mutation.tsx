import { Button, Show, Text, VStack, signal } from 'kuito';
import { assert, press, render, screen, test, type Mutation } from 'kuito/tests';

function Alarm() {
  const armed = signal(false);

  return (
    <VStack>
      <Show when={armed.value}>
        <Text>Armed</Text>
      </Show>
      <Button onPress={() => (armed.value = true)}>Arm</Button>
    </VStack>
  );
}

const created = (mutations: readonly Mutation[]) =>
  mutations.filter((mutation) => mutation.op === 'create').map((mutation) => mutation.kind);

test('arming adds one label, and nothing else', async () => {
  const app = await render(<Alarm />);
  const before = app.mutations.length;

  await press(screen.getByText('Arm'));

  assert.deepEqual(created(app.mutations.slice(before)), ['Text']);
});
