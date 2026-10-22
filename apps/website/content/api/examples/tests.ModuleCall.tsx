// Assert calls to a native capability.
import { Button, haptics } from 'kuito';
import { assert, press, render, screen, test, type ModuleCall } from 'kuito/tests';

const Confirm = () => <Button onPress={() => void haptics.notification('success')}>Confirm</Button>;

const named = (calls: readonly ModuleCall[], module: string) =>
  calls.filter((call) => call.module === module);

test('confirming plays a success haptic', async () => {
  const app = await render(<Confirm />, { modules: { Haptics: { notification: () => {} } } });

  await press(screen.getByText('Confirm'));

  assert.deepEqual(
    named(app.calls, 'Haptics').map((call) => [call.name, call.args]),
    [['notification', ['success']]],
  );
});
