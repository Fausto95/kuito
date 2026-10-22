import { Button, Show, Text, VStack, signal } from 'kuito';
import { assert, press, render, screen, test, type PropValue } from 'kuito/tests';

function Alarm() {
  const armed = signal(false);

  return (
    <VStack>
      <Show when={armed.value}>
        <Text color="#ff3b30">Armed</Text>
      </Show>
      <Button onPress={() => (armed.value = true)}>Arm</Button>
    </VStack>
  );
}

// A color crosses as a 0xRRGGBBAA number.
const red: PropValue = { type: 'color', value: 0xff3b30ff };

test('arming shows a red warning', async () => {
  const app = await render(<Alarm />);
  const before = app.mutations.length;

  await press(screen.getByText('Arm'));

  const color = app.mutations
    .slice(before)
    .find((mutation) => mutation.op === 'prop' && mutation.name === 'color');

  assert.equal(color?.op === 'prop' && color.value, red.value);
});
